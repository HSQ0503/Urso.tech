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

// Editorial serif display — used only for hero numbers & page headlines.
export function Display({ children, className = "", italic = false }: { children: ReactNode; className?: string; italic?: boolean }) {
  return (
    <span
      className={className}
      style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: italic ? "italic" : "normal" }}
    >
      {children}
    </span>
  );
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
