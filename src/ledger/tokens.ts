// Paste tokens: the pieces of a paste that the egress ledger looks for in
// every outbound request. Rule (kept identical in scripts/lib/tokens.mjs, a
// unit test checks they agree): digit runs of 4+ digits (each group, plus a
// phone number's digits joined) and normalised words of 4+ characters that are
// not in the empty form's own vocabulary (labels, names, options: what the
// teacher may legitimately send) and not on a common-English stop-list.
// Blind spots (stated on /receipt): tokens under 4 characters, text that was
// transformed (translated, re-encoded, hashed) before leaving the page.
import { normalize } from "@/gate/normalize";
import { phoneRuns } from "@/gate/phone";

export const STOP = new Set(
  ("this that with from have please thanks thank there their they them then than what when where which while your yours will would " +
    "could should about just been were more some like need want send sent time only into over also here make much very well back good " +
    "know take come going does done dont cant wont didnt isnt again before after every once this next last week today tomorrow " +
    "hello order name phone address street city province postal code item items quantity notes email date room nights").split(" "),
);

export function pasteTokens(paste: string, vocab: string[] = []): string[] {
  const vocabWords = new Set(vocab.flatMap((v) => normalize(v).text.split(" ")));
  const out = new Set<string>();
  for (const w of normalize(paste).text.split(" ")) {
    if (w.length < 4) continue;
    if (/^\d+$/.test(w)) out.add(w);
    else if (/\p{L}/u.test(w) && !vocabWords.has(w) && !STOP.has(w)) out.add(w);
  }
  for (const r of phoneRuns(paste)) out.add(r.digits);
  return [...out];
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;

function variants(s: string): string[] {
  const v = [s];
  try {
    v.push(decodeURIComponent(s.replace(/\+/g, " ")));
  } catch {
    /* not URI-encoded */
  }
  v.push(s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(["\\/])/g, "$1").replace(/\\n/g, " "));
  return v;
}

/** Distinct paste tokens found in a request's URL + body; bytes = their UTF-8 length. */
export function tokensFound(text: string, tokens: string[]): { hits: string[]; bytes: number } {
  if (!text || !tokens.length) return { hits: [], bytes: 0 };
  const vs = variants(text);
  const hay = vs.map((x) => ` ${normalize(x).text} `);
  const joined = vs.map((x) => x.replace(/(\d)[ \t\-.()]+(?=\d)/g, "$1")); // "0857 5550 8812" -> one run
  const hits = tokens.filter((t) => {
    if (!/^\d+$/.test(t)) return hay.some((h) => h.includes(` ${t} `));
    const re = new RegExp(`(^|\\D)${t}(\\D|$)`);
    return vs.some((x) => re.test(x)) || joined.some((x) => re.test(x));
  });
  return { hits, bytes: hits.reduce((n, t) => n + utf8(t), 0) };
}
