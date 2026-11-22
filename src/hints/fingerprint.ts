// A form's fingerprint is a SHA-256 over its empty structure only: title, field keys, captions, kinds'
// DOM facts and select options. Two sites with the same form share one saved hint set; no value is ever part of it.
import type { FormSpec } from "@/forms/types";

export function canonicalStructure(form: FormSpec): string {
  return JSON.stringify({
    t: form.title.trim().toLowerCase(),
    f: form.fields.map((f) => [f.key, f.label.trim().toLowerCase(), f.options ? f.options.map((o) => o.value) : null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
}

export async function formFingerprint(form: FormSpec): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStructure(form));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
