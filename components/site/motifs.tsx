import type { CSSProperties } from "react";
import { Reveal } from "./reveal";
import { cx } from "./ui";

/* Shared frame chrome: corner ticks + mono label, the OS instrument look. */
function pathStyle(len: number, delay = 80): CSSProperties {
  return { ["--path-len" as string]: String(len), ["--reveal-delay" as string]: `${delay}ms` };
}

/* ------------------------------------------------------------------ *
 * InstrumentStrip — hero band. Abstract operating-layer readout:      *
 * hairline grid, cropped data fragments, tick marks, mono coordinates.*
 * Monochrome by intent — the headline period and the CTA hold the      *
 * orange budget for the hero viewport.                                 *
 * ------------------------------------------------------------------ */
export function InstrumentStrip({ className = "" }: { className?: string }) {
  return (
    <Reveal
      className={cx(
        "relative overflow-hidden rounded-xl border border-edge bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
        <span>Operating layer</span>
        <span className="hidden sm:inline">Live · all locations</span>
      </div>
      <svg
        viewBox="0 0 1200 300"
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Abstract data instrument: rising performance line over a hairline grid."
      >
        <defs>
          <linearGradient id="strip-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* coordinate grid */}
        {Array.from({ length: 13 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={i * 100}
            y1="0"
            x2={i * 100}
            y2="300"
            stroke="var(--color-grid)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={i * 64 + 20}
            x2="1200"
            y2={i * 64 + 20}
            stroke="var(--color-grid)"
            strokeWidth="1"
          />
        ))}

        {/* secondary series (softer, flatter) */}
        <path
          d="M0 232 C 140 236 220 214 320 220 S 520 236 640 206 S 860 214 1000 198 S 1140 206 1200 200"
          fill="none"
          stroke="var(--color-series-soft)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="draw-path"
          style={pathStyle(1700, 160)}
        />

        {/* primary series + cropped area fill */}
        <path
          d="M0 250 C 120 252 180 212 260 216 C 360 221 420 250 500 198 C 600 150 680 168 760 158 C 880 144 940 104 1040 120 C 1130 132 1170 92 1200 96 L 1200 300 L 0 300 Z"
          fill="url(#strip-fill)"
          opacity="0.9"
        />
        <path
          d="M0 250 C 120 252 180 212 260 216 C 360 221 420 250 500 198 C 600 150 680 168 760 158 C 880 144 940 104 1040 120 C 1130 132 1170 92 1200 96"
          fill="none"
          stroke="var(--color-series)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="draw-path"
          style={pathStyle(1700, 80)}
        />

        {/* baseline ticks */}
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={`t${i}`}
            x1={i * 100 + 50}
            y1="280"
            x2={i * 100 + 50}
            y2="288"
            stroke="var(--color-axis)"
            strokeWidth="1"
          />
        ))}

        {/* "now" guide + node */}
        <line x1="1040" y1="20" x2="1040" y2="288" stroke="var(--color-edge-strong)" strokeWidth="1" strokeDasharray="2 4" />
        <circle cx="1040" cy="120" r="4" fill="var(--color-bg)" stroke="var(--color-ink)" strokeWidth="1.5" />
      </svg>

      {/* floating mono coordinate readout */}
      <div className="pointer-events-none absolute right-4 top-12 hidden flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim sm:flex">
        <span className="text-ink-dimmer">Now</span>
        <span>trend · up</span>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ *
 * ConnectDiagram — scattered systems unify into one OS node.          *
 * The convergence node is the single orange focal.                    *
 * ------------------------------------------------------------------ */
const SOURCES = ["POS", "Books", "Phones", "Booking", "Reviews", "Payroll"];

export function ConnectDiagram({ className = "" }: { className?: string }) {
  // chips on the left, OS node on the right; hairline paths converge.
  const nodeY = 170;
  const rowY = (i: number) => 40 + i * 52;
  return (
    <Reveal
      className={cx(
        "relative overflow-hidden rounded-xl border border-edge bg-surface p-2",
        className,
      )}
    >
      <svg
        viewBox="0 0 840 340"
        className="block h-auto w-full"
        role="img"
        aria-label="Scattered business systems converging into one Urso operating layer."
      >
        {/* converging hairlines */}
        {SOURCES.map((_, i) => {
          const y = rowY(i) + 16;
          const d = `M 196 ${y} C 360 ${y} 420 ${nodeY} 600 ${nodeY}`;
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="var(--color-series-soft)"
              strokeWidth="1.25"
              className="draw-path"
              style={pathStyle(560, 80 + i * 50)}
            />
          );
        })}

        {/* source chips */}
        {SOURCES.map((label, i) => {
          const y = rowY(i);
          return (
            <g key={label}>
              <rect
                x="40"
                y={y}
                width="156"
                height="32"
                rx="4"
                fill="var(--color-cell)"
                stroke="var(--color-edge)"
              />
              <text
                x="58"
                y={y + 21}
                fontFamily="var(--font-mono)"
                fontSize="12"
                letterSpacing="0.12em"
                fill="var(--color-ink-dim)"
              >
                {label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* OS node — the orange focal */}
        <g>
          <rect
            x="600"
            y={nodeY - 34}
            width="200"
            height="68"
            rx="8"
            fill="var(--color-orange-soft)"
            stroke="var(--color-orange)"
            strokeWidth="1.25"
          />
          <text
            x="700"
            y={nodeY - 6}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            letterSpacing="0.14em"
            fill="var(--color-orange)"
          >
            URSO OS
          </text>
          <text
            x="700"
            y={nodeY + 16}
            textAnchor="middle"
            fontFamily="var(--font-sans)"
            fontSize="13"
            fill="var(--color-ink)"
          >
            One source of truth
          </text>
        </g>
      </svg>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ *
 * PhasePath — Review → Build → Activate → Improve. The advancing       *
 * orange direction line is the focal.                                  *
 * ------------------------------------------------------------------ */
const PHASES = ["Review", "Build", "Activate", "Improve"];

export function PhasePath({ className = "" }: { className?: string }) {
  return (
    <Reveal className={cx("relative w-full", className)}>
      <div className="relative">
        {/* track */}
        <div className="absolute left-0 right-0 top-[11px] h-px bg-edge" />
        {/* advancing orange line */}
        <div
          className="advance-line absolute left-0 right-0 top-[11px] h-px bg-orange"
          style={{ ["--reveal-delay" as string]: "120ms" }}
        />
        <div className="relative grid grid-cols-2 gap-y-10 sm:grid-cols-4">
          {PHASES.map((phase, i) => (
            <div key={phase} className="flex flex-col">
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    "grid h-[22px] w-[22px] place-items-center rounded-full border bg-bg font-mono text-[10px]",
                    i === 0
                      ? "border-orange text-orange"
                      : "border-edge-strong text-ink-dim",
                  )}
                >
                  {i + 1}
                </span>
              </div>
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
                {`0${i + 1}`}
              </div>
              <div className="mt-1 text-[18px] font-medium tracking-[-0.02em] text-ink">
                {phase}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ *
 * SystemSchematic — five capability groups on one operating line.     *
 * ------------------------------------------------------------------ */
const GROUPS = [
  { n: "01", label: "Intelligence", sub: "See clearly" },
  { n: "02", label: "Systems", sub: "Build the layer" },
  { n: "03", label: "Automation", sub: "Remove busywork" },
  { n: "04", label: "Execution", sub: "Make it stick" },
  { n: "05", label: "Growth", sub: "Scale with direction" },
];

export function SystemSchematic({ className = "" }: { className?: string }) {
  return (
    <Reveal
      className={cx(
        "relative overflow-hidden rounded-xl border border-edge bg-surface px-5 py-7 sm:px-8 sm:py-9",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute left-0 right-0 top-[5px] hidden h-px bg-edge md:block" />
        <div
          className="advance-line absolute left-0 right-0 top-[5px] hidden h-px bg-orange md:block"
          style={{ ["--reveal-delay" as string]: "140ms" }}
        />
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-5">
          {GROUPS.map((g, i) => (
            <div key={g.n} className="relative">
              <span
                className={cx(
                  "hidden h-[11px] w-[11px] rounded-full border-2 bg-surface md:block",
                  i === 0 ? "border-orange" : "border-edge-strong",
                )}
              />
              <div className="mt-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer md:mt-5">
                {g.n}
              </div>
              <div className="mt-1.5 text-[16px] font-medium tracking-[-0.02em] text-ink">
                {g.label}
              </div>
              <div className="mt-1 text-[13px] text-ink-dim">{g.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ *
 * FlowLine — a labeled left→right hairline flow with one orange node.  *
 * Used on /what-we-do: SIGNAL → SIZED IN $ → THE MOVE → OWNER → RESULT.*
 * ------------------------------------------------------------------ */
export function FlowLine({
  steps,
  accentIndex,
  className = "",
}: {
  steps: string[];
  accentIndex: number;
  className?: string;
}) {
  return (
    <Reveal
      className={cx(
        "relative overflow-hidden rounded-xl border border-edge bg-surface px-5 py-6 sm:px-7",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        {steps.map((step, i) => {
          const accent = i === accentIndex;
          return (
            <div key={step} className="flex items-center gap-2 sm:flex-1">
              <div
                className={cx(
                  "flex-1 rounded-md border px-3 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.1em]",
                  accent
                    ? "border-orange/60 bg-orange-soft text-orange"
                    : "border-edge text-ink-dim",
                )}
              >
                {step}
              </div>
              {i < steps.length - 1 && (
                <span className="hidden text-ink-dimmer sm:inline">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M2.5 8h11M9 3.5 13.5 8 9 12.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}
