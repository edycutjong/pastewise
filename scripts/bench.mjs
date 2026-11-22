// Bench runner: drives the REAL app page (static export) in headed Chrome with
// the on-device model, through the real Fill button, and scores the app's own
// gate output. Writes raw rows + a summary into evidence/bench/.
//
// Usage: npm run build && node scripts/bench.mjs --set sets/dev.json [--repeats 3] [--hints off|cloud] [--hints-file f.json] [--base URL]
//   --hints cloud: the real ONLY_IN_CLOUD teacher runs once per form; its hints are frozen into
//   evidence/bench/hints-<form>-<date>.json and reused for every repeat (the delta measures hints, not teacher variance).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execSync } from "node:child_process";
import { ROOT, serveOut, launchChrome, openApp, fillOnce } from "./lib/chrome.mjs";
import { score } from "./lib/score.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const setPath = path.resolve(ROOT, arg("set", "sets/dev.json"));
const repeats = Number(arg("repeats", "3"));
const hintsMode = arg("hints", "off");
const hintsFile = arg("hints-file");
const base = arg("base");
const only = arg("forms"); // e.g. "C"
const SET = JSON.parse(fs.readFileSync(setPath, "utf8"));
const setHash = crypto.createHash("sha256").update(fs.readFileSync(setPath)).digest("hex");
const items = SET.items.filter((x) => !only || only.includes(x.form));
const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
const dirty = execSync("git status --porcelain -- src", { cwd: ROOT }).toString().trim() !== "";
const date = new Date().toISOString().slice(0, 10);
// --out DIR keeps raw rows + the per-paste summary out of the repo (used for the frozen kill-test set, which stays in the
// kitchen); the aggregate file (counts and ranges only, no paste text) always lands in evidence/bench/aggregates/.
const OUT = path.resolve(ROOT, arg("out", "evidence/bench"));
const AGG = path.join(ROOT, "evidence/bench/aggregates");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(AGG, { recursive: true });

// The held-out set is scored once per (prompt version, gate version): a second run needs a printed reason.
const rerunReason = arg("rerun-reason");
const loadAtStart = os.loadavg().map((x) => +x.toFixed(1));

let contended = false;
try {
  execSync("pgrep -f footing-nano-chrome");
  contended = true;
} catch {
  /* nothing else using the GPU */
}

