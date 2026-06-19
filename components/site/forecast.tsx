"use client";

import { useEffect, useRef, useState } from "react";

/* Full-bleed amber forecast gradient — Origin's blue rendered in Urso orange.
   Dark at the top so the white headline reads, bright bloom kept low where the
   chart panel floats. Exported as plain strings so the server section in
   page.tsx can use them without pulling this client module's runtime. */
export const FORECAST_GRADIENT =
  "radial-gradient(116% 70% at 50% 74%, rgba(255,150,78,0.60) 0%, transparent 55%)," +
  "radial-gradient(86% 62% at 80% 86%, rgba(255,104,28,0.52) 0%, transparent 55%)," +
  "radial-gradient(78% 58% at 14% 84%, rgba(255,182,122,0.36) 0%, transparent 57%)," +
  "radial-gradient(60% 48% at 50% 60%, rgba(255,202,152,0.20) 0%, transparent 60%)," +
  "linear-gradient(180deg, #070707 0%, #160b06 18%, #341b0a 52%, #3a1e0b 74%, #1c0e07 90%, #090604 100%)";

export const FORECAST_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Frosted panel the chart lives on — top-lit glass that floats over the amber. */
const GLASS: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.22), 0 44px 90px -40px rgba(0,0,0,0.75)",
};

/* Geometry of the forecast curve, in the 760×300 viewBox. The whole curve is an
   illustrative model — solid ramp for "so far", dotted line projected forward. */
const SOLID = "M20 248 C 56 245 92 230 130 210";
const AREA = "M20 248 C 56 245 92 230 130 210 L130 260 L20 260 Z";
const FUTURE =
  "M130 210 C 185 196 220 180 270 167 C 330 151 372 132 410 108 C 462 78 512 74 550 60 C 600 41 655 33 690 22";

const Y_TICKS = [
  { y: 20, label: "$150K" },
  { y: 100, label: "$100K" },
  { y: 180, label: "$50K" },
  { y: 260, label: "$0" },
] as const;

const X_TICKS = [
  { x: 130, label: "NOW" },
  { x: 270, label: "MONTH 3" },
  { x: 410, label: "MONTH 6" },
  { x: 550, label: "MONTH 9" },
  { x: 690, label: "MONTH 12" },
] as const;

type IconKind = "phone" | "bag" | "return";
type Marker = { x: number; y: number; label: string; delta: string; icon: IconKind };

/* Example fixes that drive the step-ups — the kind the system measures against
   real data and keeps when they work. Placed on the nodes at month 3 / 6 / 9.
   The +$/mo figures are illustrative and match the rest of the site. */
const MARKERS: Marker[] = [
  { x: 270, y: 167, label: "Missed-call text-back", delta: "+$1.3k/mo", icon: "phone" },
  { x: 410, y: 108, label: "Checkout retail prompt", delta: "+$2.3k/mo", icon: "bag" },
  { x: 550, y: 60, label: "Win-back lapsed clients", delta: "+$2.4k/mo", icon: "return" },
];

const ICON = { stroke: "#070707", strokeWidth: 1.3, fill: "none" as const };

/** Dark glyph centered on (0,0), sized to sit inside a 15px white circle. */
function MarkerIcon({ kind }: { kind: IconKind }) {
  if (kind === "phone") {
    return (
      <g strokeLinecap="round" strokeLinejoin="round" {...ICON}>
        <rect x={-3.6} y={-6} width={7.2} height={12} rx={1.8} />
        <line x1={-1.3} y1={-3.6} x2={1.3} y2={-3.6} />
      </g>
    );
  }
  if (kind === "bag") {
    return (
      <g strokeLinecap="round" strokeLinejoin="round" {...ICON}>
        <path d="M-4.6 -1.6 H4.6 L3.8 6 H-3.8 Z" />
        <path d="M-2.5 -1.6 V-2.6 A2.5 2.5 0 0 1 2.5 -2.6 V-1.6" />
      </g>
    );
  }
  return (
    <g strokeLinecap="round" strokeLinejoin="round" {...ICON}>
      <path d="M5 -1.4 A5 5 0 1 0 4.4 3.4" />
      <path d="M5.4 -4.4 L5 -1.2 L1.9 -1.7" />
    </g>
  );
}

