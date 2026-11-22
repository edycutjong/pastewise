#!/usr/bin/env node
// Gold checker for Pastewise eval sets (no dependencies).
//   node scripts/sets/check_gold.mjs sets/bench.json
// (a) every non-empty gold value must be DERIVABLE from its paste (documented conventions below),
//     and empty gold must mean the value is really not in the paste;
// (b) prints trap-coverage counts (heuristics over paste text) per group;
// (c) exits 1, listing every failing item (and, for set "bench", every unmet coverage target).
//
// Conventions accepted as "derivable":
//   names / street / city / province / item / notes : every normalised token (NFKC, lowercase, non-alnum split) occurs in the paste
//   phone    : digits after stripping spaces/dashes/dots/parens and +62 -> 0 occur in the paste; gold starts with 0
//   quantity / nights : a digit run or number word (english <=20, indonesian) in the paste; 1 also from a/an/one/single/satu
//   postal   : a standalone 5-digit run in the paste
//   check_in : ISO, d/m/yyyy, "D Month [YYYY]", "Month D [YYYY]" (ordinals, "of", Indonesian months); year-less = next
//              occurrence on/after `today`
//   svc / room_type : enum word (or synonym: regular/standard -> STD, express -> EXP, same day -> SDD) present, else ""
//   email    : literal address in the paste
// Also enforces set-authoring rules: invented phones only (5550 block / 0000), @example.* emails, paste length 80-900,
// unique ids, A/C twins agree, and none of the traits reserved for the held-out set (relative dates, RT/RW,
// two dates in one booking, From:/To: header lines).
import fs from "node:fs";
import path from "node:path";

const setPath = path.resolve(process.argv[2] ?? "sets/bench.json");
const set = JSON.parse(fs.readFileSync(setPath, "utf8"));
const today = new Date(set.today + "T00:00:00Z");

const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const toks = (s) => norm(s).split(" ").filter(Boolean);
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };

const PHONE_RE = /(?:\+62[\s-]?\d{2,4}|\b0\d{1,4})(?:[\s-]?\d{2,5}){1,3}/g;
const normPhone = (m) => { let d = m.replace(/\D/g, ""); if (m.trim().startsWith("+62")) d = "0" + d.slice(2); else if (d.startsWith("62")) d = "0" + d.slice(2); return d; };
function phoneCands(paste) {
  const out = new Set();
  for (const m of paste.matchAll(PHONE_RE)) { const d = normPhone(m[0]); if (d.length >= 9 && d.length <= 14) out.add(d); }
  return [...out];
}
// the only phone in the paste is the sender's own (recipient's number missing) -> gold empty is right
const senderOwnNumber = (paste) => [...paste.matchAll(PHONE_RE)].some((m) => /\b(i'?m on|my (number|phone|wa|hp)|mine( is)?|\(me\)|reach me)\b/i.test(paste.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)));
const stripPhones = (paste) => paste.replace(PHONE_RE, " ");

const MONTHS = { jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3, apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12 };
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function resolve(y, m, d) {
  if (y) return iso(y, m, d);
  const ty = today.getUTCFullYear();
  const cand = new Date(Date.UTC(ty, m - 1, d));
  return iso(cand >= today ? ty : ty + 1, m, d);
}
function dateCands(paste) {
  const out = new Set();
  for (const m of paste.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(iso(m[1], +m[2], +m[3]));
  for (const m of paste.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g)) out.add(iso(m[3], +m[2], +m[1]));
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})\\b\\.?(?:,?\\s*\\(?(20\\d\\d)\\)?)?`, "gi");
  for (const m of paste.matchAll(dm)) out.add(resolve(m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  const md = new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(20\\d\\d)\\b)?`, "gi");
  for (const m of paste.matchAll(md)) out.add(resolve(m[3], MONTHS[m[1].toLowerCase()], +m[2]));
  return [...out];
}
const numbersIn = (paste) => {
  const s = new Set();
  for (const m of paste.matchAll(/\d+/g)) s.add(String(+m[0]));
  for (const t of toks(paste)) if (t in NUMW) s.add(String(NUMW[t]));
  if (/\b(a|an|one|single|satu)\b/i.test(paste)) s.add("1");
  return s;
};

