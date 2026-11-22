import fs from "node:fs";
import path from "node:path";
import SiteNav from "@/components/SiteNav";

// /bench renders ONLY committed evidence: every figure below is read at build time from
// evidence/bench/aggregates/*.json, which scripts/bench.mjs writes after a real run on the app page.
type Range = { mean: number; min: number; max: number };
type Agg = {
  set: string;
  setSha256: string;
  pastes: number;
  forms: string[];
  arm: "off" | "hints";
  hintsSource: string;
  repeats: number;
  date: string;
  commit: string;
  srcDirty: boolean;
  promptVersion: string;
  gateVersion: string;
  chrome: string;
  machine: string;
  contendedBySiblingChrome: boolean;
  metrics: Record<"rawAccuracyStrict" | "acceptedWrongPct" | "coverage" | "usefulCoverage" | "amberPct" | "warmP50" | "warmP95", Range>;
  perRepeat: { jsonValid: string; onDeviceBatches: string }[];
};

function load(): Agg[] {
  const dir = path.join(process.cwd(), "evidence/bench/aggregates");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Agg)
    .sort((a, b) => (a.date + a.set + a.arm).localeCompare(b.date + b.set + b.arm));
}

const pct = (r: Range) => `${r.mean.toFixed(1)}% (${r.min.toFixed(1)}–${r.max.toFixed(1)})`;
const secs = (r: Range) => `${(r.mean / 1000).toFixed(1)} s`;
const sameRun = (a: Agg, b: Agg) => a.set === b.set && a.commit === b.commit && a.setSha256 === b.setSha256;

export const metadata = { title: "Bench — Pastewise" };

export default function Bench() {
  const all = load();
  const sets = [...new Set(all.map((a) => a.set))];
  return (
    <>
      <header className="top">
        <h1>Bench</h1>
        <p>
          Measured on one laptop through the real Fill button, with the on-device model. Each row is a committed file in{" "}
          <span className="mono">evidence/bench/aggregates/</span>; nothing here is typed in by hand.
        </p>
      </header>
      <SiteNav current="bench" />
      <main className="page">
        {all.length === 0 && <p className="notice">No bench run is committed yet.</p>}
        {sets.map((set) => {
          const rows = all.filter((a) => a.set === set);
          const first = rows[0];
          return (
            <section key={set} className="sheet" aria-label={`Set ${set}`}>
              <h2 className="cap">
                Set {set} · {first.pastes} pastes · forms {first.forms.join(", ")}
              </h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>Teacher hints</th>
                    <th>Wrong value shown as found</th>
                    <th>Found in text, correct</th>
                    <th>Filled (coverage)</th>
                    <th>Left amber</th>
                    <th>Warm p50 / p95</th>
                    <th>JSON valid per repeat</th>
                    <th>Run</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={`${a.arm}-${a.commit}`}>
                      <td>{a.arm === "off" ? "off" : `on (${a.hintsSource})`}</td>
                      <td>{pct(a.metrics.acceptedWrongPct)}</td>
                      <td>{pct(a.metrics.rawAccuracyStrict)}</td>
                      <td>{pct(a.metrics.coverage)}</td>
                      <td>{pct(a.metrics.amberPct)}</td>
                      <td>
                        {secs(a.metrics.warmP50)} / {secs(a.metrics.warmP95)}
                      </td>
                      <td>{a.perRepeat.map((r) => r.jsonValid).join(" · ")}</td>
                      <td>
                        {a.date} · {a.commit.slice(0, 7)}
                        {a.srcDirty ? " (dirty)" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows
                .filter((a) => a.arm === "hints")
                .map((h) => {
                  const off = rows.find((o) => o.arm === "off" && sameRun(o, h));
                  if (!off) return null;
                  const d = (k: "rawAccuracyStrict" | "acceptedWrongPct") => +(h.metrics[k].mean - off.metrics[k].mean).toFixed(1);
                  return (
                    <p key={h.commit} className="delta">
                      Hints on vs off, same commit: correct {d("rawAccuracyStrict") >= 0 ? "+" : ""}
                      {d("rawAccuracyStrict")} points, wrong-shown {d("acceptedWrongPct") >= 0 ? "+" : ""}
                      {d("acceptedWrongPct")} points. If the number is near zero, the hints add nothing on this set.
                    </p>
                  );
                })}
              <p className="fine">
                {first.repeats} repeats per row, mean with (min–max). Set sha256 <span className="mono">{first.setSha256.slice(0, 16)}…</span> · prompt{" "}
                {first.promptVersion} · gate v{first.gateVersion} · {first.machine} · Chrome {/Chrome\/([\d.]+)/.exec(first.chrome)?.[1]}
                {rows.some((r) => r.contendedBySiblingChrome) ? " · a second Chrome with the model was running during some rows" : ""}
              </p>
            </section>
          );
        })}
        <section className="sheet" aria-label="How to read this">
          <h2 className="cap">How to read this</h2>
          <p>
            “Wrong value shown as found” counts values that the code accepted (they appear in the message and pass the field&apos;s format check) but
            that are not the right value for that box. The code checks presence and format, not truth, so this number is never zero and the boxes stay
            editable. These sets were used while building; the held-out set is reported only once the code is frozen.
          </p>
        </section>
      </main>
    </>
  );
}
