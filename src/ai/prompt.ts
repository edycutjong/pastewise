// On-device fill prompt. The guide is the kill-test v3 text verbatim (rules +
// one worked example; v2 -> v3 cut accepted-wrong 8.1% -> 1.9% in that test,
// so the example is load-bearing). Change it only with a new PROMPT_VERSION
// and a dev-set measurement; the version is recorded in every bench row.
import type { FieldSpec } from "@/forms/types";

export const PROMPT_VERSION = "p0c-v3";

export const GUIDE =
  `You fill in a web form from a message the user copied. Read the message and return JSON with one string value per form field. Copy each value exactly as it is written in the message. If the message does not give a field, return an empty string "". Never guess.` +
  `\nRules: phone = digits as written (keep a leading + or 0); date = YYYY-MM-DD (today's date is given; use it only to fill in a missing year); quantity = digits only; room type must be one of the options or "". Do not invent a province, name, email or note that is not in the message. Ignore numbers that are not the field asked for (booking numbers, old phone numbers the sender says to ignore).` +
  `\nExample message: "Hi, Ali here, want 3 red mugs to Jl. Baru 1, Kediri, 64100. call me 0812 000 111" for fields name, phone, street, city, province, postal_code, item, quantity, notes -> {"name":"Ali","phone":"0812000111","street":"Jl. Baru 1","city":"Kediri","province":"","postal_code":"64100","item":"red mugs","quantity":"3","notes":""}`;

export function fieldLine(f: FieldSpec): string {
  const hint = f.hint ? ` (${f.hint})` : "";
  const opts = f.options?.length ? ` (one of: ${f.options.map((o) => o.value).join(", ")})` : "";
  return `- ${f.key}: ${f.label}${hint}${opts}`;
}

/** The Message block wrapping is also what the egress ledger matches for the consent total (src/ledger/egress.ts markConsentRun): keep them in step. */
export function buildPrompt(title: string, fields: FieldSpec[], paste: string, today: string): string {
  return `${GUIDE}\nToday: ${today}\nForm: ${title}\nFields:\n${fields.map(fieldLine).join("\n")}\n\nMessage:\n"""\n${paste}\n"""\n\nJSON:`;
}
