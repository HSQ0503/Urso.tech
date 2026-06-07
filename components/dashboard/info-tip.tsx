import type { ReactNode } from "react";

// An "(i)" affordance with a hover/focus tooltip. CSS-only so it stays
// server-safe and works inside server pages. Keyboard reachable via tabIndex.
export function InfoTip({ text, className = "", align = "center" }: { text: ReactNode; className?: string; align?: "center" | "right" }) {
  const pos = align === "right" ? "right-0 translate-x-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className={`group/info relative inline-flex align-middle ${className}`}>
      <span
        tabIndex={0}
        role="button"
        aria-label="What this means"
        className="grid size-[15px] cursor-help select-none place-items-center rounded-full border border-edge-strong font-mono text-[9px] font-medium normal-case leading-none tracking-normal text-ink-dimmer transition-colors hover:border-orange hover:text-orange focus:outline-none focus-visible:border-orange focus-visible:text-orange"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-[calc(100%+8px)] z-50 w-[230px] rounded-lg border border-edge bg-[#0c0c0c] px-3 py-2.5 text-left font-sans text-[11.5px] normal-case leading-[1.5] tracking-normal text-ink-dim opacity-0 shadow-[0_14px_36px_-14px_rgba(0,0,0,0.85)] transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100 ${pos}`}
      >
        {text}
      </span>
    </span>
  );
}
