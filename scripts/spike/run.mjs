// P1a spike driver: serves the static export, opens /spike/ in the installed Chrome
// (profile with Gemini Nano downloaded), and proves each Firebase AI Logic call.
// Usage: [BASE_URL=https://<deploy>] SETFILE=<set.json> OUT=<dir> PW_APPCHECK_DEBUG_TOKEN=<token> REPEATS=3 node scripts/spike/run.mjs
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = process.env.OUT ?? path.join(ROOT, "evidence/spike");
const SET = JSON.parse(fs.readFileSync(process.env.SETFILE, "utf8"));
const REPEATS = Number(process.env.REPEATS ?? 3);
const PROFILE = process.env.PW_CHROME_PROFILE ?? `${process.env.HOME}/.cache/shape-nano-chrome`;
const PORT = 3102;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`; // set BASE_URL to test a deployed build
fs.mkdirSync(OUT, { recursive: true });

// ---- prompt (same text as the on-device kill test, prompt v3) ----
const GUIDE =
  `You fill in a web form from a message the user copied. Read the message and return JSON with one string value per form field. Copy each value exactly as it is written in the message. If the message does not give a field, return an empty string "". Never guess.` +
  `\nRules: phone = digits as written (keep a leading + or 0); date = YYYY-MM-DD (today's date is given; use it only to fill in a missing year); quantity = digits only; room type must be one of the options or "". Do not invent a province, name, email or note that is not in the message. Ignore numbers that are not the field asked for (booking numbers, old phone numbers the sender says to ignore).` +
  `\nExample message: "Hi, Ali here, want 3 red mugs to Jl. Baru 1, Kediri, 64100. call me 0812 000 111" for fields name, phone, street, city, province, postal_code, item, quantity, notes -> {"name":"Ali","phone":"0812000111","street":"Jl. Baru 1","city":"Kediri","province":"","postal_code":"64100","item":"red mugs","quantity":"3","notes":""}`;
const schemaFor = (form) => ({
  type: "object",
  properties: Object.fromEntries(
    form.fields.map((f) => [f.k, f.type === "enum" ? { type: "string", enum: ["", ...f.options] } : { type: "string", maxLength: f.type === "text" ? 120 : 40 }]),
  ),
  required: form.fields.map((f) => f.k),
  additionalProperties: false,
});
const mkPrompt = (form, paste) =>
  `${GUIDE}\nToday: ${SET.today}\nForm: ${form.title}\nFields:\n${form.fields.map((f) => `- ${f.k}: ${f.label}${f.options ? " (one of: " + f.options.join(", ") + ")" : ""}`).join("\n")}\n\nMessage:\n"""\n${paste}\n"""\n\nJSON:`;

// ---- form C (10 cryptic fields) + synthetic paste S1 ----
const FORM_C = {
  title: "Consignment note",
  fields: [
    { k: "cnee_nm", label: "CNEE", type: "text" },
    { k: "cnee_tel", label: "CNEE TEL", type: "phone" },
    { k: "addr_1", label: "ADDR 1", type: "text" },
    { k: "dist_city", label: "DIST/CITY", type: "text" },
    { k: "st_prov", label: "ST/PROV", type: "text" },
    { k: "zip", label: "ZIP", type: "postal" },
    { k: "desc", label: "DESC", type: "text" },
    { k: "pcs", label: "PCS", type: "int" },
    { k: "svc", label: "SVC", type: "enum", options: ["STD", "EXP", "SDD"] },
    { k: "rmks", label: "RMKS", type: "text" },
  ],
};
const S1 = `hiii 👋 it's Maya Kusuma again! can u send the 2 linen tablecloths (the sage ones) to my mom this time:
Mrs. Ratna Kusuma, Jl. Cempaka Putih Raya No. 41, Jakarta Pusat 10510.
her old number 0813-5550-2290 is dead don't use it, new one is 0857 5550 8812.
express pls, she needs them before Friday 🙏 leave at the guard post if nobody home`;
const emptyFormText = (form) =>
  `Form: ${form.title}\n` + form.fields.map((f) => `- key ${f.k}, printed caption "${f.label}"${f.options ? `, options ${f.options.join("/")}` : ""}`).join("\n");

// ---- static server for out/ ----
const OUTDIR = path.join(ROOT, "out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain", ".svg": "image/svg+xml" };
const srv = process.env.BASE_URL ? { close() {} } : http
  .createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(OUTDIR, p);
    if (!f.startsWith(OUTDIR) || !fs.existsSync(f)) return r.writeHead(404).end("not found");
    r.setHeader("content-type", TYPES[path.extname(f)] ?? "application/octet-stream");
    fs.createReadStream(f).pipe(r);
  })
  .listen(PORT);

