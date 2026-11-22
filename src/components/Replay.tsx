"use client";
// Replay of a REAL recorded on-device run (evidence/replay/*.json, written by scripts/record_replay.mjs).
// Always stamped RECORDED with date, machine and commit; never presented as live.
import { useEffect, useState } from "react";

export type ReplayData = {
  label: string;
  recorded: string;
  commit: string;
  machine: string;
  chrome: string;
  form: string;
  paste: string;
  inferenceSource: string;
  totalMs: number;
  fields: { key: string; caption: string; state: string; value: string; note?: string }[];
};

export default function Replay({ data }: { data: ReplayData }) {
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (shown >= data.fields.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 350);
    return () => clearTimeout(id);
  }, [playing, shown, data.fields.length]);
  const done = shown >= data.fields.length;
  return (
    <div className="replay" aria-label="Recorded run">
      <span className="stamp">Recorded — not live</span>
      <p className="fine">
        {data.label} · recorded {data.recorded.slice(0, 10)} · {data.machine} · Chrome {data.chrome} · commit {data.commit} · answered {data.inferenceSource.toUpperCase()} in{" "}
        {(data.totalMs / 1000).toFixed(1)} s
      </p>
      <pre className="consent-text">{data.paste}</pre>
      {!playing && (
        <button type="button" className="ghost" onClick={() => setPlaying(true)}>
          Play the recording
        </button>
      )}
      <ul aria-live="polite">
        {data.fields.slice(0, shown).map((f) => (
          <li key={f.key} className={f.state === "amber" ? "amber-row" : undefined}>
            <b>{f.caption}</b> <span>{f.value || "—"}</span> <i>{f.state === "found" ? "found in the text" : f.state === "amber" ? `to check${f.note ? `: ${f.note}` : ""}` : "empty"}</i>
          </li>
        ))}
      </ul>
      {playing && done && <p className="fine">End of the recording.</p>}
    </div>
  );
}