const SVC = { STD: /\b(std|standard|regular|reguler)\b/i, EXP: /\b(exp|express|expres|kilat)\b/i, SDD: /\bsame[- ]?day\b|\bsdd\b/i };
const ROOM = { single: /\bsingle\b/i, double: /\bdouble\b/i, suite: /\bsuite\b/i };

const ROLES = {
  A: { name: "name", phone: "phone", street: "street", city: "city", province: "province", postal: "postal_code", item: "item", qty: "quantity", notes: "notes" },
  C: { name: "cnee_nm", phone: "cnee_tel", street: "addr_1", city: "dist_city", province: "st_prov", postal: "zip", item: "desc", qty: "pcs", notes: "rmks", svc: "svc" },
  B: { name: "guest_name", phone: "phone", email: "email", room: "room_type", date: "check_in", qty: "nights", notes: "requests" },
};
const MAXLEN = { C: { cnee_nm: 40, addr_1: 60, dist_city: 40, st_prov: 40, desc: 60, rmks: 80 }, A: { name: 80, street: 120, city: 60, province: 60, item: 120, notes: 200 }, B: { guest_name: 80, requests: 200 } };

const RESERVED = [
  ["relative date", /\b(today|tomorrow|tonight|yesterday|besok|kemarin|lusa|hari ini)\b|\b(this|next|last|coming)\s+(mon|tue|wed|thu|fri|sat|sun|week|weekend|month)\w*|\bthe day after\b/i],
  ["RT/RW", /\bRT\b|\bRW\b|\bRT\.?\s?\d|\bRW\.?\s?\d/],
  ["From:/To: header", /^\s*>?\s*(from|to|cc)\s*:/im],
];

const fails = [];
const fail = (id, msg) => fails.push(`${id}: ${msg}`);

