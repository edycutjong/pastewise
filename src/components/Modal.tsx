"use client";
// A thin wrapper over the native <dialog>: focus trap, Esc to close and inert background come from the browser.
import { useEffect, useRef } from "react";

export default function Modal({ open, onClose, label, children, dismissable = true }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode; dismissable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // the safe button takes focus first: a held/repeated Enter from the shortcut must never land on a "Send"
      (d.querySelector("[data-autofocus]") as HTMLElement | null)?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-label={label} onClose={onClose} onCancel={(e) => (dismissable ? onClose() : e.preventDefault())}>
      {open ? children : null}
    </dialog>
  );
}