// ---- Chrome (never two instances on this profile) ----
try {
  execSync(`pgrep -f ${path.basename(PROFILE)}`);
  throw new Error(`Chrome already running on ${PROFILE}`);
} catch (e) {
  if (String(e.message).startsWith("Chrome already")) throw e;
}
const proc = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [`--user-data-dir=${PROFILE}`, "--remote-debugging-port=9334", "--no-first-run", "--no-default-browser-check", "about:blank"],
  { stdio: "ignore" },
);
let browser;
for (let i = 0; i < 60 && !browser; i++) {
  try {
    browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9334", defaultViewport: null, protocolTimeout: 900000 });
  } catch {
    await sleep(500);
  }
}
if (!browser) throw new Error("could not connect to Chrome");

const page = await browser.newPage();
if (process.env.PW_APPCHECK_DEBUG_TOKEN) {
  await page.evaluateOnNewDocument((t) => {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = t;
  }, process.env.PW_APPCHECK_DEBUG_TOKEN);
}

// Record the options the SDK passes to LanguageModel.create / prompt (proves createOptions + responseConstraint pass through).
await page.evaluateOnNewDocument(() => {
  window.__pwCreateLog = [];
  const wrap = () => {
    const LM = globalThis.LanguageModel;
    if (!LM || LM.__pwWrapped) return;
    const create = LM.create.bind(LM);
    LM.create = async (opts) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped so the log shows only the options that matter
      const { monitor, signal, ...rest } = opts ?? {};
      window.__pwCreateLog.push({ create: rest });
      const session = await create(opts);
      const prompt = session.prompt.bind(session);
      session.prompt = (input, po) => {
        window.__pwCreateLog.push({ promptOptionKeys: Object.keys(po ?? {}), hasResponseConstraint: !!po?.responseConstraint });
        return prompt(input, po);
      };
      return session;
    };
    LM.__pwWrapped = true;
  };
  wrap();
  document.addEventListener("DOMContentLoaded", wrap);
});

// Network log: every request from every frame, tagged with the phase it happened in.
let phase = "load";
const net = [];
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
cdp.on("Network.requestWillBeSent", (e) =>
  net.push({ phase, url: e.request.url.split("?")[0], method: e.request.method, postBytes: e.request.postData ? Buffer.byteLength(e.request.postData) : 0 }),
);
const AI_HOSTS = /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com/;
const netIn = (ph) => net.filter((n) => n.phase === ph && !n.url.startsWith(BASE) && !n.url.startsWith("data:"));

await page.goto(`${BASE}/spike/`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelector("#status")?.textContent === "ready", { timeout: 30000 });
const S = {};
S.userAgent = await page.evaluate(() => navigator.userAgent);
S.availability = await page.evaluate(() => window.__pwSpike.availability());

phase = "appcheck";
S.appCheck = await page.evaluate(() => window.__pwSpike.appCheck());
phase = "remoteconfig";
S.remoteConfig = await page.evaluate(() => window.__pwSpike.remoteConfig());

phase = "init";
await page.click("#prepare"); // real input event = user activation
await page.waitForFunction(() => /init: (done|error|NO_API)/.test(document.querySelector("#status")?.textContent ?? ""), { timeout: 600000 });
S.init = await page.$eval("#status", (e) => e.textContent);
console.log("availability", S.availability, "| appCheck", S.appCheck.ok, "| RC", S.remoteConfig.ok, "| init", S.init);

