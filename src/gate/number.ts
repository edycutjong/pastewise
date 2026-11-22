// int (quantity, nights, pcs): digits only, 1-999, and the number appears in
// the paste as a standalone number or a number word (one-twenty).
import { normalize } from "./normalize";
import { amber, empty, found, type GateResult } from "./types";

export const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const ID_WORDS = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh"];

/** "2", "2 pcs", "x2", "two" -> 2; anything else -> null */
export function parseCount(v: string): number | null {
  const s = v.trim().toLowerCase();
  const m = /^(?:x\s*)?(\d{1,3})\s*(?:x|pcs?|pieces?|units?|nights?|malam)?$/.exec(s);
  if (m) return Number(m[1]);
  const w = NUMBER_WORDS.indexOf(s);
  return w >= 0 ? w : null;
}

export function gateInt(paste: string, proposed: string): GateResult {
  if (!proposed.trim()) return empty(proposed);
  const n = parseCount(proposed);
  if (n === null || n < 1 || n > 999) return amber("format", "", proposed);
  const spans: [number, number][] = [];
  for (const x of paste.matchAll(/(?<![\d.,:/-])\d{1,3}(?![\d:/]|[.,]\d)/g)) if (Number(x[0]) === n) spans.push([x.index!, x.index! + x[0].length]);
  if (!spans.length) {
    const norm = normalize(paste);
    const words = [NUMBER_WORDS[n], ID_WORDS[n]].filter(Boolean);
    for (const w of words) {
      const at = ` ${norm.text} `.indexOf(` ${w} `);
      if (at >= 0) spans.push([norm.map[at], norm.map[at + w.length - 1] + 1]);
    }
  }
  return spans.length ? found(String(n), proposed, spans.slice(0, 1)) : amber("not_in_text", "", proposed);
}
