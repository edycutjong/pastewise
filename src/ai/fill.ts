"use client";
// fillBatch / fillForm: the customer-text path. ONLY_ON_DEVICE, so there is
// no cloud fallback here at all. One call per batch (batch_max_fields), a
// 10 s timeout, one retry on a FRESH model instance, then the batch goes amber
// "timed out". The SDK fixes promptOptions at construction and has no abort,
// so a late answer is simply ignored (the run id check lives in the caller).
import type { FieldSpec, FormSpec } from "@/forms/types";
import { batches, checkAnswer, toJsonSchema } from "@/schema/buildSchema";
import { buildPrompt } from "./prompt";
import { deviceModel } from "./models";

export type BatchResult = {
  keys: string[];
  status: "ok" | "timed_out" | "invalid";
  values: Record<string, string>;
  inferenceSource?: string;
  ms: number; // model time for the successful attempt (or total when failed)
  attempts: number;
  raw?: string;
  error?: string;
};

const TIMEOUT = Symbol("timeout");

async function once(fields: FieldSpec[], title: string, paste: string, today: string, timeoutMs: number) {
  const schema = toJsonSchema(fields);
  const model = deviceModel(schema); // fresh instance per attempt
  const t0 = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((r) => (timer = setTimeout(() => r(TIMEOUT), timeoutMs)));
  try {
    const r = await Promise.race([model.generateContent(buildPrompt(title, fields, paste, today)), timeout]);
    const ms = Math.round(performance.now() - t0);
    if (r === TIMEOUT) return { kind: "timeout" as const, ms };
    const raw = r.response.text();
    const values = checkAnswer(raw, schema);
    return values
      ? { kind: "ok" as const, ms, raw, values, inferenceSource: r.response.inferenceSource as string | undefined }
      : { kind: "invalid" as const, ms, raw, inferenceSource: r.response.inferenceSource as string | undefined };
  } catch (e) {
    return { kind: "error" as const, ms: Math.round(performance.now() - t0), error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function fillBatch(
  fields: FieldSpec[],
  title: string,
  paste: string,
  today: string,
  timeoutMs: number,
  onRetry?: () => void,
): Promise<BatchResult> {
  const keys = fields.map((f) => f.key);
  let total = 0;
  let last: Awaited<ReturnType<typeof once>> | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) onRetry?.();
    last = await once(fields, title, paste, today, timeoutMs);
    total += last.ms;
    if (last.kind === "ok") return { keys, status: "ok", values: last.values, inferenceSource: last.inferenceSource, ms: last.ms, attempts: attempt, raw: last.raw };
  }
  const l = last!;
  return {
    keys,
    status: l.kind === "invalid" ? "invalid" : "timed_out",
    values: {},
    inferenceSource: "inferenceSource" in l ? l.inferenceSource : undefined,
    ms: total,
    attempts: 2,
    raw: "raw" in l ? l.raw : undefined,
    error: "error" in l ? l.error : l.kind === "timeout" ? `no answer within ${timeoutMs} ms` : undefined,
  };
}

/** Fills every batch of a form in order; calls onBatch as each one lands. */
export async function fillForm(
  form: FormSpec,
  paste: string,
  opts: { today: string; timeoutMs: number; batchMax: number; onBatch?: (b: BatchResult) => void; onRetry?: () => void },
): Promise<BatchResult[]> {
  const out: BatchResult[] = [];
  for (const b of batches(form.fields, opts.batchMax)) {
    const r = await fillBatch(b, form.title, paste, opts.today, opts.timeoutMs, opts.onRetry);
    out.push(r);
    opts.onBatch?.(r);
  }
  return out;
}
