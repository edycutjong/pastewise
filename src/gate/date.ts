// date: ISO YYYY-MM-DD; day AND month must be evidenced in the paste (numeric
// day-first or a month name). No 4-digit year in the evidence -> code sets the
// next occurrence on/after today and marks amber "year assumed". A model year
// that the paste does not support is replaced, never accepted.
import type { Span } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Indonesian month names that do not share the English prefix
const MONTH_ALIASES: Record<string, number> = { mei: 5, agu: 8, agt: 8, okt: 10, des: 12, peb: 2 };
const MON = "(jan(?:uary|uari)?|feb(?:ruary|ruari)?|peb(?:ruari)?|mar(?:ch|et)?|apr(?:il)?|may|mei|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|agu(?:stus)?|agt|sep(?:t(?:ember)?)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?|des(?:ember)?)\\.?";

export type DateEvidence = { d: number; m: number; y?: number; span: Span };

const monthNum = (w: string) => {
  const k = w.toLowerCase().replace(/\.$/, "");
  return MONTH_ALIASES[k.slice(0, 3)] ?? MONTHS.indexOf(k.slice(0, 3)) + 1;
};
const fullYear = (y?: string) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : undefined);
const valid = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export function dateEvidence(paste: string): DateEvidence[] {
  const ev: DateEvidence[] = [];
  const push = (d: number, m: number, y: number | undefined, idx: number, len: number) => {
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) ev.push({ d, m, y, span: [idx, idx + len] });
  };
  for (const x of paste.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) push(+x[3], +x[2], +x[1], x.index!, x[0].length);
  for (const x of paste.matchAll(/(?<![\d-])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?(?![\d/.]\d)/g))
    push(+x[1], +x[2], fullYear(x[3]), x.index!, x[0].length);
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s-]+${MON}(?:,?[\\s-]+(\\d{4}))?(?![a-z])`, "gi");
  for (const x of paste.matchAll(dm)) push(+x[1], monthNum(x[2]), fullYear(x[3]), x.index!, x[0].length);
  const md = new RegExp(`\\b${MON}[\\s-]+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?!\\d)`, "gi");
  for (const x of paste.matchAll(md)) push(+x[2], monthNum(x[1]), fullYear(x[3]), x.index!, x[0].length);
  return ev;
}

/** Next occurrence of day/month on or after `today` (YYYY-MM-DD). */
export function nextOccurrence(d: number, m: number, today: string): number {
  const [ty, tm, td] = today.split("-").map(Number);
  let y = m > tm || (m === tm && d >= td) ? ty : ty + 1;
  while (!valid(y, m, d) && y < ty + 8) y++; // 29 Feb
  return y;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function gateDate(paste: string, proposed: string, today: string): GateResult {
  const v = proposed.trim();
  if (!v) return empty(proposed);
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!p || !valid(+p[1], +p[2], +p[3])) return amber("format", "", proposed);
  const [y, m, d] = [+p[1], +p[2], +p[3]];
  const ev = dateEvidence(paste).filter((e) => e.d === d && e.m === m);
  if (!ev.length) return amber("not_in_text", "", proposed);
  const withYear = ev.find((e) => e.y !== undefined);
  if (withYear) {
    if (withYear.y === y && valid(y, m, d)) return found(v, proposed, [withYear.span]);
    // the paste states a different year: use the paste's, but make the person look
    return amber("format", "", proposed);
  }
  const ay = nextOccurrence(d, m, today);
  return amber("year_assumed", iso(ay, m, d), proposed, { year: ay, spans: [ev[0].span] });
}
