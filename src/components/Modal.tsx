"use client";
// A thin wrapper over the native <dialog>: focus trap, Esc to close and inert background come from the browser.
// `onClose` means "the person dismissed it": it is not called when the page closes the dialog itself, and a dialog
// that must not be dismissed is shown again if the browser closes it anyway (Chrome lets a second Esc through).
import { useEffect, useRef } from "react";

export default function Modal({ open, onClose, label, children, dismissable = true }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode; dismissable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
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
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onClose={() => {
        if (!openRef.current) return; // the page closed it (open went false): nothing was dismissed
        if (dismissable) onClose();
        else ref.current?.showModal();
      }}
      onCancel={(e) => {
        if (!dismissable) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.repeat) e.preventDefault(); // a held Enter never presses a button twice
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
