// postal: 5 digits (Indonesia) or 3-10 letters/digits with at least one digit,
// present in the paste as a whole token.
import { normalize, findWords } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export function gatePostal(paste: string, proposed: string): GateResult {
  const v = proposed.trim();
  if (!v) return empty(proposed);
  if (!/^\d{5}$/.test(v) && !(/^[A-Za-z0-9 -]{3,10}$/.test(v) && /\d/.test(v))) return amber("format", "", proposed);
  const spans = findWords(normalize(paste), normalize(v).text);
  return spans.length ? found(v, proposed, spans) : amber("not_in_text", "", proposed);
}
