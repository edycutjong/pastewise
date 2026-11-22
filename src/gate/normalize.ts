// Normalisation with an index map, so a match in normalised text can be
// reported as offsets into the ORIGINAL paste (for the source underlines).

export type Norm = { text: string; map: number[] };
export type Span = [number, number]; // [start, end) in the original paste

/** Lowercase, NFKC, every run of non letters/digits -> one space; keeps a map to original offsets. */
export function normalize(s: string): Norm {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  let i = 0;
  for (const ch of s) {
    const n = ch.normalize("NFKC").toLowerCase();
    if (/^[\p{L}\p{N}]+$/u.test(n)) {
      if (pendingSpace && text.length) {
        text += " ";
        map.push(i);
      }
      pendingSpace = false;
      for (const c of n) {
        text += c;
        map.push(i);
      }
    } else pendingSpace = true;
    i += ch.length;
  }
  return { text, map };
}

/** Finds `needle` (already normalised) in a normalised haystack at word boundaries; returns original-text spans. */
export function findWords(hay: Norm, needle: string, all = false): Span[] {
  if (!needle) return [];
  const spans: Span[] = [];
  const padded = ` ${hay.text} `;
  let from = 0;
  for (;;) {
    const at = padded.indexOf(` ${needle} `, from);
    if (at < 0) break;
    const start = at; // index in hay.text (padding shifts by one, the leading space cancels it)
    const end = start + needle.length;
    spans.push([hay.map[start], hay.map[end - 1] + 1]);
    if (!all) break;
    from = at + 1;
  }
  return spans;
}

export const digits = (s: string) => s.replace(/\D/g, "");

/** Words of a normalised string. */
export const words = (s: string) => normalize(s).text.split(" ").filter(Boolean);
