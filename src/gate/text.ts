// text (and name / address / item / notes roles): after cleanup, the value
// must be a normalised (case, whitespace, punctuation) word-aligned substring
// of the paste. The box then shows the words exactly as the paste has them.
import type { Role } from "@/forms/types";
import { cleanNote, hasMultipleNames, stripAddressTail, stripHonorifics, stripQuantity } from "./cleanup";
import { findWords, normalize } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export function cleanFor(role: Role, v: string): string {
  switch (role) {
    case "name":
      return stripHonorifics(v);
    case "item":
      return stripQuantity(v);
    case "address":
      return stripAddressTail(v);
    default:
      return v.trim();
  }
}

export function gateText(paste: string, proposed: string, role: Role): GateResult {
  if (!proposed.trim()) return empty(proposed);
  let v = cleanFor(role, proposed);
  if (role === "notes") {
    const n = cleanNote(proposed);
    if (n.content === 0) return empty(proposed);
    v = n.value;
    if (n.content < 2) {
      const hit = findWords(normalize(paste), normalize(v).text);
      return amber("too_few_words", "", proposed, { spans: hit });
    }
  }
  if (role === "name" && hasMultipleNames(v)) return amber("more_than_one_name", "", proposed);
  const needle = normalize(v).text;
  if (!needle) return empty(proposed);
  const spans = findWords(normalize(paste), needle);
  if (!spans.length) return amber("not_in_text", "", proposed);
  const [a, b] = spans[0];
  return found(paste.slice(a, b), proposed, spans.slice(0, 1));
}
