"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

// Shared sheet behavior: body scroll lock while open, Escape to close. The
// lock releases around print because Chrome can clip an overflow-hidden body
// to a single printed page.
export function useSheetBehavior(onClose: () => void) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const beforePrint = () => {
      document.body.style.overflow = prev;
    };
    const afterPrint = () => {
      document.body.style.overflow = "hidden";
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

// The one overlay shell every schedule sheet shares: bottom sheet on mobile,
// right-side panel on md+ (.cp-sheet / .cp-sheet-backdrop in canes.css).
export function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useSheetBehavior(onClose);

  return (
    <>
      <div className="cp-sheet-backdrop" onClick={onClose} />
      <div className="cp-sheet cp-scroll" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--cp-line)] bg-[var(--cp-surface)] px-4 py-3">
          <p className="cp-mono">{title}</p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--cp-muted)] hover:bg-[var(--cp-hover)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="px-4 pb-6 pt-4">{children}</div>
      </div>
    </>
  );
}
