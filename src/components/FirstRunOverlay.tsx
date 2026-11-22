"use client";
// Shown while the on-device model is being downloaded for the first time (initializeDeviceModel progress).
import Modal from "./Modal";

export default function FirstRunOverlay({ open, progress, onUseCloud }: { open: boolean; progress: number | null; onUseCloud: () => void }) {
  const pct = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <Modal open={open} onClose={() => {}} label="Getting the on-device model ready">
      <h2 className="cap">First run</h2>
      <p className="big">Getting the on-device model ready — this happens once.</p>
      <div className="bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Model download progress">
        <div className="bar-fill" style={{ width: `${pct ?? 4}%` }} />
      </div>
      <p className="mono" data-testid="download-pct">
        {pct === null ? "starting…" : `${pct}%`}
      </p>
      <p className="fine">It can take several minutes. Your message stays on this laptop while you wait; the fill starts by itself when the model is ready.</p>
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onUseCloud}>
          Allow the cloud for this paste instead
        </button>
      </div>
      <p className="fine">That asks first, shows exactly what would be sent, and the badge says where it actually ran.</p>
    </Modal>
  );
}
