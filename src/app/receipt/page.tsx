import fs from "node:fs";
import path from "node:path";
import SiteNav from "@/components/SiteNav";
import ReceiptLive from "@/components/ReceiptLive";

export const metadata = { title: "Receipt — Pastewise" };

type Net = {
  label: string;
  date: string;
  commit: string;
  base: string;
  capture: string;
  rule: string;
  fills: { id: string; form: string; inferenceSource?: string[]; requestsDuring?: number }[];
  verdict: Record<string, unknown> & { pass: boolean };
  requests: unknown[];
};

function latest(): { file: string; net: Net } | null {
  const dir = path.join(process.cwd(), "evidence/network");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const file = files.includes("latest.json") ? "latest.json" : files.at(-1); // the egress script refreshes latest.json on every run
  return file ? { file, net: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Net } : null;
}

export default function Receipt() {
  const rec = latest();
  return (
    <>
      <header className="top">
        <h1>Receipt</h1>
        <p>Every request this page made since you opened it, checked for words and numbers from your message. Plus the recorded network log of a real run.</p>
      </header>
      <SiteNav current="receipt" />
      <main className="page">
        <section className="sheet" aria-label="This session">
          <h2 className="cap">This session, live</h2>
          <ReceiptLive />
        </section>
        <section className="sheet" aria-label="Recorded network log">
          <h2 className="cap">Recorded network log (browser DevTools protocol, all frames)</h2>
          {rec ? (
            <>
              <p>
                File <span className="mono">evidence/network/{rec.file}</span> · commit {rec.net.commit} · {rec.net.date} · {rec.net.requests.length} requests
                recorded. Run: {rec.net.fills.length} synthetic messages; fills answered on-device: {rec.net.fills.filter((f) => f.inferenceSource?.length && f.inferenceSource.every((s) => s === "on_device")).length} (a message over the length limit is refused, not filled);
                requests made during those fills:{" "}
                {rec.net.fills.reduce((n, f) => n + (f.requestsDuring ?? 0), 0)}.
              </p>
              <table className="data">
                <tbody>
                  {Object.entries(rec.net.verdict).map(([k, v]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{JSON.stringify(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="fine">Capture: {rec.net.capture}. Counting rule: {rec.net.rule}. The log stores host, path, size and hit counts, never request bodies.</p>
            </>
          ) : (
            <p className="notice">No recorded network log is committed yet.</p>
          )}
        </section>
        <section className="sheet" aria-label="What this does not prove">
          <h2 className="cap">What this does not prove</h2>
          <p>
            Short words and numbers under four characters are not counted, text that was changed before sending is not recognised, and the reCAPTCHA frame is a
            separate page that this ledger cannot read (the recorded log above covers it). A zero means no 4+ character word or number from your message was found in any request,
            not a promise about every possible encoding. When you use the no-Nano consent path, the one message you agree to send is counted separately as “sent with your Yes”.
          </p>
        </section>
      </main>
    </>
  );
}
