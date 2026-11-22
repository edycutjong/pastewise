"use client";
// The live half of /receipt: this browser session's own request ledger. Installed here too, so a direct
// visit to /receipt/ starts counting from page load (a visit after the Fill screen keeps the Fill session's records).
import { useMemo, useSyncExternalStore } from "react";
import { installLedger, ledger } from "@/ledger/egress";
import LedgerStrip from "./LedgerStrip";

installLedger();

export default function ReceiptLive() {
  const v = useSyncExternalStore(ledger.subscribe, ledger.version, () => "0:0");
  const records = useMemo(() => (v ? ledger.records() : []), [v]);
  const bytes = records.reduce((n, r) => n + r.pasteBytesFound, 0);
  return <LedgerStrip bytes={bytes} records={records} consentBytes={ledger.consentBytes()} open link={false} />;
}