const srv = base ? { close() {} } : serveOut();
const chrome = await launchChrome();
const files = [];
try {
  const page = await openApp(chrome.browser, { base, today: SET.today });
  const meta = await page.evaluate(() => ({ ua: navigator.userAgent, versions: window.__pastewise.versions }));
  if (SET.set === "holdout") {
    const key = `${meta.versions.prompt}|${meta.versions.gate}`;
    const seen = fs.readdirSync(AGG).filter((f) => f.includes("-holdout-")).map((f) => JSON.parse(fs.readFileSync(path.join(AGG, f), "utf8"))).filter((d) => `${d.promptVersion}|${d.gateVersion}` === key && d.arm === (hintsMode === "off" && !hintsFile ? "off" : "hints"));
    if (seen.length >= 1 && !rerunReason) throw new Error(`holdout already scored for prompt/gate ${key} on this hints arm; pass --rerun-reason "<why>"`);
    if (seen.length >= 1) console.log(`HOLDOUT RERUN (reason: ${rerunReason})`);
  }
  const forms = [...new Set(items.map((x) => x.form))];
  const specs = {};
  let hints = {};
  if (hintsFile) hints = JSON.parse(fs.readFileSync(path.resolve(ROOT, hintsFile), "utf8")).hints;
  else if (hintsMode === "cloud") {
    for (const f of forms) {
      const t = await page.evaluate((id) => window.__pastewise.teach(id), f);
      hints[f] = t.hints;
      const hf = path.join(OUT, `hints-${f}-${date}.json`);
      fs.writeFileSync(hf, JSON.stringify({ form: f, inferenceSource: t.inferenceSource, ms: t.ms, dropped: t.dropped, payload: t.payload, hints: t.hints }, null, 1) + "\n");
      console.log(`teacher ${f}: ${t.hints.length} hints, ${t.inferenceSource}, ${t.ms} ms -> ${path.relative(ROOT, hf)}`);
    }
  }
  for (const f of forms) {
    await page.evaluate((id, h) => window.__pastewise.setHints(id, h), f, hints[f] ?? []);
    specs[f] = await page.evaluate((id) => {
      const tabs = document.querySelectorAll('[role="tab"]');
      tabs[{ A: 0, B: 1, C: 2 }[id]].click();
      return window.__pastewise.schema(id);
    }, f);
  }
  const hintsSha = Object.keys(hints).length ? crypto.createHash("sha256").update(JSON.stringify(hints)).digest("hex").slice(0, 16) : null;
  const summaries = [];
  for (let r = 1; r <= repeats; r++) {
    const rows = [];
    for (const it of items) {
      const record = await fillOnce(page, it.form, it.paste);
      rows.push({ id: it.id, form: it.form, gold: it.gold, record, spec: specs[it.form] });
      process.stdout.write(`r${r} ${it.id} ${record.totalMs}ms ${record.batches.map((b) => b.inferenceSource).join(",")}\n`);
    }
    const { summary, fieldRows } = score(rows);
    const offDevice = rows.filter((x) => x.record.batches.some((b) => b.inferenceSource !== "on_device"));
    const file = path.join(OUT, `${date}-${sha}-${SET.set}-${hintsMode === "off" && !hintsFile ? "off" : "hints"}-r${r}.json`);
    const doc = {
      label: SET.label,
      set: SET.set,
      setSha256: setHash,
      repeat: r,
      commit: sha,
      srcDirty: dirty,
      date,
      today: SET.today,
      hints: hintsMode === "off" && !hintsFile ? "off" : hintsFile ? `file:${hintsFile}` : "cloud",
      hintsSha,
      promptVersion: meta.versions.prompt,
      gateVersion: meta.versions.gate,
      chrome: meta.ua,
      machine: "Apple M1 Max, 32 GB (builder's laptop)",
      contendedBySiblingChrome: contended,
      loadAvgAtStart: loadAtStart,
      rerunReason: rerunReason ?? null,
      validRun: offDevice.length === 0,
      summary,
      rows: rows.map((x) => ({ id: x.id, form: x.form, record: x.record })),
      fieldRows,
    };
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
    files.push(path.relative(ROOT, file));
    summaries.push(summary);
    console.log(`r${r}: strict ${summary.rawAccuracyStrict}% · p0c ${summary.rawAccuracyP0c}% · accepted-wrong ${summary.acceptedWrongPct}% · valid ${summary.jsonValid} · warm p50 ${summary.latencyMs.warmP50} ms`);
  }
  const range = (k) => {
    const v = summaries.map((s) => (typeof k === "function" ? k(s) : s[k]));
    return { mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), min: Math.min(...v), max: Math.max(...v) };
  };
  const agg = {
    rawAccuracyStrict: range("rawAccuracyStrict"),
    rawAccuracyP0c: range("rawAccuracyP0c"),
    acceptedWrongPct: range("acceptedWrongPct"),
    coverage: range("coverage"),
    usefulCoverage: range("usefulCoverage"),
    amberPct: range("amberPct"),
    warmP50: range((s) => s.latencyMs.warmP50),
    warmP95: range((s) => s.latencyMs.warmP95),
  };
  const armName = hintsMode === "off" && !hintsFile ? "off" : "hints";
  const aggDoc = {
    set: SET.set,
    setSha256: setHash,
    pastes: items.length,
    forms,
    arm: armName,
    hintsSource: hintsFile ? `file:${hintsFile}` : hintsMode === "cloud" ? "cloud" : "none",
    hintsSha,
    repeats,
    date,
    commit: sha,
    srcDirty: dirty,
    promptVersion: meta.versions.prompt,
    gateVersion: meta.versions.gate,
    chrome: meta.ua,
    machine: "Apple M1 Max, 32 GB (builder's laptop)",
    contendedBySiblingChrome: contended,
    loadAvgAtStart: loadAtStart,
    loadAvgAtEnd: os.loadavg().map((x) => +x.toFixed(1)),
    rerunReason: rerunReason ?? null,
    path: "real app page, ONLY_ON_DEVICE via Firebase AI Logic",
    metrics: agg,
    perRepeat: summaries.map((s) => ({
      jsonValid: s.jsonValid,
      onDeviceBatches: s.onDeviceBatches,
      stalls: s.stalls,
      rawAccuracyStrict: s.rawAccuracyStrict,
      acceptedWrongPct: s.acceptedWrongPct,
      acceptedWrongCount: s.acceptedWrongRows.length,
      coverage: s.coverage,
      usefulCoverage: s.usefulCoverage,
      warmP50: s.latencyMs.warmP50,
      warmP95: s.latencyMs.warmP95,
    })),
    rawRowsInRepo: !process.argv.includes("--out"),
  };
  const aggFile = path.join(AGG, `${date}-${sha}-${SET.set}-${armName}.json`);
  fs.writeFileSync(aggFile, JSON.stringify(aggDoc, null, 1) + "\n");
  const redact = process.argv.includes("--out");
  const md = [
    `# Bench: ${SET.set} · hints ${hintsMode === "off" && !hintsFile ? "off" : "on"} · ${repeats} repeat(s)`,
    "",
    `- Date ${date} · commit ${sha}${dirty ? " (src dirty)" : ""} · prompt ${meta.versions.prompt} · gate v${meta.versions.gate}`,
    `- Set sha256 ${setHash} (${items.length} pastes${only ? `, forms ${only}` : ""}) · today fixed at ${SET.today}`,
    `- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome ${/Chrome\/([\d.]+)/.exec(meta.ua)?.[1]}, Apple M1 Max 32 GB${contended ? " · **contended: sibling Nano Chrome was running**" : ""}`,
    hintsSha ? `- Hints sha256/16 ${hintsSha}` : "- No hints",
    "",
    "| Metric | mean | min | max |",
    "|---|---|---|---|",
    ...Object.entries(agg).map(([k, v]) => `| ${k} | ${v.mean} | ${v.min} | ${v.max} |`),
    "",
    `JSON valid per repeat: ${summaries.map((s) => s.jsonValid).join(" · ")} · on-device batches: ${summaries.map((s) => s.onDeviceBatches).join(" · ")} · stalls: ${summaries.map((s) => s.stalls).join(" · ")}`,
    "",
    "## Accepted-wrong rows (the dangerous ones)",
    ...summaries.flatMap((s, i) => s.acceptedWrongRows.map((w) => (redact ? `- r${i + 1} ${w.id} \`${w.field}\`` : `- r${i + 1} ${w.id} \`${w.field}\`: shown "${w.shown}" · gold "${w.gold}"`))),
    "",
    "Raw rows: " + files.map((f) => `\`${f}\``).join(", "),
    `Aggregate: \`${path.relative(ROOT, aggFile)}\``,
    "",
  ].join("\n");
  const mdFile = path.join(OUT, `${date}-${sha}-${SET.set}-${hintsMode === "off" && !hintsFile ? "off" : "hints"}-summary.md`);
  fs.writeFileSync(mdFile, md);
  console.log(md);
} finally {
  await chrome.close();
  srv.close();
}
