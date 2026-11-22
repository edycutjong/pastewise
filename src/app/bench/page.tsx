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
  stalledRun?: boolean;
  note?: string;
};

const ABOUT: Record<string, string> = {
  "continuity-20": "The 20 order and booking messages from the kill test, on the plain order form (A) and the hotel form (B). The messages themselves are not published; the file hash below identifies them. The prompt and the gate were shaped by this set's failures, so it is a continuity check, not a held-out measure.",
  "form-c-mid": "10 order messages for the legacy consignment-note form (C), whose boxes have cryptic names like CNEE and ZIP. Used while building, so not a held-out set.",
  dev: "The tuning set used while building.",
  bench: "60 order messages (each run on the plain order form A and on the legacy consignment-note form C) and 60 hotel-booking messages (form B): 180 message-form pairs, written before any run and used to decide what the gate must never show as found. Not a held-out set. The first rows were measured with gate v3; gate v4 then made recipient-name boxes always amber (see the per-form table).",
  holdout: "45 message-form pairs (15 orders on forms A and C, 15 bookings on form B) written without sight of any bench result and hashed before the first run, with traps the bench does not contain: two dates, relative dates, number words, RT/RW address parts, forwarded headers. Run once per prompt and gate version, on the frozen release.",
};

function load(): Agg[] {
  const dir = path.join(process.cwd(), "evidence/bench/aggregates");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Agg)
    .sort((a, b) => (a.date + a.set).localeCompare(b.date + b.set) || Number(!!b.stalledRun) - Number(!!a.stalledRun) || (a.arm === b.arm ? 0 : a.arm === "off" ? -1 : 1));
}

const pct = (r: Range) => `${r.mean.toFixed(1)}% (${r.min.toFixed(1)}–${r.max.toFixed(1)})`;
const secs = (r: Range) => `${(r.mean / 1000).toFixed(1)} s${r.max - r.min > 1000 ? ` (${(r.min / 1000).toFixed(1)}–${(r.max / 1000).toFixed(1)})` : ""}`;
// Same set file, same prompt and gate, not a stalled run. (Two commits can differ by tests and scripts only; the aggregate records the commit.)
const sameRun = (a: Agg, b: Agg) =>
  a.set === b.set && a.setSha256 === b.setSha256 && a.promptVersion === b.promptVersion && a.gateVersion === b.gateVersion && !a.stalledRun && !b.stalledRun;

type FormStats = { strictAccuracy: number; wrongShown: number; criticalWrongShown: number; amber: number; amberButRight: number; warmP50: number; warmP95: number; pastes: number; jsonValid: string };
type Report = { set: string; gateView: string; arms: Record<string, { repeats: number; byForm: Record<string, FormStats> }>; file: string };

function loadReports(): Report[] {
  const dir = path.join(process.cwd(), "evidence/bench");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^report-.*\.json$/.test(f))
    .sort()
    .map((f) => ({ ...(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Report), file: f }));
}

export const metadata = { title: "Bench — Pastewise" };

