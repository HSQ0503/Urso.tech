// Card scaffolding + small primitives for the dashboard.
// Charts now live in ./charts (Recharts) and are re-exported below.

import type { ReactNode } from "react";

const ORANGE = "#fe5100";

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
} from "./charts";

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
    <div className={`rounded-2xl border border-edge bg-panel ${pad ? "p-5" : ""} ${className}`}>
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
  return <div className={`animate-pulse rounded-md bg-raise ${className}`} />;
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
          <h1 className="mt-3 text-[clamp(28px,4.4vw,44px)] font-medium leading-[1.08] tracking-[-0.02em]">{title}</h1>
          {sub && <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.55] text-ink-dim">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

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

export function SectionHeader({ index, title, desc, right }: { index: string; title: string; desc?: string; right?: ReactNode }) {
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
  const color = good ? "var(--color-good)" : ORANGE;
  const bg = good ? "rgba(70,209,138,0.12)" : "rgba(254,81,0,0.12)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-[2.5px] font-mono text-[10.5px] leading-none tabular-nums"
      style={{ color, background: bg }}
    >
      <svg width="7.5" height="7.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M5 1.5 9 8.5 1 8.5Z" />
      </svg>
      {Math.abs(value * 100).toFixed(0)}%
    </span>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "orange" | "good" | "warn" }) {
  const map = {
    muted: "border-edge text-ink-dim",
    orange: "border-[rgba(254,81,0,0.35)] bg-orange-soft text-orange",
    good: "border-[rgba(70,209,138,0.3)] text-[var(--color-good)]",
    warn: "border-[rgba(254,81,0,0.35)] text-orange",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.12em] ${map[tone]}`}>
      {children}
    </span>
  );
}

// ---- Horizontal meter ------------------------------------------------------
export function Meter({ value, color = ORANGE, track = "var(--color-track)" }: { value: number; color?: string; track?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: track }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
    </div>
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
    <div className="inline-flex items-center gap-0.5 rounded-full border border-edge bg-raise p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${value === o.value ? "bg-raise-strong text-ink" : "text-ink-dim hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Consecutive-days-active counter — shown in the welcome row after sign-in.
export function StreakPill({ streak }: { streak: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(254,81,0,0.35)] bg-orange-soft px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-orange"
      title={`${streak} consecutive days active`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2c1 3-1 4.6-1 6.6 0 1.4 1 2.3 2 2.3 1.6 0 2.2-1.7 2-3.4 2 1.7 3 4 3 6.5a6 6 0 1 1-12 0c0-2.7 1.7-4.8 3-6 .5 1.2 1.4 1.9 2.3 1.4C9 8 8.5 5 12 2Z" />
      </svg>
      {streak}-day streak
    </span>
  );
}

// "Welcome back" row with the streak counter — the first thing after sign-in.
export function WelcomeBanner({ name, streak }: { name: string; streak: number }) {
  const first = name.split(" ")[0];
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="text-[13.5px] text-ink-dim">
        Welcome back, <span className="font-medium text-ink">{first}</span>.
      </div>
      <StreakPill streak={streak} />
    </div>
  );
}
