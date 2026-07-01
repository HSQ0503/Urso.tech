import type { ReactNode } from "react";
import type { T } from "@/lib/i18n";

// InfoTip renders in both server and client components and is synchronous, so
// neither getI18n nor useT is valid. The translator is passed in as an optional
// prop and falls back to identity (English); `text` is already translated by
// the caller, so only the fixed aria-label needs t here.
const identity: T = (key) => key;

// An "(i)" affordance with a hover/focus tooltip. CSS-only so it stays
// server-safe and works inside server pages. Keyboard reachable via tabIndex.
export function InfoTip({ text, className = "", align = "center", t = identity }: { text: ReactNode; className?: string; align?: "center" | "right"; t?: T }) {
  const pos = align === "right" ? "right-0 translate-x-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className={`group/info relative inline-flex align-middle ${className}`}>
      <span
        tabIndex={0}
        role="button"
        aria-label={t("What this means")}
        className="grid size-6 cursor-help select-none place-items-center rounded-full border border-edge-strong font-mono text-sm font-medium normal-case leading-none tracking-normal text-ink-dimmer transition-colors hover:border-orange hover:text-orange focus:outline-none focus-visible:border-orange focus-visible:text-orange"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-[calc(100%+8px)] z-50 w-[230px] rounded-lg border border-edge bg-panel-strong px-3 py-2.5 text-left font-sans text-xs normal-case leading-relaxed tracking-normal text-ink-dim opacity-0 shadow-[0_14px_36px_-14px_rgba(0,0,0,0.85)] transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100 ${pos}`}
      >
        {text}
      </span>
    </span>
  );
}
