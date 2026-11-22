"use client";
// Saved teacher hints in Firestore, read-only for clients (firestore.rules). The builder's script seeds them from
// real teacher calls. A doc is untrusted input: every hint is re-validated (charset, length, known key) before use.
import { doc, getDoc, getFirestore } from "firebase/firestore";
import type { FormSpec } from "@/forms/types";
import { sanitizeHint, type Hint } from "@/schema/buildSchema";
import { firebase } from "@/lib/firebase";
import { withTimeout } from "@/lib/timeout";

export type SavedHints = { hints: Hint[]; seededAt: string; dropped: number };

/** Keeps only hints that pass sanitizeHint and name a key the form really has. Pure, so it is unit-tested. */
export function validateSaved(raw: unknown, form: FormSpec): SavedHints | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as { hints?: unknown; seededAt?: unknown };
  if (!Array.isArray(d.hints) || d.hints.length > 40) return null;
  const keys = new Set(form.fields.map((f) => f.key));
  const hints = d.hints.map((h) => sanitizeHint(h as Partial<Hint>)).filter((h): h is Hint => !!h && keys.has(h.key));
  if (!hints.length) return null;
  const seededAt = typeof d.seededAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(d.seededAt) ? d.seededAt.slice(0, 10) : "unknown date";
  return { hints, seededAt, dropped: d.hints.length - hints.length };
}

export async function readSaved(fp: string, form: FormSpec, timeoutMs = 6000): Promise<SavedHints | null> {
  const db = getFirestore(firebase().app);
  const snap = await withTimeout(getDoc(doc(db, "hints", fp)), timeoutMs, "saved hints: no answer");
  return snap.exists() ? validateSaved(snap.data(), form) : null;
}
