// Scoring for bench rows (eval-plan §1). Two raw-accuracy scores:
//  - strict: exact normalised string (case/whitespace/punctuation; phone digits
//    with +62 -> 0; ints as digits; dates ISO), no token-set or notes leniency;
//  - p0c: the kill test's lenient compare, for continuity with P0c numbers.
// Gate outcomes use the value the box SHOWS (after cleanup), compared strictly.

const norm = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const phone = (s) => {
  const d = digits(s);
  return d.startsWith("62") ? "0" + d.slice(2) : d;
};
const NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const int = (s) => {
  const t = String(s ?? "").trim().toLowerCase();
  const w = NUMW.indexOf(t);
  return w >= 0 ? String(w) : digits(t).replace(/^0+(?=\d)/, "");
};

export function sameStrict(kind, a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (kind === "phone") return phone(a) === phone(b);
  if (kind === "int") return int(a) === int(b);
  if (kind === "date" || kind === "enum" || kind === "email") return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return norm(a) === norm(b);
}

const STOP = new Set(["please", "pls", "it", "the", "a", "an", "thx", "thanks", "to", "of"]);
const toks = (s) => norm(s).split(" ").filter(Boolean);
export function sameP0c(kind, role, a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (kind === "phone" || kind === "int" || kind === "date" || kind === "enum" || kind === "email" || kind === "postal") return sameStrict(kind, a, b);
  if (role === "notes" || kind === "notes") {
    const g = toks(b).filter((t) => !STOP.has(t)), o = toks(a).filter((t) => !STOP.has(t));
    return g.every((t) => o.includes(t)) && o.length <= g.length + 3;
  }
  return norm(a) === norm(b) || [...new Set(toks(a))].sort().join(" ") === [...new Set(toks(b))].sort().join(" ");
}

const CRITICAL = (f) => f.role === "name" || f.kind === "name" || f.kind === "phone" || f.role === "address" || f.kind === "address" || f.kind === "postal";
const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null);
const pct = (n, d) => (d ? +((n / d) * 100).toFixed(2) : null);

/**
 * rows: [{ id, form, gold, record, spec }] where record = window.__pastewise.last, spec = FormSpec
 * returns { summary, fieldRows }
 */
export function score(rows) {
  const t = { fields: 0, present: 0, rawStrict: 0, rawP0c: 0, presentStrict: 0, accC: 0, accW: 0, amber: 0, amberRight: 0, empty: 0, critAccW: 0, critFields: 0, foundPresent: 0, usefulCrit: 0, critPresent: 0 };
  const amberBy = {};
  const accWrongList = [];
  const fieldRows = [];
  let valid = 0, onDevice = 0, batchesN = 0, stalls = 0, recovered = 0;
  const ordersWithCrit = new Set();
  const warm = [], cold = [];
  for (const r of rows) {
    const rec = r.record;
    if (rec.batches.length && rec.batches.every((b) => b.status === "ok")) valid++;
    for (const b of rec.batches) {
      batchesN++;
      if (b.inferenceSource === "on_device") onDevice++;
      if (b.attempts > 1) {
        stalls++;
        if (b.status === "ok") recovered++;
      }
    }
    (rec.cold ? cold : warm).push(rec.totalMs);
    for (const f of r.spec.fields) {
      const out = rec.fields[f.key] ?? { proposed: "", state: "amber", value: "", reason: "missing" };
      const gold = r.gold[f.key] ?? "";
      const strict = sameStrict(f.kind, out.proposed, gold);
      const p0c = sameP0c(f.kind, f.role, out.proposed, gold);
      t.fields++;
      if (strict) t.rawStrict++;
      if (p0c) t.rawP0c++;
      if (gold) {
        t.present++;
        if (strict) t.presentStrict++;
      }
      const crit = CRITICAL(f);
      if (crit) t.critFields++;
      if (crit && gold) t.critPresent++;
      let outcome;
      if (out.state === "found") {
        const ok = sameStrict(f.kind, out.value, gold);
        outcome = ok ? "accepted_correct" : "accepted_wrong";
        if (ok) t.accC++;
        else {
          t.accW++;
          accWrongList.push({ id: r.id, field: f.key, gold, shown: out.value, proposed: out.proposed });
          if (crit) {
            t.critAccW++;
            ordersWithCrit.add(r.id);
          }
        }
        if (gold) t.foundPresent++;
        if (ok && gold && crit) t.usefulCrit++;
      } else if (out.state === "amber") {
        outcome = "amber";
        t.amber++;
        amberBy[out.reason ?? "unknown"] = (amberBy[out.reason ?? "unknown"] ?? 0) + 1;
        if (gold && (sameStrict(f.kind, out.proposed, gold) || sameStrict(f.kind, out.value, gold))) t.amberRight++;
      } else {
        outcome = gold ? "empty_missed" : "empty_correct";
        t.empty++;
      }
      fieldRows.push({ id: r.id, form: r.form, field: f.key, kind: f.kind, gold, proposed: out.proposed, shown: out.value, state: out.state, reason: out.reason ?? null, rawStrict: strict, rawP0c: p0c, outcome });
    }
  }
  warm.sort((a, b) => a - b);
  const acceptedTotal = t.accC + t.accW;
  return {
    summary: {
      pastes: rows.length,
      jsonValid: `${valid}/${rows.length}`,
      fields: t.fields,
      rawAccuracyStrict: pct(t.rawStrict, t.fields),
      rawAccuracyP0c: pct(t.rawP0c, t.fields),
      presentFieldAccuracy: pct(t.presentStrict, t.present),
      acceptedCorrectPct: pct(t.accC, t.fields),
      acceptedWrong: t.accW,
      acceptedWrongPct: pct(t.accW, t.fields),
      wrongAmongAccepted: pct(t.accW, acceptedTotal),
      coverage: pct(t.foundPresent, t.present),
      usefulCoverage: pct(t.accC, t.present),
      usefulCoverageCritical: pct(t.usefulCrit, t.critPresent),
      criticalAcceptedWrongPct: pct(t.critAccW, t.critFields),
      ordersWithCriticalErrorPct: pct(ordersWithCrit.size, rows.length),
      amberPct: pct(t.amber, t.fields),
      amberByReason: amberBy,
      amberButRightPct: pct(t.amberRight, t.fields),
      emptyPct: pct(t.empty, t.fields),
      latencyMs: { warmP50: q(warm, 0.5), warmP95: q(warm, 0.95), cold: cold[0] ?? null, n: warm.length },
      batches: batchesN,
      onDeviceBatches: `${onDevice}/${batchesN}`,
      stalls,
      stallsRecovered: recovered,
      acceptedWrongRows: accWrongList,
    },
    fieldRows,
  };
}
