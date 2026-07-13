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
  size = "default",
  bodyClassName = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "default" | "wide";
  bodyClassName?: string;
}) {
  useSheetBehavior(onClose);

  return (
    <>
      <div className="cp-sheet-backdrop" onClick={onClose} />
      <div
        className="cp-sheet cp-scroll"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Grabber — bottom-sheet affordance on mobile only; the desktop
            right-panel has no drag handle. */}
        <div className="cp-grabber md:hidden" />
        <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-[var(--cp-line)] bg-[var(--cp-surface)]/95 px-4 backdrop-blur-sm md:px-6">
          <p className="cp-mono">{title}</p>
          <button
            type="button"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-[var(--cp-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-brand)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className={`px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5 ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </>
  );
}
