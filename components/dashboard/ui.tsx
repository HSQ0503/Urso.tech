// Hand-drawn inline-SVG chart primitives + card scaffolding for the dashboard.
// No chart library — matches the rest of the Urso site, which draws its own SVG.

import type { ReactNode } from "react";

const ORANGE = "#fe5100";

export function fmtMoney(n: number, compact = false): string {
  if (compact && Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toLocaleString("en-US")}`;
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function Micro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer ${className}`}>
      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-edge bg-panel ${pad ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// Large display numbers — Geist, tight tracking. Just a sizing/weight wrapper.
export function Display({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-medium tracking-[-0.02em] ${className}`}>{children}</span>;
}

// Loading skeleton block — pulses in the brand's surface color.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.05] ${className}`} />;
}

export function SkeletonCard({ className = "", children }: { className?: string; children?: ReactNode }) {
  return <div className={`rounded-2xl border border-edge bg-panel p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <header className="relative mb-8 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-0 h-48 w-[420px] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(254,81,0,0.16), transparent 70%)" }}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[680px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">{eyebrow}</div>
          <h1 className="mt-3 text-[clamp(28px,4.4vw,44px)] font-medium leading-[1.08] tracking-[-0.02em]">
            {title}
          </h1>
          {sub && <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.55] text-ink-dim">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

// Big hero stat with a serif number.
export function BigStat({ label, value, delta, deltaInvert, sub, accent }: { label: string; value: string; delta?: number; deltaInvert?: boolean; sub?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Micro>{label}</Micro>
      <div className="flex items-baseline gap-2.5">
        <Display className={`text-[40px] leading-none tracking-[-0.02em] ${accent ? "text-orange" : "text-ink"}`}>{value}</Display>
        {delta !== undefined && <Delta value={delta} invert={deltaInvert} />}
      </div>
      {sub && <div className="text-[12.5px] text-ink-dim">{sub}</div>}
    </div>
  );
}

export function SectionHeader({
  index,
  title,
  desc,
  right,
}: {
  index: string;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-orange">{index}</span>
          <span className="ml-2 text-ink-dimmer">{title}</span>
        </div>
        {desc && <p className="mt-1 max-w-[520px] text-[12px] leading-[1.45] text-ink-dim">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const up = value >= 0;
  const good = invert ? !up : up;
  const color = good ? "#46d18a" : ORANGE;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px]" style={{ color }}>
      <span>{up ? "▲" : "▼"}</span>
      {Math.abs(value * 100).toFixed(0)}%
    </span>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "orange" | "good" | "warn" }) {
  const map = {
    muted: "border-edge text-ink-dim",
    orange: "border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange",
    good: "border-[rgba(70,209,138,0.3)] text-[#46d18a]",
    warn: "border-[rgba(254,81,0,0.35)] text-orange",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.12em] ${map[tone]}`}>
      {children}
    </span>
  );
}