/**
 * The forecast chart. Draws itself in once it scrolls into view — the line
 * sweeps left to right, the projection wipes in, then the verified-fix markers
 * pop. Uses an IntersectionObserver with a mount fallback (so it still fires in
 * headless preview), and renders the finished state under reduced motion.
 */
export function ForecastChart() {
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const setFlags = setTimeout(() => setReduced(prefersReduced), 0);

    if (prefersReduced) {
      const t = setTimeout(() => setDrawn(true), 0);
      return () => {
        clearTimeout(setFlags);
        clearTimeout(t);
      };
    }

    const el = ref.current;
    let fired = false;
    const fire = () => {
      if (!fired) {
        fired = true;
        setDrawn(true);
      }
    };
    const io = el
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                fire();
                io?.disconnect();
              }
            }
          },
          { threshold: 0.25 },
        )
      : null;
    io?.observe(el as Element);
    // Safety net: if the observer never fires (preview quirk), draw anyway.
    const fallback = setTimeout(fire, 1400);

    return () => {
      clearTimeout(setFlags);
      clearTimeout(fallback);
      io?.disconnect();
    };
  }, []);

  const ease = "var(--ease-out)";
  const axisFont: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace",
    letterSpacing: "0.1em",
  };

  return (
    <div
      ref={ref}
      className="relative mx-auto w-full max-w-[880px] rounded-[28px] border border-white/[0.14] p-[clamp(20px,3.2vw,38px)] backdrop-blur-2xl"
      style={{
        ...GLASS,
        opacity: drawn ? 1 : 0,
        transform: drawn ? "none" : "translateY(14px)",
        transition: reduced
          ? "none"
          : `opacity 600ms ${ease}, transform 600ms ${ease}`,
      }}
    >
      {/* Sample tag — frames the whole widget as an illustrative model, so no
          number here reads as a banked, as-fact result. */}
      <div className="mb-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.18] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/65">
          <span className="h-1 w-1 rounded-full bg-white/55" />
          Sample
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
          12-month model
        </span>
      </div>

      {/* Recovered so far vs. modeled at month 12 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
            Recovered so far
          </div>
          <div className="mt-1.5 text-[clamp(1.5rem,3vw,2.05rem)] font-semibold tracking-[-0.02em] text-white">
            $31,240
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
            Projected · month 12
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[clamp(1.5rem,3vw,2.05rem)] font-semibold tracking-[-0.02em] text-white">
            $148,500
            <svg
              width="20"
              height="20"
              viewBox="0 0 18 18"
              fill="none"
              className="text-good"
              aria-hidden="true"
            >
              <path
                d="M5.5 12.5 12.5 5.5M7 5.5h5.5V11"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-good">
            +$117,260 (375%)
          </div>
        </div>
      </div>

      {/* Chart */}
      <svg
        viewBox="0 0 760 300"
        className="mt-6 w-full"
        role="img"
        aria-label="Illustrative sample projection: modeled recovered revenue compounding to about $148,500 over twelve months across four locations, stepping up at each measured fix."
      >
        <defs>
          <linearGradient id="fc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="fc-reveal">
            <rect
              x={129}
              y={0}
              width={631}
              height={300}
              style={{
                transformOrigin: "129px 0px",
                transform: drawn ? "scaleX(1)" : "scaleX(0)",
                transition: reduced ? "none" : `transform 1100ms ${ease} 600ms`,
              }}
            />
          </clipPath>
        </defs>

        {/* gridlines + y-axis labels */}
        <g aria-hidden="true">
          {Y_TICKS.map((t) => (
            <line
              key={t.y}
              x1={20}
              y1={t.y}
              x2={690}
              y2={t.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          ))}
          <line
            x1={20}
            y1={260}
            x2={690}
            y2={260}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
          {Y_TICKS.map((t) => (
            <text
              key={`yl-${t.y}`}
              x={702}
              y={t.y + 3.5}
              fontSize={11}
              fill="rgba(255,255,255,0.5)"
              style={axisFont}
            >
              {t.label}
            </text>
          ))}
        </g>

        {/* filled history */}
        <path
          d={AREA}
          fill="url(#fc-area)"
          style={{
            opacity: drawn ? 1 : 0,
            transition: reduced ? "none" : `opacity 700ms ${ease} 200ms`,
          }}
        />

        {/* solid measured line — draws left to right */}
        <path
          d={SOLID}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.5}
          strokeLinecap="round"
          style={{
            strokeDasharray: 260,
            strokeDashoffset: drawn ? 0 : 260,
            transition: reduced ? "none" : `stroke-dashoffset 850ms ${ease}`,
          }}
        />

        {/* NOW line + current point */}
        <g
          style={{
            opacity: drawn ? 1 : 0,
            transition: reduced ? "none" : `opacity 500ms ${ease} 320ms`,
          }}
        >
          <line
            x1={130}
            y1={210}
            x2={130}
            y2={258}
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={1.5}
          />
          <circle cx={130} cy={210} r={4} fill="#ffffff" />
        </g>

        {/* projection — dotted, wiped in left to right */}
        <g clipPath="url(#fc-reveal)">
          <path
            d={FUTURE}
            fill="none"
            stroke="#ffffff"
            strokeWidth={2.5}
            strokeDasharray="0.5 7"
            strokeLinecap="round"
          />
          <circle cx={690} cy={22} r={4} fill="#ffffff" />
        </g>

        {/* verified-fix markers — pin + white node + dark glyph, popped in */}
        {MARKERS.map((m, i) => (
          <g
            key={m.label}
            style={{
              opacity: drawn ? 1 : 0,
              transform: drawn ? "translateY(0)" : "translateY(7px)",
              transition: reduced
                ? "none"
                : `opacity 440ms ${ease} ${900 + i * 220}ms, transform 440ms ${ease} ${900 + i * 220}ms`,
            }}
          >
            <title>{m.label}</title>
            <line
              x1={m.x}
              y1={m.y}
              x2={m.x}
              y2={258}
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={1.5}
            />
            <g style={{ filter: "drop-shadow(0 6px 9px rgba(0,0,0,0.35))" }}>
              <circle cx={m.x} cy={m.y} r={15} fill="#ffffff" />
              <g transform={`translate(${m.x} ${m.y})`}>
                <MarkerIcon kind={m.icon} />
              </g>
            </g>
          </g>
        ))}

        {/* x-axis labels */}
        <g aria-hidden="true">
          {X_TICKS.map((t) => (
            <text
              key={t.label}
              x={t.x}
              y={283}
              fontSize={11}
              fill="rgba(255,255,255,0.5)"
              textAnchor="middle"
              style={axisFont}
            >
              {t.label}
            </text>
          ))}
        </g>
      </svg>

      {/* Legend — names each on-chart marker so the "curve steps up at each
          fix" story is legible without hovering (and on touch). */}
      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-white/[0.1] pt-4 sm:grid-cols-3">
        {MARKERS.map((m) => (
          <div key={m.label} className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white">
              <svg width="14" height="14" viewBox="-9 -9 18 18" aria-hidden="true">
                <MarkerIcon kind={m.icon} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] leading-tight text-white/90">
                {m.label}
              </span>
              <span className="mt-1 inline-flex rounded-full border border-orange/40 bg-orange-soft px-2 py-0.5 font-mono text-[10px] tracking-[0.02em] text-orange">
                {m.delta}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        Illustrative sample · 4 locations · every fix measured against real data
      </div>
    </div>
  );
}