// ---- per-item checks ----
const seen = new Set();
const known = new Set();
for (const f of ["dev.json", "form-c-mid.json"]) {
  const p = path.join(path.dirname(setPath), f);
  if (fs.existsSync(p) && p !== setPath) for (const it of JSON.parse(fs.readFileSync(p, "utf8")).items) known.add(it.paste);
}
const byPaste = new Map();
for (const it of set.items) {
  const id = it.id;
  if (seen.has(id)) fail(id, "duplicate id");
  seen.add(id);
  const roles = ROLES[it.form];
  if (!roles) { fail(id, `unknown form ${it.form}`); continue; }
  const expectKeys = Object.values(roles).sort().join(",");
  if (Object.keys(it.gold).sort().join(",") !== expectKeys) fail(id, `gold keys ${Object.keys(it.gold).sort().join(",")} != ${expectKeys}`);
  const paste = it.paste, g = it.gold;
  if (paste.length < 80 || paste.length > 900) fail(id, `paste length ${paste.length} outside 80-900`);
  if (known.has(paste)) fail(id, "paste reused from dev/form-c-mid");
  for (const [k, v] of Object.entries(g)) if (typeof v !== "string") fail(id, `gold.${k} not a string`);
  for (const [k, n] of Object.entries(MAXLEN[it.form])) if ((g[k] ?? "").length > n) fail(id, `gold.${k} longer than field maxLength ${n}`);
  for (const [name, re] of RESERVED) if (re.test(paste)) fail(id, `reserved trait in paste: ${name}`);
  (byPaste.get(paste) ?? byPaste.set(paste, []).get(paste)).push(it);

  const pt = new Set(toks(paste));
  const tokenSubset = (role, v) => { const miss = toks(v).filter((t) => !pt.has(t)); if (miss.length) fail(id, `${role} "${v}": tokens not in paste: ${miss.join(" ")}`); };

  // synthetic-data hygiene
  for (const c of phoneCands(paste)) if (!/5550|0000/.test(c)) fail(id, `phone-like ${c} not in 5550/0000 block`);
  for (const m of paste.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) if (!/^example\.(com|org|net)$/i.test(m[1])) fail(id, `email domain ${m[1]} not example.*`);

  // phone
  const cands = phoneCands(paste);
  if (roles.phone) {
    const pv = g[roles.phone];
    if (pv) {
      if (!pv.startsWith("0") || /\D/.test(pv)) fail(id, `phone gold "${pv}" must be digits with leading 0`);
      const compact = paste.replace(/\+62/g, "0").replace(/[\s().-]/g, "");
      if (!compact.includes(pv)) fail(id, `phone gold ${pv} not found in paste`);
    } else if (cands.length === 1 && !senderOwnNumber(paste)) fail(id, `phone gold empty but paste has exactly one phone ${cands[0]}`);
  }
  // quantity / nights
  const nums = numbersIn(paste);
  const qv = g[roles.qty];
  if (qv && !nums.has(String(+qv))) fail(id, `${roles.qty} gold ${qv} not derivable`);
  // text roles
  for (const role of ["name", "street", "city", "province", "item", "notes"]) {
    if (!roles[role]) continue;
    const v = g[roles[role]];
    if (v) tokenSubset(roles[role], v);
  }
  if (roles.name && !g[roles.name] && it.form !== "B") fail(id, "name gold empty in an order paste");
  // postal
  if (roles.postal) {
    const zv = g[roles.postal];
    const fives = [...stripPhones(paste).matchAll(/(?<![\d,.])\d{5}(?![\d,.])/g)].map((m) => m[0]);
    if (zv) { if (!/^\d{5}$/.test(zv) || !paste.includes(zv)) fail(id, `postal gold ${zv} not a 5-digit run in paste`); }
    else if (fives.length) fail(id, `postal gold empty but paste has 5-digit ${fives.join(",")}`);
  }
  // svc
  if (roles.svc) {
    const sv = g[roles.svc];
    const hits = Object.entries(SVC).filter(([, re]) => re.test(paste)).map(([k]) => k);
    if (hits.length > 1) fail(id, `paste matches several svc words ${hits}`);
    if (sv && !["STD", "EXP", "SDD"].includes(sv)) fail(id, `svc gold ${sv} not an enum value`);
    if (sv && hits[0] !== sv) fail(id, `svc gold ${sv} but paste svc words ${hits.join(",") || "none"}`);
    if (!sv && hits.length) fail(id, `svc gold empty but paste says ${hits}`);
  }
  // booking-only
  if (it.form === "B") {
    const ev = g.email;
    const emails = [...paste.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]);
    if (ev) { if (!paste.includes(ev)) fail(id, `email gold ${ev} not in paste`); } else if (emails.length) fail(id, `email gold empty but paste has ${emails}`);
    const rv = g.room_type;
    const rh = Object.entries(ROOM).filter(([, re]) => re.test(paste)).map(([k]) => k);
    if (rv && !["single", "double", "suite"].includes(rv)) fail(id, `room_type gold ${rv} not an enum value`);
    if (rh.length > 1) fail(id, `paste has several room words ${rh}`);
    if (rv && rh[0] !== rv) fail(id, `room_type gold ${rv} but paste room words ${rh.join(",") || "none"}`);
    if (!rv && rh.length) fail(id, `room_type gold empty but paste says ${rh}`);
    const dc = dateCands(paste);
    if (dc.length > 1) fail(id, `paste has several dates ${dc} (reserved: two dates in one booking)`);
    if (g.check_in) { if (!/^\d{4}-\d{2}-\d{2}$/.test(g.check_in) || !dc.includes(g.check_in)) fail(id, `check_in gold ${g.check_in} not derivable (candidates ${dc.join(",") || "none"})`); }
    else if (dc.length) fail(id, `check_in gold empty but paste has date ${dc}`);
    if (!g.nights && /\b\d+\s*(n|nts?|nights?|malam)\b/i.test(paste)) fail(id, "nights gold empty but paste has a nights phrase");
  }
}
// A/C twins
for (const [, grp] of byPaste) {
  const a = grp.find((x) => x.form === "A"), c = grp.find((x) => x.form === "C");
  if ((a && !c) || (c && !a)) fail((a ?? c).id, "order paste lacks its A/C twin");
  if (a && c) {
    const pairs = [["name", "cnee_nm"], ["phone", "cnee_tel"], ["street", "addr_1"], ["city", "dist_city"], ["province", "st_prov"], ["postal_code", "zip"], ["item", "desc"], ["quantity", "pcs"], ["notes", "rmks"]];
    for (const [x, y] of pairs) if (a.gold[x] !== c.gold[y]) fail(c.id, `twin mismatch ${x}/${y}`);
    if (a.id.slice(0, 3) !== c.id.slice(0, 3)) fail(c.id, "twin ids differ");
  }
}

