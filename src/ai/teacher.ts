"use client";
// teachForm: the cloud half. It sends ONLY the empty form's structure
// (title, keys, captions, select options) to an ONLY_IN_CLOUD model and gets
// plain-words hints back. No paste text is ever part of this payload; the
// egress ledger checks that on every request. The Teach drawer is the UI.
import type { FormSpec } from "@/forms/types";
import { sanitizeHint, type Hint } from "@/schema/buildSchema";
import { teacherModel } from "./models";
import { withTimeout } from "@/lib/timeout";

export type TeacherPayload = { title: string; fields: { key: string; caption: string; options?: string[] }[] };

export function teacherPayload(form: FormSpec): TeacherPayload {
  return {
    title: form.title,
    fields: form.fields.map((f) => ({ key: f.key, caption: f.label, ...(f.options ? { options: f.options.map((o) => o.value) } : {}) })),
  };
}

export const TEACHER_INSTRUCTION =
  "You explain the boxes of an EMPTY web form. For each field key, say in plain words (under 80 characters, letters, digits and " +
  "basic punctuation only) what a person should type there, and pick the expected kind. Only the form structure is given; there is " +
  "no customer data.";

export function teacherPrompt(p: TeacherPayload): string {
  return `${TEACHER_INSTRUCTION}\n\n${JSON.stringify(p, null, 1)}`;
}

export type TeachResult = { hints: Hint[]; dropped: number; inferenceSource?: string; ms: number; payload: TeacherPayload };

export async function teachForm(form: FormSpec, modelName: string, timeoutMs = 20000): Promise<TeachResult> {
  const payload = teacherPayload(form);
  const t0 = performance.now();
  const r = await withTimeout(teacherModel(modelName).generateContent(teacherPrompt(payload)), timeoutMs, `teacher: no answer within ${timeoutMs} ms`);
  const parsed: unknown = JSON.parse(r.response.text());
  const keys = new Set(form.fields.map((f) => f.key));
  // the schema asks for {hints: [...]}, but the answer is still untrusted: any other shape is "no usable hints", never a TypeError
  const list = parsed && typeof parsed === "object" ? (parsed as { hints?: unknown }).hints : undefined;
  const raw: Partial<Hint>[] = Array.isArray(list) ? list.filter((h): h is Partial<Hint> => !!h && typeof h === "object") : [];
  const hints = raw.map(sanitizeHint).filter((h): h is Hint => !!h && keys.has(h.key));
  if (!hints.length) throw new Error(`teacher: no usable hints (${raw.length} returned, ${raw.length - hints.length} dropped by the checks)`);
  return { hints, dropped: raw.length - hints.length, inferenceSource: r.response.inferenceSource, ms: Math.round(performance.now() - t0), payload };
}
