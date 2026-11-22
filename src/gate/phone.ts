// phone: the value's digits must equal ONE whole digit run in the paste.
// Runs may be split only by space, '-', '.', '(', ')' (never a newline);
// +62 / 62 is normalised to 0; 9-15 digits starting with 0 or written with +. Two or more distinct phone-like
// runs -> always amber with both as chips, whatever the model chose.
import { digits, type Span } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export type PhoneRun = { digits: string; display: string; span: Span; alts: { digits: string; span: Span }[] };

const RUN = /\+?\d(?:[ \t\-.()]{0,2}\d)*/g;

/** +62 / 62 -> 0, only for "+62…" or a bare "628…" (Indonesian mobile); other digit runs are left alone. */
export const normPhone = (d: string, raw = "") =>
  d.startsWith("62") && (raw.trim().startsWith("+") || d[2] === "8") ? "0" + d.slice(2) : d;

const qualifies = (raw: string, d: string) => d.length >= 9 && d.length <= 15 && (d.startsWith("0") || raw.startsWith("+"));

type Group = { text: string; start: number; end: number; nd: number };

/**
 * Phone-like runs. A raw run of digits/separators is split into space-separated groups, then:
 *  - a group starting with 0 or + after >= 9 digits starts a NEW candidate ("0812-… 0813-…" = two phones);
 *  - leading groups are dropped until the rest is phone-like ("No. 12 0812 5550 7734", "50241 0812 …");
 *  - a short trailing group ("0812 5550 7734 12") is kept as an alternative reading, never a separate phone.
 */
export function phoneRuns(paste: string): PhoneRun[] {
  const out: PhoneRun[] = [];
  const seen = new Set<string>();
  for (const m of paste.matchAll(RUN)) {
    const groups: Group[] = [];
    for (const g of m[0].matchAll(/[^ \t]+/g)) {
      const start = m.index! + g.index!;
      groups.push({ text: g[0], start, end: start + g[0].length, nd: digits(g[0]).length });
    }
    const chunks: Group[][] = [];
    let cur: Group[] = [];
    for (const g of groups) {
      const curDigits = cur.reduce((n, x) => n + x.nd, 0);
      if (curDigits >= 9 && /^[0+]/.test(g.text)) {
        chunks.push(cur);
        cur = [];
      }
      cur.push(g);
    }
    if (cur.length) chunks.push(cur);
    for (const chunk of chunks) {
      for (let st = 0; st < chunk.length; st++) {
        const part = chunk.slice(st);
        const raw = paste.slice(part[0].start, part[part.length - 1].end);
        const d = normPhone(digits(raw), raw);
        if (!qualifies(raw, d)) continue;
        if (!seen.has(d)) {
          seen.add(d);
          const alts: PhoneRun["alts"] = [];
          const last = part[part.length - 1];
          if (part.length > 1 && last.nd <= 3) {
            const rawT = paste.slice(part[0].start, part[part.length - 2].end);
            const dT = normPhone(digits(rawT), rawT);
            if (qualifies(rawT, dT)) alts.push({ digits: dT, span: [part[0].start, part[part.length - 2].end] });
          }
          out.push({ digits: d, display: raw, span: [part[0].start, last.end], alts });
        }
        break;
      }
    }
  }
  return out;
}

export function gatePhone(paste: string, proposed: string): GateResult {
  const runs = phoneRuns(paste);
  const d = normPhone(digits(proposed), proposed);
  const exact = runs.find((r) => r.digits === d);
  const alt = exact ? undefined : runs.flatMap((r) => r.alts).find((a) => a.digits === d);
  const hit = exact ?? (alt ? { digits: alt.digits, span: alt.span } : undefined);
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
