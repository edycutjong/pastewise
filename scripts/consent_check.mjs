// The no-Nano judge path, end to end, on the deployed page: a throwaway Chrome profile with the built-in AI flag OFF,
// real production App Check, synthetic message S1 on form C. Fill -> consent sheet -> "Send this one" -> filled with
// inferenceSource in_cloud; the receipt shows the consented bytes. Writes evidence/consent-path-<date>.json.
// Usage: node scripts/consent_check.mjs --base https://pastewise.edycu.dev/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, launchChrome, openApp, sleep } from "./lib/chrome.mjs";

const i = process.argv.indexOf("--base");
const base = i > 0 ? process.argv[i + 1] : "https://pastewise.edycu.dev/";
const S1 = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/demo/S1.json"), "utf8"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pw-nonano-"));
const chrome = await launchChrome({ profile, port: 9342 });
const out = { label: "synthetic S1 only", base, date: new Date().toISOString(), commit: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim() };
try {
  const app = await openApp(chrome.browser, { base, today: "2026-11-22" });
  out.availability = await app.evaluate(async () => (globalThis.LanguageModel ? await globalThis.LanguageModel.availability() : "no LanguageModel"));
  await (await app.$$('[role="tab"]'))[2].click();
  await app.$eval(
    "#paste",
    (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    S1.paste,
  );
  await sleep(100);
  const before = await app.evaluate(() => window.__pastewise.ledger().length);
  await app.click("#fill");
  await app.waitForSelector("dialog.modal[open]", { timeout: 20000 });
  out.firstDialog = await app.$eval("dialog.modal[open]", (e) => e.getAttribute("aria-label"));
  if (/ready/.test(out.firstDialog)) {
    // this Chrome could download the model: the first-run screen came first; the person chooses the cloud for this paste
    await app.evaluate(() => [...document.querySelectorAll("dialog.modal[open] button")].find((b) => /cloud for this paste/.test(b.textContent))?.click());
    await app.waitForSelector('dialog.modal[open] [data-testid="consent-send"]', { timeout: 10000 });
  }
  out.sheetOpened = true;
  out.sheetHeading = await app.$eval("dialog.modal[open] h2", (e) => e.textContent);
  out.aiRequestsBeforeYes = (await app.evaluate(() => window.__pastewise.ledger())).slice(before).filter((r) => /vertexai|generativelanguage/.test(r.host)).length;
  const t0 = Date.now();
  await app.click('[data-testid="consent-send"]');
  await app.waitForFunction(() => window.__pastewise.last?.done && !document.querySelector("dialog.modal[open]"), { timeout: 60000, polling: 200 }).catch(() => {});
  out.afterYesMs = Date.now() - t0;
  const rec = await app.evaluate(() => JSON.parse(JSON.stringify(window.__pastewise.last)));
  out.batches = rec.batches.map((b) => ({ status: b.status, attempts: b.attempts, ms: b.ms, error: (b.error ?? "").slice(0, 400), retryReason: b.retryReason, raw: (b.raw ?? "").slice(0, 80) }));
  out.fill = { done: rec.done, error: rec.error ?? null, sources: rec.batches.map((b) => b.inferenceSource), states: Object.fromEntries(Object.entries(rec.fields).map(([k, v]) => [k, v.state])) };
  out.badge = await app.$$eval(".badge", (es) => es.map((e) => e.textContent));
  out.consentBytesShown = await app.$eval('[data-testid="consent-bytes"] b', (e) => e.textContent).catch(() => null);
  out.messageBytes = new TextEncoder().encode(S1.paste).length;
  out.aiRequests = (await app.evaluate(() => window.__pastewise.ledger())).filter((r) => /vertexai|generativelanguage/.test(r.host)).map((r) => ({ host: r.host, size: r.size, tokensFound: r.hits }));
  const f = path.join(ROOT, `evidence/consent-path-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 1) + "\n");
  console.log(JSON.stringify(out, null, 1));
} finally {
  await chrome.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* temp dir */
  }
}
