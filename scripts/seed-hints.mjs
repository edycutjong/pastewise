// Seeds the read-only Firestore hint copies (hints/<form fingerprint>) from REAL ONLY_IN_CLOUD teacher calls on the
// empty forms. Builder-run only: clients cannot write (firestore.rules). Needs `gcloud auth print-access-token` for the
// Firebase project's owner; the token is never printed or stored. Stores structure-derived hints only.
// Usage: npm run build && node scripts/seed-hints.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, serveOut, launchChrome, openApp } from "./lib/chrome.mjs";

const PROJECT = process.env.FIREBASE_PROJECT ?? "pastewise-hybrid-ai";
const token = execSync("gcloud auth print-access-token", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
const srv = serveOut();
const chrome = await launchChrome();
const date = new Date().toISOString().slice(0, 10);
const log = [];
try {
  const page = await openApp(chrome.browser, {});
  for (const form of ["A", "B", "C"]) {
    const fp = await page.evaluate((f) => window.__pastewise.fingerprint(f), form);
    const t = await page.evaluate((f) => window.__pastewise.teach(f), form);
    if (t.inferenceSource !== "in_cloud" || !t.hints.length) throw new Error(`teacher for ${form}: ${t.inferenceSource} / ${t.hints.length} hints`);
    const body = {
      fields: {
        form: { stringValue: form },
        seededAt: { stringValue: new Date().toISOString() },
        source: { stringValue: "ONLY_IN_CLOUD teacher call on the empty form" },
        hints: {
          arrayValue: {
            values: t.hints.map((h) => ({ mapValue: { fields: { key: { stringValue: h.key }, meaning: { stringValue: h.meaning }, expected: { stringValue: h.expected } } } })),
          },
        },
      },
    };
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/hints/${fp}`;
    const res = await fetch(url, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Firestore write ${form}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    log.push({ form, fingerprint: fp, hints: t.hints.length, teacherMs: t.ms, inferenceSource: t.inferenceSource });
    console.log(`seeded ${form} ${fp.slice(0, 12)}… ${t.hints.length} hints (${t.ms} ms, ${t.inferenceSource})`);
  }
  fs.writeFileSync(path.join(ROOT, `evidence/seed-hints-${date}.json`), JSON.stringify({ project: PROJECT, date, docs: log }, null, 1) + "\n");
} finally {
  await chrome.close();
  srv.close();
}
