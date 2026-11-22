// Hosted smoke: opens the deployed page in the Nano Chrome profile (NO debug token: production App Check),
// listens for CSP violations and console errors, fills synthetic S1 on form C on-device, then runs the real
// cloud teacher on the empty form and reads Remote Config. Writes evidence/hosted-smoke-<date>.json.
// Usage: node scripts/hosted_smoke.mjs --base https://pastewise.edycu.dev/
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, launchChrome, openApp, fillOnce } from "./lib/chrome.mjs";

const i = process.argv.indexOf("--base");
const base = i > 0 ? process.argv[i + 1] : "https://pastewise.edycu.dev/";
const S1 = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/demo/S1.json"), "utf8"));
const chrome = await launchChrome();
const out = { label: "synthetic S1 only", base, date: new Date().toISOString(), commit: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim() };
try {
  const consoleErrors = [];
  const failed = [];
  const app = await openApp(chrome.browser, { base, today: "2026-11-22" });
  // listeners go on the app page, then it reloads so every load-time violation is seen
  app.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  app.on("requestfailed", (r) => failed.push(`${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
  await app.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await app.reload({ waitUntil: "networkidle2" });
  await app.waitForFunction(() => !!window.__pastewise, { timeout: 30000 });
  out.availability = await app.evaluate(async () => (globalThis.LanguageModel ? await globalThis.LanguageModel.availability() : "no LanguageModel"));
  const rec = await fillOnce(app, "C", S1.paste);
  out.fill = { done: rec.done, error: rec.error ?? null, sources: rec.batches.map((b) => b.inferenceSource), totalMs: rec.totalMs, states: Object.fromEntries(Object.entries(rec.fields).map(([k, v]) => [k, v.state])) };
  out.ledgerAfterFill = await app.evaluate(() => window.__pastewise.ledger().map((r) => ({ host: r.host, purpose: r.purpose, size: r.size, hits: r.hits })));
  try {
    const t = await app.evaluate(() => window.__pastewise.teach("C"));
    out.teacher = { hints: t.hints.length, inferenceSource: t.inferenceSource, ms: t.ms };
  } catch (e) {
    out.teacher = { error: String(e).slice(0, 300) };
  }
  out.cspViolationsInPage = await app.evaluate(() => window.__csp ?? "listener not installed before load");
  out.pageErrors = consoleErrors;
  out.failedRequests = failed;
  const f = path.join(ROOT, `evidence/hosted-smoke-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
  console.log(JSON.stringify(out, null, 1));
} finally {
  await chrome.close();
}
