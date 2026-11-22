"use client";
// Shown while the on-device model is being downloaded for the first time (initializeDeviceModel progress).
import Modal from "./Modal";

export default function FirstRunOverlay({ open, progress, failed, onUseCloud, onClose }: { open: boolean; progress: number | null; failed: string | null; onUseCloud: () => void; onClose: () => void }) {
  const pct = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <Modal open={open} onClose={onClose} label="Getting the on-device model ready" dismissable={!!failed}>
      <h2 className="cap">First run</h2>
      {failed ? (
        <>
          <p className="big" data-testid="download-failed">
            The on-device model didn&apos;t get ready: {failed}
          </p>
          <p className="fine">Nothing was sent anywhere. You can press Fill again to retry, or use the cloud for this one message (it asks first).</p>
        </>
      ) : (
        <>
          <p className="big">Getting the on-device model ready — this happens once.</p>
          <div className="bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Model download progress">
            <div className="bar-fill" style={{ width: `${pct ?? 4}%` }} />
          </div>
          <p className="mono" data-testid="download-pct" role="status" aria-live="polite">
            {pct === null ? "starting…" : `${pct}%`}
          </p>
          <p className="fine">It can take several minutes. Your message stays on this laptop while you wait; the fill starts by itself when the model is ready.</p>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onUseCloud} data-autofocus>
          Use the cloud for this paste instead
        </button>
        {failed && (
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <p className="fine">That asks first on the next sheet: it shows exactly what would be sent, nothing leaves unless you press Send there, and the badge says where it actually ran.</p>
    </Modal>
  );
}
