"use client";
// "Teach this form": the cloud sees the EMPTY form only. The outbound payload is shown before anything is sent.
import Modal from "./Modal";
import type { TeacherPayload } from "@/ai/teacher";
import type { Hint } from "@/schema/buildSchema";

export type Taught = {
  hints: Hint[];
  /** where the hints came from: a fresh cloud call just now, or the builder-seeded copy in Firestore */
  source: "cloud" | "saved";
  inferenceSource?: string;
  ms?: number;
  savedAt?: string;
  /** set when a fresh call failed and the saved copy was used instead */
  fallbackWhy?: string;
};

export default function TeachDrawer(props: {
  open: boolean;
  onClose: () => void;
  formTitle: string;
  payload: TeacherPayload | null;
  taught: Taught | undefined;
  hintsOn: boolean;
  onToggle: (on: boolean) => void;
  status: "idle" | "sending" | "error";
  error: string | null;
  killSwitch: boolean;
  onSend: () => void;
}) {
  const { open, onClose, formTitle, payload, taught, hintsOn, onToggle, status, error, killSwitch, onSend } = props;
  return (
    <Modal open={open} onClose={onClose} label="Teach this form">
      <h2 className="cap">Teach this form — {formTitle}</h2>
      <p className="big">The cloud sees the empty form only: labels, field names and options. Never your message.</p>
      <p className="fine">This is the exact payload that would be sent (no values, because no message is read here):</p>
      <pre className="payload mono" data-testid="teach-payload">
        {payload ? JSON.stringify(payload, null, 1) : "…"}
      </pre>
      {killSwitch && <p className="notice">The cloud is switched off right now, so a fresh call is not possible. The saved copy is used if there is one.</p>}
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onSend} aria-disabled={status === "sending"} disabled={status === "sending" || killSwitch}>
          {status === "sending" ? "Asking the cloud teacher…" : taught ? "Ask again with this empty form" : "Send this empty form"}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {status === "error" && error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}
      {taught && (
        <section aria-label="Hints">
          <p className="fine" data-testid="teach-source">
            {taught.source === "cloud"
              ? `From a fresh cloud call just now · ${taught.inferenceSource ?? "source unknown"} · ${((taught.ms ?? 0) / 1000).toFixed(1)} s`
              : `Saved copy, seeded by the builder on ${taught.savedAt ?? "an unknown date"}${taught.fallbackWhy ? ` · used because ${taught.fallbackWhy}` : ""}`}
          </p>
          <label className="toggle">
            <input type="checkbox" checked={hintsOn} onChange={(e) => onToggle(e.target.checked)} /> Hints {hintsOn ? "on" : "off"} for this form — the next Fill uses them only when on
          </label>
          <table className="data">
            <thead>
              <tr>
                <th>Field</th>
                <th>Plain meaning</th>
                <th>Expected</th>
              </tr>
            </thead>
            <tbody>
              {taught.hints.map((h) => (
                <tr key={h.key}>
                  <td>{h.key}</td>
                  <td>{h.meaning}</td>
                  <td>{h.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Modal>
  );
}
