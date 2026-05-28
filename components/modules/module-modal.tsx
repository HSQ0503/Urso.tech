"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/icon";

type IconName =
  | "star"
  | "calendar"
  | "phone"
  | "pin"
  | "repeat"
  | "bot"
  | "layers"
  | "chart"
  | "dollar"
  | "check";

export type ModuleDetail = {
  tag: IconName;
  title: string;
  tagline: string;
  overview: string;
  included: string[];
  worksWith?: string[];
};

type Props = {
  detail: ModuleDetail | null;
  onClose: () => void;
};

export function ModuleModal({ detail, onClose }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!detail) return;
    const raf = requestAnimationFrame(() => setOpen(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [detail, onClose]);

  if (!detail) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={detail.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 transition-opacity duration-200"
      style={{
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: open ? 1 : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[640px] max-h-[88vh] overflow-y-auto rounded-2xl border border-edge bg-[#0b0b0b] p-7 sm:p-9 transition-all duration-200"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-edge text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2.5 text-orange">
          <Icon name={detail.tag} size={16} />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
            Module
          </span>
        </div>

        <h3 className="mt-3 text-[26px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[30px]">
          {detail.title}
        </h3>
        <p className="mt-2 text-[14.5px] leading-[1.5] text-ink-dim">
          {detail.tagline}
        </p>

        <p className="mt-6 text-[14px] leading-[1.65] text-white/80">
          {detail.overview}
        </p>

        <div className="mt-7">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
            What&apos;s included
          </div>
          <ul className="flex flex-col gap-2.5">
            {detail.included.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[13.5px] leading-[1.5] text-white/85"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  className="mt-[3px] flex-none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 7.2l2.6 2.6L11 4.4"
                    stroke="#FE5100"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {detail.worksWith && detail.worksWith.length > 0 && (
          <div className="mt-7">
            <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">
              Works with
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.worksWith.map((w) => (
                <span
                  key={w}
                  className="rounded-full border border-edge bg-panel px-3 py-1 text-[12px] text-ink-dim"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