// ---- trap coverage ----
const EMOJI_POLITE = /\p{Extended_Pictographic}|\b(please|pls|plz|thanks?|thx|thank you|tolong|makasih|terima kasih|kindly|grateful|sorry)\b/iu;
const SENDER = /\b(my|his|her|their)\s+(brother|sister|aunt|uncle|mom|mum|mother|dad|father|parents?|friend|colleague|boss|client|cousin|neighbou?r|grandma|grandmother|wife|husband|son|daughter|office|team|staff|customer|pa)\b|\b(sepupu|teman|kakak|adik|tante|paman|bos|klien)\s+(saya|aku)\b|\b(adik|kakak|teman)\s+saya\b|\bsender\b|\bon behalf\b|\bgift for\b|\b(my|her|his) (number|phone|wa|hp)\b|\bfor my\b|\bhers\b|\bbuyer:/i;
const ABBR = /\b(jl|jln|kab|kec|kel|ds|gg)\b\.?|\bno\.\s*\d|\b(hp|wa|nts?|pcs?|qty|apt)\b|\b\d+\s*(rm)\b|\brm\b/i;
const INJECT = /\b(ignore|disregard|override)\b|\bnote to (the )?(ai|assistant)\b|\bsystem:|\badmin mode\b/i;
const FWD = /(^|\n)\s*>|\bfwd?\b\s*:|\bforward(ed|ing)\b/i;
const GLUED_QTY = /\b\d+(pcs?|x)\s?[a-z]|\bx\d+\s?[a-z]/i;
const GLUED_NIGHTS = /\b\d+(n|nts?)\b/i;
const NOYEAR_FIELD = (p) => { const dc = dateCands(p); return dc.length === 1 && !/(20\d\d)/.test(p.replace(PHONE_RE, " ")); };

