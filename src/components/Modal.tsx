"use client";
// A thin wrapper over the native <dialog>: focus trap, Esc to close and inert background come from the browser.
import { useEffect, useRef } from "react";

export default function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-label={label} onClose={onClose} onCancel={onClose}>
      {open ? children : null}
    </dialog>
  );
}
