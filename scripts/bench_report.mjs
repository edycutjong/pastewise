// Per-form, per-field report over the raw bench rows (no model calls): hints off vs on, p50/p95 per form,
// accepted-wrong per field (the release-response rule: a critical field above 5% mean becomes always-amber).
// Usage: node scripts/bench_report.mjs --set bench --commit <sha> [--out evidence/bench/report-bench.json]
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/chrome.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const set = arg("set", "bench");
const commit = arg("commit");
const dir = path.join(ROOT, "evidence/bench");
const files = fs.readdirSync(dir).filter((f) => new RegExp(`-${set}-(off|hints)-r\\d+\\.json$`).test(f) && (!commit || f.includes(`-${commit}-`)));
const pct = (n, d) => (d ? +((n / d) * 100).toFixed(2) : null);
const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const CRIT = new Set(["name", "phone", "address", "postal"]);
const isCrit = (r) => CRIT.has(r.kind) || /(^|_)name$|^cnee_nm$|^cnee_tel$|^addr_1$|^zip$/.test(r.field);

const arms = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const arm = d.hints === "off" ? "off" : "hints";
  (arms[arm] ??= { runs: [], meta: { commit: d.commit, setSha256: d.setSha256, promptVersion: d.promptVersion, gateVersion: d.gateVersion, hintsSha: d.hintsSha, loadAvgAtStart: [] } }).runs.push(d);
  arms[arm].meta.loadAvgAtStart.push(d.loadAvgAtStart ?? null);
}

function stats(rows, runs) {
  const n = rows.length;
  const present = rows.filter((r) => r.gold);
  return {
    fieldsPerRepeat: +(n / runs).toFixed(1),
    strictAccuracy: pct(rows.filter((r) => r.rawStrict).length, n),
    wrongShown: pct(rows.filter((r) => r.outcome === "accepted_wrong").length, n),
    amber: pct(rows.filter((r) => r.outcome === "amber").length, n),
    amberButRight: pct(rows.filter((r) => r.outcome === "amber" && r.rawStrict).length, n),
    rightValueShown: pct(rows.filter((r) => r.outcome === "accepted_correct" && r.gold).length, present.length),
    criticalWrongShown: pct(rows.filter((r) => isCrit(r) && r.outcome === "accepted_wrong").length, rows.filter(isCrit).length),
  };
}

// Gate v4 (release response) applied offline to the SAME model outputs: recipient-name boxes are never "found".
const ALWAYS_CHECK = new Set(["name", "cnee_nm"]);
const regate = (r) => (ALWAYS_CHECK.has(r.field) && r.outcome.startsWith("accepted") ? { ...r, outcome: "amber" } : r);
const gateV4 = process.argv.includes("--gate4");
const out = { set, gateView: arg("view", gateV4 ? "gate v4 applied offline to the recorded model outputs" : "gate as recorded in the run files"), arms: {} };
for (const [arm, { runs: rawRuns, meta }] of Object.entries(arms)) {
  const runs = gateV4 ? rawRuns.map((d) => ({ ...d, fieldRows: d.fieldRows.map(regate) })) : rawRuns;
  const R = runs.length;
  const byForm = {};
  const fieldTable = {};
  for (const form of ["A", "B", "C"]) {
    const rows = runs.flatMap((d) => d.fieldRows.filter((r) => r.form === form));
    if (!rows.length) continue;
    const tot = runs.flatMap((d) => d.rows.filter((r) => r.form === form).map((r) => r.record));
    const warm = tot.filter((r) => !r.cold).map((r) => r.totalMs);
    byForm[form] = { ...stats(rows, R), pastes: tot.length / R, jsonValid: `${tot.filter((r) => r.done && r.batches.every((b) => b.status === "ok")).length}/${tot.length}`, warmP50: q(warm, 0.5), warmP95: q(warm, 0.95) };
    for (const field of [...new Set(rows.map((r) => r.field))]) {
      const fr = rows.filter((r) => r.field === field);
      fieldTable[`${form}.${field}`] = { critical: isCrit(fr[0]), wrongShown: pct(fr.filter((r) => r.outcome === "accepted_wrong").length, fr.length), strict: pct(fr.filter((r) => r.rawStrict).length, fr.length), amber: pct(fr.filter((r) => r.outcome === "amber").length, fr.length) };
    }
  }
  const all = runs.flatMap((d) => d.fieldRows);
  const lat = runs.flatMap((d) => d.rows.map((r) => r.record)).filter((r) => !r.cold).map((r) => r.totalMs);
  out.arms[arm] = { repeats: R, meta, all: { ...stats(all, R), warmP50: q(lat, 0.5), warmP95: q(lat, 0.95) }, byForm, fieldTable, onDeviceAll: runs.every((d) => d.validRun) };
}
out.criticalOver5 = Object.entries(out.arms.off?.fieldTable ?? {}).filter(([, v]) => v.critical && v.wrongShown > 5).map(([k, v]) => ({ field: k, wrongShown: v.wrongShown }));
const dst = path.resolve(ROOT, arg("out", `evidence/bench/report-${set}${commit ? "-" + commit : ""}.json`));
fs.writeFileSync(dst, JSON.stringify(out, null, 1) + "\n");
const line = (k, v) => `${k.padEnd(6)} ${["strictAccuracy", "wrongShown", "criticalWrongShown", "amber", "amberButRight", "rightValueShown", "warmP50", "warmP95", "jsonValid"].map((m) => `${m}=${v[m]}`).join(" ")}`;
for (const [arm, a] of Object.entries(out.arms)) {
  console.log(`== ${arm} (${a.repeats} repeats)`);
  console.log(line("all", a.all));
  for (const [f, v] of Object.entries(a.byForm)) console.log(line(f, v));
}
console.log("critical fields over 5% wrong-shown (arm off):", JSON.stringify(out.criticalOver5));
console.log("wrote", path.relative(ROOT, dst));
