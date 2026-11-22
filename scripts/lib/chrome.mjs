// Shared driver for bench.mjs, egress_check.mjs and seed.mjs --measure:
// serves the static export (out/) on port 3102 and opens the installed Chrome
// HEADED with the profile that holds the downloaded on-device model.
// Never two Chrome instances on one profile.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const PORT = 3102;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon",
  ".txt": "text/plain", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };

export function serveOut() {
  const OUTDIR = path.join(ROOT, "out");
  if (!fs.existsSync(path.join(OUTDIR, "index.html"))) throw new Error("out/ missing: run `npm run build` first");
  return http
    .createServer((q, r) => {
      let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(OUTDIR, p);
      if (!f.startsWith(OUTDIR) || !fs.existsSync(f)) return r.writeHead(404).end("not found");
      r.setHeader("content-type", TYPES[path.extname(f)] ?? "application/octet-stream");
      fs.createReadStream(f).pipe(r);
    })
    .listen(PORT);
}

export function debugToken() {
  if (process.env.PW_APPCHECK_DEBUG_TOKEN) return process.env.PW_APPCHECK_DEBUG_TOKEN;
  const f = `${process.env.HOME}/.config/pastewise/appcheck-debug.env`;
  if (!fs.existsSync(f)) return "";
  const m = /=(.*)/.exec(fs.readFileSync(f, "utf8"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

/** Launches Chrome on `profile` (default: the Nano profile) and returns { browser, close }. */
export async function launchChrome({ profile = process.env.PW_CHROME_PROFILE ?? `${process.env.HOME}/.cache/shape-nano-chrome`, port = 9334 } = {}) {
  let running = false;
  try {
    execSync(`pgrep -f ${path.basename(profile)}`);
    running = true;
  } catch {
    /* pgrep exits 1 when nothing matches */
  }
  if (running) throw new Error(`Chrome already running on ${profile}`);
  const proc = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", "about:blank"],
    { stdio: "ignore" },
  );
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null, protocolTimeout: 900000 });
    } catch {
      await sleep(500);
    }
  }
  if (!browser) throw new Error("could not connect to Chrome");
  return {
    browser,
    async close() {
      try {
        await browser.close();
      } catch {
        /* already gone */
      }
      proc.kill();
    },
  };
}

/** Opens the app with the debug App Check token (localhost only) and a fixed "today" for reproducible dates. */
export async function openApp(browser, { base, today, savedHints = false } = {}) {
  const page = await browser.newPage();
  const isLocal = !base || /localhost|127\.0\.0\.1/.test(base);
  const token = isLocal ? debugToken() : "";
  await page.evaluateOnNewDocument(
    (t, d, ns) => {
      if (t) self.FIREBASE_APPCHECK_DEBUG_TOKEN = t;
      if (d) globalThis.__pastewiseToday = d;
      if (ns) globalThis.__pastewiseNoSaved = true; // scripted runs control hints themselves (no saved-copy auto-load)
    },
    token,
    today ?? "",
    !savedHints,
  );
  await page.goto(base ?? `http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !!window.__pastewise, { timeout: 30000 });
  return page;
}

/** One fill through the real UI: pick the form tab, set the top sheet, trusted click on Fill, wait for the run record. */
export async function fillOnce(page, formId, paste, { timeoutMs = 60000 } = {}) {
  const tabs = await page.$$('[role="tab"]');
  await tabs[{ A: 0, B: 1, C: 2 }[formId]].click();
  const prev = await page.evaluate(() => window.__pastewise.last?.runId ?? null);
  await page.$eval(
    "#paste",
    (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    paste,
  );
  await page.waitForFunction((v) => document.querySelector("#paste").value === v, {}, paste);
  await sleep(60);
  await page.click("#fill");
  await page.waitForFunction(
    (p) => {
      const l = window.__pastewise.last;
      return l && l.runId !== p && l.done;
    },
    { timeout: timeoutMs, polling: 100 },
    prev,
  );
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__pastewise.last)));
}
