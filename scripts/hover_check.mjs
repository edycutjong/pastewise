// Interaction QA proof: for each interactive element CLASS, screenshot it, hover it, screenshot again and byte-compare
// (a hover rule that compiles to nothing shows no change); also Tab-focus each and compare for a visible focus ring;
// plus a link inventory of the rendered pages (every href resolves, every in-page anchor has an id).
// Runs in a throwaway Chrome profile with the on-device API removed, so no model download can start.
// Usage: node scripts/hover_check.mjs [--base URL]   (default: serves out/ on :3102). Writes evidence/interaction-qa.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, serveOut, launchChrome, sleep } from "./lib/chrome.mjs";

const i = process.argv.indexOf("--base");
const base = (i > 0 ? process.argv[i + 1] : "http://localhost:3102").replace(/\/$/, "");
const srv = i > 0 ? { close() {} } : serveOut();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pw-hover-"));
const chrome = await launchChrome({ profile, port: 9341 });
const results = [];
// Page-level screenshots over a FIXED padded rectangle: an element screenshot follows a translated element and an
// outline sits outside its box, so both would read as "no change".
const check = async (page, name, selector) => {
  const el = await page.$(selector);
  if (!el) return results.push({ name, selector, hover: "MISSING", focus: "MISSING" });
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.mouse.move(0, 0);
  await sleep(500);
  const r = await el.boundingBox(); // viewport coordinates; clip wants page coordinates
  const sc = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const clip = { x: Math.max(0, r.x + sc.x - 8), y: Math.max(0, r.y + sc.y - 8), width: r.width + 16, height: r.height + 16 };
  const shot = () => page.screenshot({ clip, captureBeyondViewport: false });
  const before = await shot();
  await el.hover();
  await sleep(450);
  const hovered = await shot();
  await page.mouse.move(0, 0);
  await sleep(450);
  await el.evaluate((e) => e.focus({ focusVisible: true }));
  await sleep(450);
  const focused = await shot();
  await el.evaluate((e) => e.blur());
  results.push({ name, selector, hover: Buffer.compare(before, hovered) !== 0 ? "PASS" : "FAIL", focus: Buffer.compare(before, focused) !== 0 ? "PASS" : "FAIL" });
};
try {
  const page = await chrome.browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => {
    delete globalThis.LanguageModel;
    globalThis.__pastewiseNoSaved = true;
  });
  await page.goto(`${base}/`, { waitUntil: "networkidle2" });
  await check(page, "nav link", '.site-nav a:not([aria-current="page"])');
  await check(page, "form tab (unselected)", '.tab[aria-selected="false"]');
  await check(page, "fill button", "#fill");
  await check(page, "teach button", ".teach-btn");
  await check(page, "paste-from-clipboard link", ".sheet-head .linkish");
  await check(page, "receipt strip link", ".strip .linkish");
  await check(page, "receipt strip details summary", ".strip summary");
  // consent sheet (no on-device API in this profile)
  await page.type("#paste", "Please send 2 notebooks to Tia Ramadhani, 0813 0000 1111, Jl. Kopo 9, Bandung 40222.");
  await page.click("#fill");
  await page.waitForSelector("dialog.modal[open]");
  await check(page, "consent: Send this one", '[data-testid="consent-send"]');
  await check(page, "consent: I'll type it", '[data-testid="consent-decline"]');
  await check(page, "consent: how-to summary", "dialog.modal[open] summary");
  await check(page, "consent: watch recorded run", "dialog.modal[open] .linkish");
  await page.click('[data-testid="consent-decline"]');
  await page.waitForSelector("dialog.modal:not([open])");
  // teach drawer
  await page.click(".teach-btn");
  await page.waitForSelector("dialog.modal[open]");
  await check(page, "teach: send", "dialog.modal[open] button.primary");
  await check(page, "teach: close", "dialog.modal[open] button.ghost");
  await page.keyboard.press("Escape");
  await sleep(300);
  // link inventory
  const pages = ["/", "/bench/", "/receipt/"];
  const links = [];
  for (const p of pages) {
    await page.goto(`${base}${p}`, { waitUntil: "networkidle2" });
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    const ids = await page.$$eval("[id]", (es) => es.map((e) => e.id));
    for (const h of hrefs) {
      if (h.startsWith("#")) links.push({ page: p, href: h, ok: ids.includes(h.slice(1)) || h === "#" ? h !== "#" : false, kind: "anchor" });
      else if (h.startsWith("/")) {
        const r = await fetch(`${base}${h}`);
        links.push({ page: p, href: h, ok: r.ok, status: r.status, kind: "internal" });
      } else links.push({ page: p, href: h, ok: null, kind: "external" });
    }
  }
  const out = { date: new Date().toISOString().slice(0, 10), base, elementClasses: results, links };
  fs.writeFileSync(path.join(ROOT, "evidence/interaction-qa.json"), JSON.stringify(out, null, 1) + "\n");
  console.table(results);
  console.log(JSON.stringify(links.filter((l) => l.ok !== true)));
  process.exitCode = results.every((r) => r.hover === "PASS" && r.focus === "PASS") && links.every((l) => l.ok !== false) ? 0 : 1;
} finally {
  await chrome.close();
  srv.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* temp dir, the OS cleans it */
  }
}