// ---- Sparkline -------------------------------------------------------------
export function Sparkline({ data, color = ORANGE, w = 96, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${w} ${h} L0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="overflow-visible" aria-hidden="true">
      <path d={area} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Horizontal meter ------------------------------------------------------
export function Meter({ value, color = ORANGE, track = "rgba(255,255,255,0.08)" }: { value: number; color?: string; track?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: track }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
    </div>
  );
}

// ---- Donut split (two values) ---------------------------------------------
export function DonutSplit({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const total = a + b || 1;
  const aFrac = a / total;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 84 84" width={84} height={84} aria-hidden="true">
        <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={11} />
        <circle
          cx={42}
          cy={42}
          r={r}
          fill="none"
          stroke={ORANGE}
          strokeWidth={11}
          strokeDasharray={`${(aFrac * c).toFixed(1)} ${c.toFixed(1)}`}
          strokeDashoffset={c / 4}
          transform="rotate(-90 42 42)"
          strokeLinecap="butt"
        />
      </svg>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="size-2 rounded-full" style={{ background: ORANGE }} />
          <span className="text-ink">{labelA}</span>
          <span className="font-mono text-ink-dim">{pct(aFrac)}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="size-2 rounded-full bg-white/25" />
          <span className="text-ink">{labelB}</span>
          <span className="font-mono text-ink-dim">{pct(1 - aFrac)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Stacked area (grooming vs retail over time) --------------------------
export function StackedArea({ data }: { data: { m: string; grooming: number; retail: number }[] }) {
  const w = 320;
  const h = 84;
  const max = Math.max(...data.map((d) => d.grooming + d.retail)) * 1.1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - (v / max) * h;
  const topLine = data.map((d, i) => [x(i), y(d.grooming + d.retail)] as const);
  const midLine = data.map((d, i) => [x(i), y(d.grooming)] as const);
  const path = (pts: readonly (readonly [number, number])[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const retailArea = `${path(topLine)} L${path(midLine.slice().reverse()).slice(1)} Z`;
  const groomArea = `${path(midLine)} L${w} ${h} L0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" aria-hidden="true">
      <path d={groomArea} fill={ORANGE} opacity={0.85} />
      <path d={retailArea} fill="rgba(255,255,255,0.18)" />
      <path d={path(midLine)} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1} />
      {data.map((d, i) => (
        <text key={d.m} x={x(i)} y={h + 12} fontSize={9} fontFamily="monospace" fill="rgba(255,255,255,0.38)" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
          {d.m}
        </text>
      ))}
    </svg>
  );
}

// ---- Calls-per-hour stacked bars w/ after-close band ----------------------
export function CallsChart({
  hourly,
  missedHourly,
  startHour,
  closeHour,
}: {
  hourly: number[];
  missedHourly: number[];
  startHour: number;
  closeHour: number;
}) {
  const w = 340;
  const h = 92;
  const n = hourly.length;
  const max = Math.max(...hourly) * 1.1;
  const bw = (w / n) * 0.62;
  const gap = w / n;
  const closeIdx = closeHour - startHour;
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full" aria-hidden="true">
      {/* after-close shaded band */}
      <rect x={closeIdx * gap} y={0} width={w - closeIdx * gap} height={h} fill={ORANGE} opacity={0.06} />
      <line x1={closeIdx * gap} y1={0} x2={closeIdx * gap} y2={h} stroke={ORANGE} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" />
      <text x={closeIdx * gap + 4} y={12} fontSize={8.5} fontFamily="monospace" fill={ORANGE} opacity={0.8}>
        CLOSES {closeHour > 12 ? closeHour - 12 : closeHour}PM
      </text>
      {hourly.map((v, i) => {
        const x = i * gap + (gap - bw) / 2;
        const total = (v / max) * h;
        const missed = (missedHourly[i] / max) * h;
        const answered = total - missed;
        return (
          <g key={i}>
            <rect x={x} y={h - answered} width={bw} height={answered} rx={1.5} fill="rgba(255,255,255,0.22)" />
            <rect x={x} y={h - total} width={bw} height={missed} rx={1.5} fill={ORANGE} />
          </g>
        );
      })}
      {[startHour, 12, 16, closeHour].map((hr) => {
        const i = hr - startHour;
        return (
          <text key={hr} x={i * gap + gap / 2} y={h + 13} fontSize={8.5} fontFamily="monospace" fill="rgba(255,255,255,0.38)" textAnchor="middle">
            {hr > 12 ? hr - 12 : hr}{hr >= 12 ? "p" : "a"}
          </text>
        );
      })}
    </svg>
  );
}

// ---- Cohort retention curve -----------------------------------------------
export function CohortCurve({ data, label = "months since first visit" }: { data: number[]; label?: string }) {
  const w = 300;
  const h = 62;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - (v / 100) * h;
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" aria-hidden="true">
      {[0, 0.5, 1].map((g) => (
        <line key={g} x1={0} x2={w} y1={h * g} y2={h * g} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      ))}
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={ORANGE} opacity={0.1} />
      <path d={d} fill="none" stroke={ORANGE} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2} fill={ORANGE} />
      ))}
      <text x={0} y={h + 13} fontSize={8.5} fontFamily="monospace" fill="rgba(255,255,255,0.38)">
        {label}
      </text>
    </svg>
  );
}

// ===========================================================================
//  Statistical charts with axes — for the analytics dashboard
// ===========================================================================

const AX = "rgba(255,255,255,0.32)"; // axis label color
const GRID = "rgba(255,255,255,0.07)";

function xTicks(n: number, max = 6) {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil(n / max);
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

// Single-series area chart with gridlines + axes.
export function AreaChart({
  data,
  labels,
  valueFmt = (n: number) => String(n),
  color = "#fe5100",
  height = 196,
}: {
  data: number[];
  labels: string[];
  valueFmt?: (n: number) => string;
  color?: string;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const floor = lo - (hi - lo) * 0.3;
  const ceil = hi + (hi - lo) * 0.12;
  const span = ceil - floor || 1;
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - floor) / span) * (H - padT - padB);
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${(H - padB).toFixed(1)} L${padL} ${(H - padB).toFixed(1)} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => floor + t * span);
  const gid = `area-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grid.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 8} y={y(v) + 3} fontSize={9.5} fontFamily="monospace" fill={AX} textAnchor="end">
            {valueFmt(v)}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={3} fill={color} />
      {xTicks(data.length).map((i) => (
        <text key={i} x={x(i)} y={H - 9} fontSize={9.5} fontFamily="monospace" fill={AX} textAnchor="middle">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

// Stacked bars: answered (muted) + missed (orange), with axes.
export function CallsBars({ labels, total, missed, color = "#fe5100", height = 196 }: { labels: string[]; total: number[]; missed: number[]; color?: string; height?: number }) {
  const W = 600;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const max = Math.max(...total) * 1.15;
  const n = total.length;
  const step = (W - padL - padR) / n;
  const bw = step * 0.6;
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const grid = [0, 0.5, 1].map((t) => t * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} aria-hidden="true">
      {grid.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 7} y={y(v) + 3} fontSize={9.5} fontFamily="monospace" fill={AX} textAnchor="end">
            {Math.round(v)}
          </text>
        </g>
      ))}
      {total.map((t, i) => {
        const cx = padL + i * step + step / 2 - bw / 2;
        const answered = t - missed[i];
        const yAns = y(answered);
        const yMiss = y(t);
        return (
          <g key={i}>
            <rect x={cx} y={yAns} width={bw} height={H - padB - yAns} rx={2} fill="rgba(255,255,255,0.16)" />
            <rect x={cx} y={yMiss} width={bw} height={yAns - yMiss} rx={2} fill={color} />
          </g>
        );
      })}
      {xTicks(n).map((i) => (
        <text key={i} x={padL + i * step + step / 2} y={H - 9} fontSize={9.5} fontFamily="monospace" fill={AX} textAnchor="middle">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

// Dual-axis: visits as bars (muted, left scale), bookings as line (orange, right scale).
export function TrafficChart({ labels, visits, bookings, color = "#fe5100", height = 196 }: { labels: string[]; visits: number[]; bookings: number[]; color?: string; height?: number }) {
  const W = 600;
  const H = height;
  const padL = 40;
  const padR = 38;
  const padT = 12;
  const padB = 26;
  const vMax = Math.max(...visits) * 1.15;
  const bMax = Math.max(...bookings) * 1.35;
  const n = visits.length;
  const step = (W - padL - padR) / n;
  const bw = step * 0.55;
  const yV = (v: number) => padT + (1 - v / vMax) * (H - padT - padB);
  const yB = (v: number) => padT + (1 - v / bMax) * (H - padT - padB);
  const x = (i: number) => padL + i * step + step / 2;
  const bookLine = bookings.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${yB(v).toFixed(1)}`).join(" ");
  const grid = [0, 0.5, 1].map((t) => t * vMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} aria-hidden="true">
      {grid.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={yV(v)} y2={yV(v)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 6} y={yV(v) + 3} fontSize={9} fontFamily="monospace" fill={AX} textAnchor="end">
            {Math.round(v)}
          </text>
        </g>
      ))}
      {visits.map((v, i) => {
        const yy = yV(v);
        return <rect key={i} x={x(i) - bw / 2} y={yy} width={bw} height={H - padB - yy} rx={2} fill="rgba(255,255,255,0.14)" />;
      })}
      <path d={bookLine} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {bookings.map((v, i) => (
        <circle key={i} cx={x(i)} cy={yB(v)} r={2.4} fill={color} />
      ))}
      {[0, 0.5, 1].map((t, i) => (
        <text key={i} x={W - padR + 6} y={yB(t * bMax) + 3} fontSize={9} fontFamily="monospace" fill={color} fillOpacity={0.7} textAnchor="start">
          {Math.round(t * bMax)}
        </text>
      ))}
      {xTicks(n).map((i) => (
        <text key={i} x={x(i)} y={H - 9} fontSize={9.5} fontFamily="monospace" fill={AX} textAnchor="middle">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
          <span className="size-2 rounded-[2px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-edge bg-white/[0.02] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${value === o.value ? "bg-white/[0.08] text-ink" : "text-ink-dim hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
