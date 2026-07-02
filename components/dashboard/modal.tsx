"use client";

// Lightweight dashboard dialog — portal + Escape + scroll lock. Used by the
// action-item overview, the AI action workflow, the store scoreboard and the
// account panel. Matches the dark tooltip/popover surface (#0c0c0c, hairline).

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/dashboard/locale-provider";

export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
  maxWidth = 560,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard users land inside it, not behind it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="theme-scope fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label={t("Close")} className="tip-in absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="no-scrollbar animate-stage-in relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-none border border-edge bg-surface"
        style={{ maxWidth, boxShadow: "var(--modal-shadow)" }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-edge bg-surface/95 px-5 py-4 backdrop-blur-md">
          <div className="min-w-0">
            {eyebrow && (
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-orange" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">{eyebrow}</span>
              </div>
            )}
            {title && <h2 className="mt-2 text-[18px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">{title}</h2>}
          </div>
          <button
            onClick={onClose}
            aria-label={t("Close")}
            className="dash-press grid size-7 shrink-0 cursor-pointer place-items-center rounded-none border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink active:bg-raise"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 border-t border-edge bg-surface/95 px-5 py-4 backdrop-blur-md">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
