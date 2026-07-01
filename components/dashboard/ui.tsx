// Card scaffolding + small primitives for the dashboard.
// Charts now live in ./charts (Recharts) and are re-exported below.
//
// Type scale (the only sizes the dashboard uses):
//   text-2xs (11px mono labels) · text-xs (12 meta) · text-sm (14 body)
//   text-base (16 emphasis) · text-xl (20 page titles) · text-2xl (24 stats)
//   text-3xl (30 hero stat)

import type { ReactNode } from "react";
import type { T } from "@/lib/i18n";

const ORANGE = "#fe5100";

// WelcomeBanner/StreakPill render inside server components but ui.tsx is also
// pulled into client bundles, so neither getI18n nor useT is safe here. The
// translator is passed down instead; it falls back to identity (English).
const identity: T = (key) => key;

// Recharts-backed charts (client components) — re-exported so pages keep
// importing everything from "@/components/dashboard/ui".
export {
  AreaChart,
  CallsBars,
  TrafficChart,
  CallsChart,
  StackedArea,
  DonutSplit,
  Donut,
  CohortCurve,
  ConversionFunnel,
  RadialGauge,
  BarRanking,
  StackedShareBar,
  RatingBars,
  CompareBars,
  CompareDiverging,
  ComparePace,
  HistogramBars,
  RateTrend,
  ProfitWaterfall,
  MoneyTrend,
  CostBars,
  CostBenchmark,
} from "./charts";

// No-rounding rule: dollars display exact to the cent, never truncated or
// compacted to $x.xk. Axis tick labels (charts.tsx axisFor) are the only place
// compaction is still allowed — Recharts picks round ticks, so nothing is lost.
export function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// Rates show their first decimal by default ("67.1%", but "50%" stays "50%").
export function pct(n: number, digits = 1): string {
  return `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
}

export function Micro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer ${className}`}>
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
    <div className={`rounded-xl border border-edge bg-panel ${pad ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

// Buttons — the three treatments the product needs. Focus ring comes from the
// global .theme-scope rule; hovers change color only (no layout shift).
export function Button({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "bg-orange text-white hover:bg-orange/90 border border-transparent",
    secondary: "border border-edge bg-raise text-ink hover:bg-raise-strong hover:border-edge-strong",
    ghost: "border border-transparent text-ink-dim hover:bg-raise hover:text-ink",
  } as const;
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  } as const;
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// Large display numbers — semibold, tight tracking, aligned digits.
export function Display({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-semibold tracking-[-0.01em] tabular-nums ${className}`}>{children}</span>;
}

// Loading skeleton block — pulses in the brand's surface color.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-raise ${className}`} />;
}

export function SkeletonCard({ className = "", children }: { className?: string; children?: ReactNode }) {
  return <div className={`rounded-xl border border-edge bg-panel p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: ReactNode;
  right?: ReactNode;
  period?: boolean;
}) {
  return (
    <header className="mb-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[680px]">
          <div className="font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">{eyebrow}</div>
          <h1 className="mt-1.5 text-xl font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h1>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

export function BigStat({ label, value, delta, deltaInvert, sub }: { label: string; value: string; delta?: number; deltaInvert?: boolean; sub?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Micro>{label}</Micro>
      <div className="flex items-baseline gap-2.5">
        <Display className="text-3xl leading-none text-ink">{value}</Display>
        {delta !== undefined && <Delta value={delta} invert={deltaInvert} />}
      </div>
      {sub && <div className="text-xs text-ink-dim">{sub}</div>}
    </div>
  );
}

export function SectionHeader({ index, title, desc, right }: { index: string; title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-mono text-2xs uppercase tracking-[0.12em]">
          <span className="text-ink-dimmer">{index}</span>
          <span className="ml-2 text-ink-dim">{title}</span>
        </div>
        {desc && <p className="mt-1 max-w-[520px] text-xs leading-relaxed text-ink-dim">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

// Trend badge — finance semantics: green means good, red means bad. `invert`
// flips which direction is good (e.g. costs going down is good).
export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-[2.5px] font-mono text-2xs leading-none tabular-nums ${
        good ? "bg-good/12 text-good" : "bg-bad/12 text-bad"
      }`}
    >
      <svg width="7.5" height="7.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M5 1.5 9 8.5 1 8.5Z" />
      </svg>
      {Math.abs(value * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "orange" | "good" | "warn" }) {
  const map = {
    muted: "border-edge text-ink-dim",
    orange: "border-orange-edge bg-orange-soft text-orange",
    good: "border-good/30 bg-good/10 text-good",
    warn: "border-warn/35 bg-warn/10 text-warn",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[3px] font-mono text-2xs uppercase tracking-[0.08em] ${map[tone]}`}>
      {children}
    </span>
  );
}

// ---- Horizontal meter ------------------------------------------------------
export function Meter({ value, color = ORANGE, track = "var(--color-track)" }: { value: number; color?: string; track?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: track }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.08em] text-ink-dim">
          <span className="size-2 rounded-[2px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-edge bg-raise p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
            value === o.value ? "bg-raise-strong text-ink" : "text-ink-dim hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Consecutive-days-active counter — shown in the welcome row after sign-in.
// Hidden until login history is actually tracked (real auth sends streak: 0).
export function StreakPill({ streak, t = identity }: { streak: number; t?: T }) {
  if (streak <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-raise px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.08em] text-ink-dim"
      title={t("{streak} consecutive days active", { streak })}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-orange">
        <path d="M12 2c1 3-1 4.6-1 6.6 0 1.4 1 2.3 2 2.3 1.6 0 2.2-1.7 2-3.4 2 1.7 3 4 3 6.5a6 6 0 1 1-12 0c0-2.7 1.7-4.8 3-6 .5 1.2 1.4 1.9 2.3 1.4C9 8 8.5 5 12 2Z" />
      </svg>
      {t("{streak}-day streak", { streak })}
    </span>
  );
}

// "Welcome back" row with the streak counter — the first thing after sign-in.
export function WelcomeBanner({ name, streak, t = identity }: { name: string; streak: number; t?: T }) {
  const first = name.split(" ")[0];
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-ink-dim">
        {t("Welcome back")}, <span className="font-medium text-ink">{first}</span>.
      </div>
      <StreakPill streak={streak} t={t} />
    </div>
  );
}
