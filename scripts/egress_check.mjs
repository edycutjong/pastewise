// External half of the 0-bytes receipt: records every network request the
// browser makes (CDP Network domain on the page AND every auto-attached target:
// iframes such as reCAPTCHA, workers) while the demo pastes are filled through
// the real UI, then scans every URL + body for paste tokens (same rule as the
// in-page ledger, src/ledger/tokens.ts).
//
// Verdict: 0 paste-token hits on the on-device path. A positive control (a
// same-origin request carrying the synthetic S3 demo paste: localhost when run
// locally, the deployed host with --base; never a third party) must be caught,
// or the checker itself is broken and the run fails.
//
// Usage: npm run build && node scripts/egress_check.mjs [--base URL]
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, serveOut, launchChrome, openApp, fillOnce, sleep } from "./lib/chrome.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const base = arg("base");
const DEMO = path.join(ROOT, "fixtures/demo");
const demos = ["S1", "S2", "S3", "S4", "S5"].map((id) => JSON.parse(fs.readFileSync(path.join(DEMO, `${id}.json`), "utf8")));
const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
const date = new Date().toISOString().slice(0, 10);

const srv = base ? { close() {} } : serveOut();
const chrome = await launchChrome();
const reqs = [];
const attached = []; // child targets the capture attached to (iframes, workers)
let phase = "boot";
try {
  // open the app, attach CDP, then reload so the capture starts before the page's first request
  const app = await openApp(chrome.browser, { base, today: "2026-11-22" });
  const appSession = await app.createCDPSession();
  const conn = appSession.connection();
  const watch = async (session, kind) => {
    session.on("Network.requestWillBeSent", async (e) => {
      let body = e.request.postData ?? "";
      let bodyUnreadable = false;
      if (!body && e.request.hasPostData) {
        try {
          body = (await session.send("Network.getRequestPostData", { requestId: e.requestId })).postData ?? "";
        } catch {
          body = "";
          bodyUnreadable = true; // counted in the verdict: a body we could not scan is never a silent "clean"
        }
      }
      const local = /^(data|blob):/.test(e.request.url); // in-memory resources, not network
      reqs.push({ phase, target: kind, type: e.type, url: local ? e.request.url.slice(0, 30) : e.request.url, method: e.request.method, body: local ? "" : body, local, bodyUnreadable: bodyUnreadable || undefined, redirectHop: e.redirectResponse ? true : undefined });
    });
    session.on("Target.attachedToTarget", async (e) => {
      attached.push({ type: e.targetInfo.type, host: (() => { try { return new URL(e.targetInfo.url).host; } catch { return ""; } })() });
      const child = conn.session(e.sessionId);
      if (!child) return;
      await watch(child, e.targetInfo.type);
      try {
        await child.send("Network.enable");
        await child.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
        await child.send("Runtime.runIfWaitingForDebugger");
      } catch {
        /* target went away */
      }
    });
    await session.send("Network.enable");
    await session.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  };
  await watch(appSession, "page");
  await app.reload({ waitUntil: "networkidle2" });
  await app.waitForFunction(() => !!window.__pastewise);
  phase = "idle-after-load";
  await sleep(1500);

  // the app's own cap (Remote Config, clamped in src/lib/rc.ts), read from the page, so the refusal check tests the live boundary
  const capRaw = await app.evaluate(() => window.__pastewise.rc().paste_char_cap);
  const cap = Number.parseInt(String(capRaw), 10);
  if (!Number.isFinite(cap)) throw new Error(`could not read the paste cap from the page: ${capRaw}`);
  if (!demos.some((d) => d.paste.length > cap)) throw new Error(`no demo paste is longer than the live cap ${cap}: the over-long refusal would go untested`);
  const results = [];
  for (const d of demos) {
    phase = `fill:${d.id}`;
    const before = reqs.filter((r) => !r.local).length;
    const during = () => reqs.filter((r) => !r.local).length - before;
    if (d.paste.length > cap) {
      // over-long paste: must be refused before any model call
      await app.$eval("#paste", (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, d.paste);
      await sleep(100);
      const prev = await app.evaluate(() => window.__pastewise.last?.runId ?? null);
      await app.click("#fill");
      await sleep(1500);
      const notice = await app.$eval('[role="status"]', (e) => e.textContent).catch(() => "");
      const after = await app.evaluate(() => window.__pastewise.last?.runId ?? null);
      results.push({ id: d.id, form: d.form, refused: prev === after && /limit/.test(notice), notice, requestsDuring: during() });
    } else {
      const rec = await fillOnce(app, d.form, d.paste);
      await sleep(800);
      results.push({ id: d.id, form: d.form, inferenceSource: rec.batches.map((b) => b.inferenceSource), error: rec.error ?? null, requestsDuring: during() });
    }
  }
  // the cloud teacher on form C: real requests, empty form only
  phase = "teach:C";
  const teach = await app.evaluate(() => window.__pastewise.teach("C").then((t) => ({ n: t.hints.length, src: t.inferenceSource })));
  await sleep(800);
  // positive control: a same-origin synthetic request (this app's own origin: localhost locally, the deployed host with --base)
  // carrying the S3 demo paste must be caught by both the CDP log and the in-page ledger; it reaches no third party
  phase = "canary";
  await app.evaluate((p) => fetch(`/__egress_canary?m=${encodeURIComponent(p)}`).catch(() => null), demos[2].paste);
  await sleep(800);

  // scan every request against every demo paste's tokens (same rule as the ledger)
  const tokenSets = {};
  for (const d of demos) tokenSets[d.id] = await app.evaluate((p, f) => window.__pastewise.tokens(p, f), d.paste, d.form);
  const rows = [];
  for (const r of reqs) {
    const text = `${r.url}\n${r.body}`;
    const hits = {};
    for (const [id, toks] of Object.entries(tokenSets)) {
      const f = await app.evaluate((t, k) => window.__pastewise.scan(t, k), text, toks);
      if (f.hits.length) hits[id] = { tokens: f.hits.length, bytes: f.bytes };
    }
    let host = "";
    try {
      host = new URL(r.url).host;
    } catch {
      host = r.url.slice(0, 40);
    }
    rows.push({ phase: r.phase, target: r.target, type: r.type, local: r.local || undefined, redirectHop: r.redirectHop, bodyUnreadable: r.bodyUnreadable, method: r.method, host, path: (() => { try { return new URL(r.url).pathname.slice(0, 80); } catch { return ""; } })(), size: Buffer.byteLength(text) - 1, hits });
  }
  // completeness of the on-screen receipt: every fetch/XHR/beacon/WebSocket the page itself sent must be in the in-page ledger
  const ledgerRecs = await app.evaluate(() => window.__pastewise.ledger().map((r) => ({ host: r.host, api: r.api, pasteBytesFound: r.pasteBytesFound })));
  const byHost = (list) => list.reduce((m, r) => ((m[r.host] = (m[r.host] ?? 0) + 1), m), {});
  // a redirect hop (e.g. Vercel's trailing-slash 308) is the same fetch() followed by the browser: one ledger entry, two CDP events.
  // Hops are still scanned for paste tokens above; they are left out of this one-to-one count only.
  const cdpApi = byHost(rows.filter((r) => r.target === "page" && !r.local && !r.redirectHop && r.method !== "OPTIONS" && ["Fetch", "XHR", "Ping", "WebSocket", "EventSource"].includes(r.type)));
  const ledgerHosts = byHost(ledgerRecs);
  const missingFromLedger = Object.entries(cdpApi).filter(([h, n]) => (ledgerHosts[h] ?? 0) < n).map(([h, n]) => ({ host: h, cdp: n, ledger: ledgerHosts[h] ?? 0 }));
  const appHost = new URL(base ?? "http://localhost:3102").host; // the canary is a relative URL, so it lands on the app's own origin
  const ledgerCanaryCaught = ledgerRecs.some((r) => r.host === appHost && r.pasteBytesFound > 0);
  // only the control request itself (and its redirect continuation) is exempt; any other request in the canary window is real traffic
  const isControl = (r) => r.phase === "canary" && r.host === appHost && r.path.startsWith("/__egress_canary");
  const real = rows.filter((r) => !isControl(r));
  const hitRows = real.filter((r) => Object.keys(r.hits).length);
  const canaryCaught = rows.some((r) => isControl(r) && r.hits.S3);
  const fillPhases = results.filter((r) => !r.refused);
  const verdict = {
    pasteTokenHitsOnRealRequests: hitRows.length,
    requestsDuringOnDeviceFills: fillPhases.reduce((n, r) => n + r.requestsDuring, 0),
    overLongRefused: results.find((r) => r.id === "S5")?.refused ?? false,
    // every non-refused demo paste must have produced at least one batch, all on_device, and no error
    allFillsOnDevice: fillPhases.length > 0 && fillPhases.every((r) => !r.error && r.inferenceSource.length > 0 && r.inferenceSource.every((s) => s === "on_device")),
    unreadableRequestBodies: rows.filter((r) => r.bodyUnreadable).length,
    teacherCalled: teach,
    positiveControlCaught: canaryCaught,
    inPageLedger: { requests: ledgerRecs.length, byHost: ledgerHosts, cdpApiRequestsByHost: cdpApi, missingFromLedger, canaryCaughtByLedger: ledgerCanaryCaught },
    pass: false,
  };
  verdict.pass =
    hitRows.length === 0 &&
    canaryCaught &&
    ledgerCanaryCaught &&
    missingFromLedger.length === 0 &&
    verdict.overLongRefused &&
    verdict.allFillsOnDevice &&
    verdict.unreadableRequestBodies === 0 &&
    verdict.requestsDuringOnDeviceFills === 0;
  const out = {
    label: "SYNTHETIC demo pastes S1-S5 (fixtures/demo); request bodies are not stored, only host/path/size and paste-token hit counts",
    date,
    commit: sha,
    base: base ?? "http://localhost:3102 (static export)",
    capture: "CDP Network.requestWillBeSent on the page + Target.setAutoAttach({flatten:true}) children (iframes, workers)",
    rule: "paste tokens = digit runs >= 4 + words >= 4 chars minus the empty form's vocabulary and a stop-list (src/ledger/tokens.ts)",
    attachedTargets: attached,
    fills: results,
    verdict,
    requests: rows,
  };
  const OUT = path.join(ROOT, "evidence/network");
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${date}-${sha}${base ? "-live" : "-local"}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  fs.copyFileSync(file, path.join(path.dirname(file), "latest.json")); // /receipt renders this one
  console.log(JSON.stringify(verdict, null, 1));
  console.log(`requests: ${rows.length} (${[...new Set(rows.map((r) => r.host))].join(", ")}) -> ${path.relative(ROOT, file)}`);
  if (!verdict.pass) process.exitCode = 1;
} finally {
  await chrome.close();
  srv.close();
}