// Frozen-20 through AI Logic ONLY_ON_DEVICE, REPEATS times (P0c raw-file format, so the P0c scorer reads it).
phase = "device-fill";
S.deviceRuns = [];
for (let rep = 1; rep <= REPEATS; rep++) {
  const res = [];
  let first = true;
  for (const it of SET.test) {
    const form = SET.forms[it.form];
    const r = await page.evaluate((p, s) => window.__pwSpike.fillOnDevice(p, s), mkPrompt(form, it.paste), schemaFor(form));
    res.push({ id: it.id, form: it.form, cold: first && rep === 1, out: r.text ?? "", err: r.error ?? "", createMs: 0, promptMs: r.ms, inferenceSource: r.inferenceSource });
    first = false;
    console.log(`r${rep}`, it.id, r.ms + "ms", r.inferenceSource, r.error ?? (r.text ?? "").slice(0, 70).replace(/\n/g, " "));
  }
  const file = path.join(OUT, `raw-test-ailogic-r${rep}.json`);
  fs.writeFileSync(file, JSON.stringify({ set: "test", prompt: "v3", via: "firebase-ai-logic ONLY_ON_DEVICE", availability: S.availability, ua: S.userAgent, res }, null, 1));
  S.deviceRuns.push({ file: path.basename(file), sources: [...new Set(res.map((x) => x.inferenceSource))], errors: res.filter((x) => x.err).length });
}
S.deviceFillNetwork = { total: netIn("device-fill").length, aiEndpoint: netIn("device-fill").filter((n) => AI_HOSTS.test(n.url)).length, requests: netIn("device-fill") };

// 10-field schema (form C) on device.
phase = "form-c-10";
S.formC = [];
for (let i = 0; i < 3; i++) {
  const r = await page.evaluate((p, s) => window.__pwSpike.fillOnDevice(p, s), mkPrompt(FORM_C, S1), schemaFor(FORM_C));
  let valid = false;
  try {
    const o = JSON.parse(r.text);
    valid = FORM_C.fields.every((f) => typeof o[f.k] === "string") && Object.keys(o).length === FORM_C.fields.length;
  } catch {}
  S.formC.push({ ...r, schemaValid: valid });
  console.log("formC", r.ms + "ms", r.inferenceSource, valid, r.error ?? r.text);
}
S.formCNetwork = { aiEndpoint: netIn("form-c-10").filter((n) => AI_HOSTS.test(n.url)).length };

// Teacher: ONLY_IN_CLOUD, sees the empty form only.
phase = "teacher";
const teacherModelName = S.remoteConfig.values?.teacher_model?.split(" ")[0] ?? "gemini-3.5-flash-lite";
S.teacher = await page.evaluate((f, m) => window.__pwSpike.teach(f, m), emptyFormText(FORM_C), teacherModelName);
S.teacherNetwork = netIn("teacher").map((n) => ({ url: n.url, method: n.method, postBytes: n.postBytes }));
console.log("teacher", S.teacher.ms + "ms", S.teacher.inferenceSource, S.teacher.error ?? S.teacher.text?.slice(0, 160));

// Consent path model (PREFER_ON_DEVICE). On this Nano profile it must stay on device.
phase = "consent";
// Uses the synthetic S1 fixture, never a set item: this summary is committed as evidence.
S.consent = await page.evaluate((p, s, m) => window.__pwSpike.consentFill(p, s, m), mkPrompt(FORM_C, S1), schemaFor(FORM_C), teacherModelName);
S.consentNetwork = { aiEndpoint: netIn("consent").filter((n) => AI_HOSTS.test(n.url)).length };
console.log("consent", S.consent.ms + "ms", S.consent.inferenceSource, S.consent.error ?? S.consent.text?.slice(0, 80));

S.sdkPassThrough = await page.evaluate(() => {
  const log = window.__pwCreateLog ?? [];
  return { creates: log.filter((x) => x.create).length, uniqueCreateOptions: [...new Set(log.filter((x) => x.create).map((x) => JSON.stringify(x.create)))].map((x) => JSON.parse(x)), prompts: log.filter((x) => "hasResponseConstraint" in x).length, promptsWithResponseConstraint: log.filter((x) => x.hasResponseConstraint).length };
});
console.log("sdkPassThrough", JSON.stringify(S.sdkPassThrough));
S.allExternalHosts = [...new Set(net.filter((n) => /^https?:/.test(n.url) && !n.url.startsWith(BASE)).map((n) => new URL(n.url).host))].sort();
S.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "spike-summary.json"), JSON.stringify(S, null, 1));
console.log("hosts", S.allExternalHosts.join(", "));
await browser.disconnect();
proc.kill();
srv.close();
process.exit(0);
