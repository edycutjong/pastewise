// Records ONE real on-device run of the synthetic demo message S1 on form C into evidence/replay/s1.json.
// The consent sheet replays it, stamped RECORDED with date, machine and commit. Synthetic text only.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, serveOut, launchChrome, openApp, fillOnce } from "./lib/chrome.mjs";

const S1 = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/demo/S1.json"), "utf8"));
const srv = serveOut();
const chrome = await launchChrome();
try {
  const page = await openApp(chrome.browser, { today: "2026-11-22" });
  const spec = await page.evaluate(() => window.__pastewise.schema("C"));
  const rec = await fillOnce(page, "C", S1.paste);
  if (!rec.batches.every((b) => b.inferenceSource === "on_device")) throw new Error("not an on-device run");
  const ua = await page.evaluate(() => navigator.userAgent);
  const cap = Object.fromEntries(spec.fields.map((f) => [f.key, f.label]));
  const reasonText = { two_candidates: "two numbers in the text", not_in_text: "not in the text", format: "format" };
  const out = {
    label: "Synthetic message S1 on the consignment note (form C)",
    recorded: new Date().toISOString(),
    commit: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    machine: "Apple M1 Max, 32 GB",
    chrome: /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? "unknown",
    form: "C",
    paste: S1.paste,
    inferenceSource: "on_device",
    totalMs: rec.totalMs,
    fields: spec.fields.map((f) => {
      const r = rec.fields[f.key];
      return { key: f.key, caption: cap[f.key], state: r.state === "found" ? "found" : r.state === "amber" ? "amber" : "empty", value: r.value ?? "", note: r.reason ? (reasonText[r.reason] ?? r.reason) : undefined };
    }),
  };
  fs.mkdirSync(path.join(ROOT, "evidence/replay"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "evidence/replay/s1.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(JSON.stringify(out.fields.map((f) => `${f.key}=${f.state}`)));
} finally {
  await chrome.close();
  srv.close();
}