const CORE = {
  order: (g) => ["name", "phone", "street", "city", "postal_code", "item", "quantity"].some((k) => !g[k]),
  booking: (g) => ["guest_name", "phone", "room_type", "check_in", "nights"].some((k) => !g[k]),
};
const groups = { orders: [], bookings: [] };
for (const [paste, grp] of byPaste) {
  const it = grp.find((x) => x.form === "A") ?? grp[0];
  (it.form === "B" ? groups.bookings : groups.orders).push({ paste, gold: it.gold, form: it.form, id: it.id });
}
const cov = (list, kind) => ({
  n: list.length,
  "missing field (name/phone/street/city/postal/item/qty; booking: name/phone/room/date/nights)": list.filter((x) => CORE[kind](x.gold)).length,
  "two+ phone numbers": list.filter((x) => phoneCands(x.paste).length >= 2).length,
  "qty glued to item (3pcs / 2x / x3)": list.filter((x) => GLUED_QTY.test(x.paste)).length,
  "glued nights (4n / 3nts)": list.filter((x) => GLUED_NIGHTS.test(x.paste)).length,
  "emoji / politeness": list.filter((x) => EMOJI_POLITE.test(x.paste)).length,
  "emoji only": list.filter((x) => /\p{Extended_Pictographic}/u.test(x.paste)).length,
  "no year in date": list.filter((x) => NOYEAR_FIELD(x.paste)).length,
  "sender != recipient": list.filter((x) => SENDER.test(x.paste)).length,
  "abbreviations (jl / no. / kab. / hp / wa / nts / pcs)": list.filter((x) => ABBR.test(x.paste)).length,
  "injected instruction": list.filter((x) => INJECT.test(x.paste)).length,
  "forwarded / quoted": list.filter((x) => FWD.test(x.paste)).length,
  "paste length min/median/max": (() => { const l = list.map((x) => x.paste.length).sort((a, b) => a - b); return `${l[0]}/${l[l.length >> 1]}/${l[l.length - 1]}`; })(),
});
const covO = cov(groups.orders, "order"), covB = cov(groups.bookings, "booking");
const extra = {
  orders: { "svc gold set (C)": groups.orders.filter((x) => set.items.find((i) => i.id === x.id.replace("-A", "-C"))?.gold.svc).length, "empty phone": groups.orders.filter((x) => !x.gold.phone).length },
  bookings: { "empty room_type": groups.bookings.filter((x) => !x.gold.room_type).length, "empty phone": groups.bookings.filter((x) => !x.gold.phone).length, "empty email": groups.bookings.filter((x) => !x.gold.email).length },
};

console.log(`set ${set.set}  items ${set.items.length}  pastes: ${groups.orders.length} order + ${groups.bookings.length} booking  (declared pairs: ${set.pairs ?? "n/a"})`);
const keys = Object.keys(covO);
console.log("\ntrap coverage".padEnd(95) + "orders  bookings");
for (const k of keys) console.log("  " + k.padEnd(93) + String(covO[k]).padEnd(8) + String(covB[k]));
console.log("\nextras:", JSON.stringify(extra));

// ---- targets (bench only) ----
const K = (s) => keys.find((k) => k.startsWith(s));
if (set.set === "bench") {
  const T = [
    ["orders", covO, "missing field", 10], ["bookings", covB, "missing field", 10],
    ["orders", covO, "two+ phone", 8], ["bookings", covB, "two+ phone", 8],
    ["orders", covO, "qty glued", 8], ["bookings", covB, "glued nights", 5],
    ["orders", covO, "emoji / politeness", 6], ["bookings", covB, "emoji / politeness", 6],
    ["bookings", covB, "no year", 6],
    ["orders", covO, "sender", 6],
    ["orders", covO, "abbreviations", 5], ["bookings", covB, "abbreviations", 5],
    ["orders", covO, "injected", 4], ["bookings", covB, "injected", 4],
    ["orders", covO, "forwarded", 4], ["bookings", covB, "forwarded", 4],
  ];
  for (const [grp, c, name, min] of T) { const k = K(name); if (c[k] < min) fails.push(`TARGET ${grp} "${k}" = ${c[k]} < ${min}`); }
  if (groups.orders.length !== 60 || groups.bookings.length !== 60) fails.push(`expected 60+60 pastes, got ${groups.orders.length}+${groups.bookings.length}`);
  if (set.items.length !== 180) fails.push(`expected 180 items, got ${set.items.length}`);
  if (set.pairs !== 60) fails.push(`pairs should be 60, is ${set.pairs}`);
}

if (fails.length) { console.log(`\nFAIL (${fails.length})`); for (const f of fails) console.log("  " + f); process.exit(1); }
console.log("\nOK: all gold derivable, no reserved traits, targets met");
