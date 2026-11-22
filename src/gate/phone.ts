// phone: the value's digits must equal ONE whole digit run in the paste.
// Runs may be split only by space, '-', '.', '(', ')' (never a newline);
// +62 / 62 is normalised to 0; 9-15 digits starting with 0 or written with +. Two or more distinct phone-like
// runs -> always amber with both as chips, whatever the model chose.
import { digits, type Span } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export type PhoneRun = { digits: string; display: string; span: Span };

const RUN = /\+?\d(?:[ \t\-.()]{0,2}\d)*/g;

/** +62 / 62 -> 0, only for "+62…" or a bare "628…" (Indonesian mobile); other digit runs are left alone. */
export const normPhone = (d: string, raw = "") =>
  d.startsWith("62") && (raw.trim().startsWith("+") || d[2] === "8") ? "0" + d.slice(2) : d;

const qualifies = (raw: string, d: string) => d.length >= 9 && d.length <= 15 && (d.startsWith("0") || raw.startsWith("+"));

export function phoneRuns(paste: string): PhoneRun[] {
  const out: PhoneRun[] = [];
  const seen = new Set<string>();
  for (const m of paste.matchAll(RUN)) {
    // a run may have swallowed a short number in front ("No. 12 0812 5550 7734", "50241 0812…"):
    // try the run, then the run without its leading space-separated groups, and keep the first phone-like one
    const text = m[0];
    const starts = [0, ...[...text.matchAll(/[ \t]+(?=[+\d])/g)].map((g) => g.index! + g[0].length)];
    for (const st of starts) {
      const raw = text.slice(st).trim();
      const d = normPhone(digits(raw), raw);
      if (!qualifies(raw, d)) continue;
      if (!seen.has(d)) {
        seen.add(d);
        out.push({ digits: d, display: raw, span: [m.index! + st, m.index! + text.length] });
      }
      break;
    }
  }
  return out;
}

export function gatePhone(paste: string, proposed: string): GateResult {
  const runs = phoneRuns(paste);
  const d = normPhone(digits(proposed), proposed);
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