export default function Bench() {
  const all = load();
  const sets = [...new Set(all.map((a) => a.set))];
  const reports = loadReports();
  return (
    <>
      <header className="top">
        <h1>Bench</h1>
        <p>
          Measured on one laptop through the real Fill button, with the on-device model. Every figure comes from a committed file in{" "}
          <span className="mono">evidence/bench/aggregates/</span>; only the captions are written by hand.
        </p>
      </header>
      <SiteNav current="bench" />
      <main className="page">
        {all.length === 0 && <p className="notice">No bench run is committed yet.</p>}
        {sets.map((set) => {
          const rows = all.filter((a) => a.set === set);
          const first = rows.find((r) => !r.stalledRun) ?? rows[0];
          return (
            <section key={set} className="sheet" aria-label={`Set ${set}`}>
              <h2 className="cap">
                Set {set} · {first.pastes} pastes · forms {first.forms.join(", ")}
              </h2>
              {ABOUT[set] && <p className="fine">{ABOUT[set]}</p>}
              <table className="data">
                <thead>
                  <tr>
                    <th>Teacher hints</th>
                    <th>Wrong value shown as found (% of all boxes)</th>
                    <th>Right value in the box (strict)</th>
                    <th>Filled (coverage)</th>
                    <th>Filled and right</th>
                    <th>Left amber</th>
                    <th>Warm p50 / p95</th>
                    <th>JSON valid per repeat</th>
                    <th>Run</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={`${a.arm}-${a.commit}${a.stalledRun ? "-stalled" : ""}`}>
                      <td>
                        {a.arm === "off" ? "off" : `on (hints from the ${a.hintsSource === "cloud" ? "cloud teacher" : a.hintsSource})`}
                        {a.stalledRun && <div className="fine">first run, with model stalls{a.note ? " — see note" : ""}</div>}
                      </td>
                      <td>{pct(a.metrics.acceptedWrongPct)}</td>
                      <td>{pct(a.metrics.rawAccuracyStrict)}</td>
                      <td>{pct(a.metrics.coverage)}</td>
                      <td>{pct(a.metrics.usefulCoverage)}</td>
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
              {rows.filter((a) => a.note).map((a) => (
                <p key={`${a.arm}-${a.commit}${a.stalledRun ? "-stalled" : ""}-note`} className="fine">
                  Note: {a.note}
                </p>
              ))}
              {rows
                .filter((a) => a.arm === "hints")
                .map((h) => {
                  const off = rows.find((o) => o.arm === "off" && sameRun(o, h));
                  if (!off) return null;
                  const verdict = (k: "rawAccuracyStrict" | "acceptedWrongPct", label: string) => {
                    const hi = h.metrics[k];
                    const lo = off.metrics[k];
                    const delta = +(hi.mean - lo.mean).toFixed(1);
                    const apart = hi.min > lo.max || hi.max < lo.min;
                    return `${label}: ${lo.mean.toFixed(1)}% → ${hi.mean.toFixed(1)}% (${delta >= 0 ? "+" : ""}${delta} points) — ${apart ? "outside the run-to-run spread" : "within the run-to-run spread, so no measurable difference"}`;
                  };
                  return (
                    <p key={h.commit} className="delta">
                      Hints off → on, same commit. {verdict("rawAccuracyStrict", "Right value in the box")}. {verdict("acceptedWrongPct", "Wrong value shown as found")}.
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
        {reports.map((r) => (
          <section key={r.file} className="sheet" aria-label={`Per form ${r.file}`}>
            <h2 className="cap">
              By form · set {r.set} · {r.gateView}
            </h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Teacher hints</th>
                  <th>Right value in the box (strict)</th>
                  <th>Wrong value shown as found</th>
                  <th>…of which name, phone, address, postal code</th>
                  <th>Left amber</th>
                  <th>Warm p50 / p95</th>
                  <th>JSON valid</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(r.arms).flatMap(([arm, a]) =>
                  Object.entries(a.byForm).map(([form, v]) => (
                    <tr key={`${arm}-${form}`}>
                      <td>{form}</td>
                      <td>{arm === "off" ? "off" : "on"}</td>
                      <td>{v.strictAccuracy.toFixed(1)}%</td>
                      <td>{v.wrongShown.toFixed(1)}%</td>
                      <td>{v.criticalWrongShown.toFixed(1)}%</td>
                      <td>{v.amber.toFixed(1)}%</td>
                      <td>
                        {(v.warmP50 / 1000).toFixed(1)} s / {(v.warmP95 / 1000).toFixed(1)} s
                      </td>
                      <td>{v.jsonValid}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            <p className="fine">
              Pooled over {Object.values(r.arms)[0]?.repeats} repeats. From <span className="mono">evidence/bench/{r.file}</span>, computed by{" "}
              <span className="mono">scripts/bench_report.mjs</span> from the raw run rows.
            </p>
          </section>
        ))}
        <section className="sheet" aria-label="How to read this">
          <h2 className="cap">How to read this</h2>
          <p>
            “Wrong value shown as found” counts values that the code accepted (they appear in the message and pass the field&apos;s format check) but
            that are not the right value for that box. The code checks presence and format, not truth, so this number is never zero and the boxes stay
            editable. Names are never shown as found: after the bench, the recipient-name boxes became always amber (gate v4). Only the held-out set was measured on that frozen release; the bench and earlier sets were used while building. The bars set before the held-out run were missed, and the numbers above say by how much.
          </p>
        </section>
      </main>
    </>
  );
}
