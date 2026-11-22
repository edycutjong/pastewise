// phone: the value's digits must equal ONE whole digit run in the paste.
// Runs may be split only by space, '-', '.', '(', ')' (never a newline);
// +62 / 62 is normalised to 0; 9-15 digits. Two or more distinct phone-like
// runs -> always amber with both as chips, whatever the model chose.
import { digits, type Span } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export type PhoneRun = { digits: string; display: string; span: Span };

const RUN = /\+?\d(?:[ \t\-.()]{0,2}\d)*/g;

export const normPhone = (d: string) => (d.startsWith("62") ? "0" + d.slice(2) : d);

export function phoneRuns(paste: string): PhoneRun[] {
  const out: PhoneRun[] = [];
  const seen = new Set<string>();
  for (const m of paste.matchAll(RUN)) {
    const d = normPhone(digits(m[0]));
    if (d.length < 9 || d.length > 15) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push({ digits: d, display: m[0].trim(), span: [m.index!, m.index! + m[0].length] });
  }
  return out;
}

export function gatePhone(paste: string, proposed: string): GateResult {
  const runs = phoneRuns(paste);
  const d = normPhone(digits(proposed));
  const hit = runs.find((r) => r.digits === d);
  if (runs.length >= 2) {
    return amber("two_candidates", hit ? hit.digits : "", proposed, {
      candidates: runs.map((r) => ({ value: r.digits, display: r.display, span: r.span })),
    });
  }
  if (!proposed.trim()) return empty(proposed);
  if (!/^[+\d][\d\s\-().+]*$/.test(proposed.trim()) || d.length < 9 || d.length > 15) return amber("format", "", proposed);
  if (!hit) return amber("not_in_text", "", proposed);
  return found(hit.digits, proposed, [hit.span]);
}
