import type { ReactNode } from "react";
import { Reveal } from "./reveal";
import { cx } from "./ui";

/** A real product frame: Surface bg, 12px radius, 1px edge, mono title row.
 *  Flat and front-on — never a tilted 3-D perspective (packet §11). */
export function ProductFrame({
  title = "Urso OS",
  tag = "Illustrative interface",
  children,
  className = "",
  cropRight = false,
}: {
  title?: string;
  tag?: string;
  children: ReactNode;
  className?: string;
  cropRight?: boolean;
}) {
  return (
    <Reveal
      className={cx(
        "overflow-hidden rounded-xl border border-edge bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-raise-strong" />
            <span className="h-2 w-2 rounded-full bg-raise-strong" />
            <span className="h-2 w-2 rounded-full bg-raise-strong" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            {title}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
          {tag}
        </span>
      </div>
      <div className={cx(cropRight && "pr-0")}>{children}</div>
    </Reveal>
  );
}

const numeric = "[font-variant-numeric:tabular-nums]";

function DeltaChip({
  value,
  good = true,
}: {
  value: string;
  good?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[11px] font-medium",
        numeric,
        good ? "bg-good/10 text-good" : "bg-orange-soft text-orange",
      )}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path
          d={good ? "M5 8V2M5 2 2 5M5 2l3 3" : "M5 2v6M5 8 2 5M5 8l3 3"}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {value}
    </span>
  );
}

function KpiCell({
  label,
  value,
  delta,
  good = true,
}: {
  label: string;
  value: string;
  delta: string;
  good?: boolean;
}) {
  return (
    <div className="bg-cell p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
        {label}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className={cx("text-[24px] font-semibold tracking-[-0.02em] text-ink", numeric)}>
          {value}
        </span>
        <DeltaChip value={delta} good={good} />
      </div>
    </div>
  );
}

/** Monochrome area chart — quiet by default; the InsightCard owns the orange. */
function MiniArea() {
  return (
    <svg viewBox="0 0 560 180" className="block h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="scene-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 7 }, (_, i) => (
        <line
          key={i}
          x1={i * 93}
          y1="0"
          x2={i * 93}
          y2="180"
          stroke="var(--color-grid)"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <line
          key={i}
          x1="0"
          y1={i * 50 + 14}
          x2="560"
          y2={i * 50 + 14}
          stroke="var(--color-grid)"
          strokeWidth="1"
        />
      ))}
      <path
        d="M0 132 C 70 136 96 108 150 112 C 220 117 250 138 312 104 C 380 70 420 86 470 76 C 520 66 545 50 560 52 L 560 180 L 0 180 Z"
        fill="url(#scene-fill)"
      />
      <path
        d="M0 132 C 70 136 96 108 150 112 C 220 117 250 138 312 104 C 380 70 420 86 470 76 C 520 66 545 50 560 52"
        fill="none"
        stroke="var(--color-series)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-path"
        style={{ ["--path-len" as string]: "800" }}
      />
    </svg>
  );
}

export function InsightCard({
  finding,
  action = "Assign the fix",
  className = "",
}: {
  finding: ReactNode;
  action?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "border-l-2 border-orange bg-raise/40 py-4 pl-4 pr-4",
        className,
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">
        Insight
      </div>
      <p className="mt-2 text-[14px] leading-[1.5] text-ink">{finding}</p>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-edge-strong px-3 py-1.5 text-[12px] font-medium text-ink"
      >
        {action}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2.5 8h11M9 3.5 13.5 8 9 12.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

/** The composed scene used in the home "operating layer" section. */
export function DashboardScene({ className = "" }: { className?: string }) {
  return (
    <ProductFrame className={className} title="Urso OS · all locations">
      <div className="grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
        <KpiCell label="Utilization" value="78%" delta="4.1%" />
        <KpiCell label="Rebook rate" value="61%" delta="3.2%" />
        <KpiCell label="Missed calls" value="12" delta="38%" good />
        <KpiCell label="Avg ticket" value="$63.40" delta="2.0%" />
      </div>
      <div className="grid grid-cols-1 gap-px bg-edge lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
              Revenue · trailing 12
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
              4 locations
            </span>
          </div>
          <MiniArea />
        </div>
        <div className="flex items-center bg-surface p-4">
          <InsightCard
            finding={
              <>
                Tuesday 2–4pm runs well below capacity at 3 of 4 locations.
                Filling half of those slots is worth{" "}
                <span className="text-ink">≈ $2,100/mo</span>.
              </>
            }
          />
        </div>
      </div>
    </ProductFrame>
  );
}
