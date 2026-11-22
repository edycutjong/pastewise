"use client";
// The footer receipt strip and the request table. Shared by the Fill screen and /receipt.
import Link from "next/link";
import { ledger } from "@/ledger/egress";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function LedgerStrip({ bytes, records, open = false, link = true, consentBytes = 0 }: { bytes: number; consentBytes?: number; records: ReturnType<typeof ledger.records>; open?: boolean; link?: boolean }) {
  return (
    <div className="strip" id="ledger">
      <div className="strip-row">
        <span className="cap">Text from your paste sent to the cloud</span>
        <b data-testid="ledger-bytes">{fmt(bytes)} bytes found</b>
        {link && (
          <Link className="linkish" href="/receipt/">
            Open the receipt
          </Link>
        )}
      </div>
      {consentBytes > 0 && (
        <div className="strip-row" data-testid="consent-bytes">
          <span className="cap">Sent with your Yes (the message you agreed to send)</span>
          <b>{fmt(consentBytes)} bytes</b>
        </div>
      )}
      {records.some((r) => r.unreadable) && (
        <div className="notice" role="status">
          {records.filter((r) => r.unreadable).length} request(s) had a body this page could not read, so they are not counted above — see the
          table.
        </div>
      )}
      <details open={open || undefined}>
        <summary>
          {records.length} outbound request{records.length === 1 ? "" : "s"} this session, each checked for words and numbers from your paste
        </summary>
        <table>
          <thead>
            <tr>
              <th>t (ms)</th>
              <th>host</th>
              <th>purpose</th>
              <th>bytes</th>
              <th>paste bytes found</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td>{r.t}</td>
                <td>{r.host}</td>
                <td>{r.purpose}</td>
                <td>{fmt(r.size)}</td>
                <td>{r.unreadable ? "unreadable body" : fmt(r.pasteBytesFound)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Counting rule: words of 4+ letters and digit runs of 4+ digits from your paste, minus the empty form&apos;s own labels and
          common words. Each request is checked against every message filled in this session; a request sent before your first Fill
          has nothing to be checked against. Not caught: shorter pieces, text changed before sending, and the reCAPTCHA frame (the recorded
          browser network log in this repo covers those).
        </p>
      </details>
    </div>
  );
}
