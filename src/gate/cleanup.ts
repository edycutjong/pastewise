// Field cleanup, applied to the model's value BEFORE the found-in-paste check.
// Each rule comes from a kill-test failure class (quantity glued to the item,
// city appended to the street, honorifics, notes that are only "thx!!").
import { NUMBER_WORDS } from "./number";
import { normalize } from "./normalize";

const HONORIFIC = /^(?:mr|mrs|ms|miss|mx|dr|bu|ibu|pak|bapak|kak|mas|mbak|sdr|sdri)\.?\s+/i;
const NUMW = NUMBER_WORDS.slice(1).join("|");
const UNIT = "(?:x|pcs?|pieces?|units?|buah|qty)";

export function stripHonorifics(v: string): string {
  let s = v.trim();
  while (HONORIFIC.test(s)) s = s.replace(HONORIFIC, "");
  return s;
}

export const hasMultipleNames = (v: string) => /\s(?:and|dan|&)\s|\s&|&\s/i.test(` ${v} `);

export function stripQuantity(v: string): string {
  return v
    .trim()
    .split(/(?<=[.!?])\s+/)[0] // an item is one phrase: drop a following sentence
    .replace(/[.!?]+$/, "")
    .replace(new RegExp(`^(?:x\\s*)?(?:\\d{1,3}|${NUMW})\\s*${UNIT}?\\s+`, "i"), "")
    .replace(new RegExp(`\\s*(?:,\\s*)?(?:x\\s*\\d{1,3}|\\d{1,3}\\s*${UNIT})$`, "i"), "")
    .replace(/\s*\([^()]*\)?\s*$/, "") // trailing aside: "linen tablecloths (the sage ones)"
    .replace(/^(?:box|boxes|pack|packs|packet|packets|unit|units|piece|pieces)\s+of\s+/i, "") // "4 box of batik scarves"
    .trim();
}

/** "Jl. Diponegoro 88, Semarang 50241" -> "Jl. Diponegoro 88" (a trailing segment with no digits after one that has them). */
export function stripAddressTail(v: string): string {
  let s = v.trim().replace(/[,\s]*\b\d{5}\s*$/, "").trim();
  for (;;) {
    const i = s.lastIndexOf(",");
    if (i < 0) break;
    const head = s.slice(0, i).trim();
    const tail = s.slice(i + 1).trim();
    if (/\d/.test(tail) || !/\d/.test(head)) break;
    s = head;
  }
  return s.replace(/[,.\s]+$/, "");
}

export const NOTE_STOP = new Set(
  ("hi hii hiii hello hey halo hai please pls plz thanks thank thx ty tq tks you makasih terima kasih ya yah ok okay oke kak sis gan " +
    "bro dear regards cheers god bless amen").split(" "),
);

/** Strips emoji and greeting/politeness words from both ends; returns the note and its content-word count. */
export function cleanNote(v: string): { value: string; content: number } {
  let s = v.replace(/\p{Extended_Pictographic}|️|‍/gu, " ").replace(/\s+/g, " ").trim();
  const toks = s.split(" ");
  const isStop = (t: string) => {
    const n = normalize(t).text;
    return n === "" || NOTE_STOP.has(n);
  };
  while (toks.length && isStop(toks[0])) toks.shift();
  while (toks.length && isStop(toks[toks.length - 1])) toks.pop();
  s = toks.join(" ").replace(/^[\s,.;:!?-]+|[\s,;:!?-]+$/g, "").trim();
  const content = normalize(s)
    .text.split(" ")
    .filter((w) => w.length >= 2 && !NOTE_STOP.has(w)).length;
  return { value: s, content };
}
