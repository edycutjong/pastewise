// enum: one of the select's options, and the option word (its value, its
// visible text, or a fixed synonym) appears in the paste. Near-misses such as
// "2 beds" are deliberately NOT synonyms.
import { normalize, findWords, type Span } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export const SYNONYMS: Record<string, string[]> = {
  exp: ["express", "exp", "kilat"],
  std: ["standard", "regular", "reguler", "std"],
  sdd: ["same day", "same-day", "sameday", "sdd"],
  double: ["double"],
  single: ["single"],
  suite: ["suite"],
};

export function enumEvidence(paste: string, option: { value: string; text: string }): Span[] {
  const norm = normalize(paste);
  const words = new Set([option.value, option.text, ...(SYNONYMS[option.value.toLowerCase()] ?? [])].map((w) => normalize(w).text));
  for (const w of words) {
    const s = findWords(norm, w);
    if (s.length) return s;
  }
  return [];
}

export function gateEnum(paste: string, proposed: string, options: { value: string; text: string }[]): GateResult {
  const v = proposed.trim();
  if (!v) return empty(proposed);
  const opt = options.find((o) => o.value === v) ?? options.find((o) => o.value.toLowerCase() === v.toLowerCase());
  if (!opt) return amber("format", "", proposed);
  const spans = enumEvidence(paste, opt);
  return spans.length ? found(opt.value, proposed, spans) : amber("not_in_text", "", proposed);
}
