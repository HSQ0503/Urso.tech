"use client";

// Urso dashboard charts — Recharts under the shadcn-style ChartContainer.
// Same export signatures as the previous hand-drawn SVG versions, so pages
// don't need to change. Theming flows through ChartConfig color vars.

import { useId } from "react";
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./chart";
import type { FunnelStep } from "./data";

const ORANGE = "#fe5100";
const MUTED = "rgba(255,255,255,0.26)";
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
const fmtHour = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}`;

// Serializable formatter tokens — so server components can pick a number
// format without passing a function across the server/client boundary.
export type ValueFormat = "number" | "money" | "moneyK" | "pct";
function formatFor(token: ValueFormat): (n: number) => string {
  switch (token) {
    case "money":
      return (n) => `$${Math.round(n).toLocaleString("en-US")}`;
    case "moneyK":
      return (n) => `$${Math.round(n / 1000)}k`;
    case "pct":
      return (n) => `${Math.round(n)}%`;
    default:
      return (n) => Math.round(n).toLocaleString("en-US");
  }
}

// ---- Revenue area chart ----------------------------------------------------
export function AreaChart({
  data,
  labels,
  valueFmt,
  format = "number",
  color = ORANGE,
  height = 200,
}: {
  data: number[];
  labels: string[];
  valueFmt?: (n: number) => string;
  format?: ValueFormat;
  color?: string;
  height?: number;
}) {
  const fmt = valueFmt ?? formatFor(format);
  const gid = "rev-" + useId().replace(/:/g, "");
  const chartData = data.map((v, i) => ({ label: labels[i], value: v }));
  const config = { value: { label: "Revenue", color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <RAreaChart data={chartData} margin={{ left: 4, right: 10, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={42} tickFormatter={fmt} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />} />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 3 }} />
      </RAreaChart>
    </ChartContainer>
  );
}

// ---- Calls answered vs missed (stacked bars) -------------------------------
export function CallsBars({
  labels,
  total,
  missed,
  color = ORANGE,
  height = 200,
}: {
  labels: string[];
  total: number[];
  missed: number[];
  color?: string;
  height?: number;
}) {
  const chartData = labels.map((l, i) => ({ label: l, answered: total[i] - missed[i], missed: missed[i] }));
  const config = {
    answered: { label: "Answered", color: "rgba(255,255,255,0.3)" },
    missed: { label: "Missed", color },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} width={30} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="answered" stackId="a" fill="var(--color-answered)" radius={[0, 0, 2, 2]} />
        <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

// ---- Website visits vs new bookings (dual axis) ----------------------------
export function TrafficChart({
  labels,
  visits,
  bookings,
  color = ORANGE,
  height = 200,
}: {
  labels: string[];
  visits: number[];
  bookings: number[];
  color?: string;
  height?: number;
}) {
  const chartData = labels.map((l, i) => ({ label: l, visits: visits[i], bookings: bookings[i] }));
  const config = {
    visits: { label: "Visits", color: "rgba(255,255,255,0.22)" },
    bookings: { label: "New bookings", color },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <ComposedChart data={chartData} margin={{ left: 4, right: 6, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={34} />
        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={26} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="left" dataKey="visits" fill="var(--color-visits)" radius={[2, 2, 0, 0]} barSize={13} />
        <Line yAxisId="right" dataKey="bookings" type="monotone" stroke="var(--color-bookings)" strokeWidth={2} dot={{ r: 2, fill: color }} activeDot={{ r: 3.5 }} />
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- Calls per hour with after-close band ----------------------------------
export function CallsChart({
  hourly,
  missedHourly,
  startHour,
  closeHour,
  height = 150,
}: {
  hourly: number[];
  missedHourly: number[];
  startHour: number;
  closeHour: number;
  height?: number;
}) {
  const data = hourly.map((v, i) => ({ hour: startHour + i, answered: v - missedHourly[i], missed: missedHourly[i] }));
  const config = {
    answered: { label: "Answered", color: "rgba(255,255,255,0.22)" },
    missed: { label: "Missed", color: ORANGE },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={6} interval={1} tickFormatter={(h) => fmtHour(Number(h))} />
        <YAxis tickLine={false} axisLine={false} width={24} />
        <ReferenceArea x1={closeHour} x2={startHour + hourly.length - 1} fill={ORANGE} fillOpacity={0.07} ifOverflow="extendDomain" />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(h) => fmtHour(Number(h))} />} />
        <Bar dataKey="answered" stackId="a" fill="var(--color-answered)" radius={[0, 0, 1, 1]} />
        <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={[1, 1, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

// ---- Grooming vs retail stacked area ---------------------------------------
export function StackedArea({ data }: { data: { m: string; grooming: number; retail: number }[] }) {
  const gid = "mix-" + useId().replace(/:/g, "");
  const config = {
    grooming: { label: "Grooming", color: ORANGE },
    retail: { label: "Retail", color: MUTED },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height: 150 }}>
      <RAreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-grooming)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-grooming)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id={`${gid}-r`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-retail)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-retail)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="m" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area dataKey="grooming" type="monotone" stackId="1" stroke="var(--color-grooming)" strokeWidth={1.5} fill={`url(#${gid}-g)`} />
        <Area dataKey="retail" type="monotone" stackId="1" stroke="var(--color-retail)" strokeWidth={1.5} fill={`url(#${gid}-r)`} />
      </RAreaChart>
    </ChartContainer>
  );
}

// ---- Donut split (two values) ----------------------------------------------
export function DonutSplit({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const total = a + b || 1;
  const chartData = [
    { name: "a", value: a },
    { name: "b", value: b },
  ];
  const config = {
    a: { label: labelA, color: ORANGE },
    b: { label: labelB, color: MUTED },
  } satisfies ChartConfig;
  return (
    <div className="flex items-center gap-4">
      <ChartContainer config={config} className="shrink-0" style={{ height: 96, width: 96 }}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <ChartTooltip content={<ChartTooltipContent hideLabel valueFormatter={(v) => fmtPct(v / total)} />} />
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={46} strokeWidth={0} paddingAngle={2}>
            <Cell fill="var(--color-a)" />
            <Cell fill="var(--color-b)" />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="space-y-1.5">
        <LegendRow color={ORANGE} label={labelA} value={fmtPct(a / total)} />
        <LegendRow color={MUTED} label={labelB} value={fmtPct(b / total)} />
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="text-ink">{label}</span>
      <span className="font-mono text-ink-dim">{value}</span>
    </div>
  );
}

// ---- Cohort retention curve ------------------------------------------------
export function CohortCurve({ data, label = "months since first visit" }: { data: number[]; label?: string }) {
  const gid = "co-" + useId().replace(/:/g, "");
  const chartData = data.map((v, i) => ({ x: i, value: v }));
  const config = { value: { label: "Still active", color: ORANGE } } satisfies ChartConfig;
  return (
    <div>
      <ChartContainer config={config} style={{ height: 120 }}>
        <RAreaChart data={chartData} margin={{ left: 0, right: 6, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} width={28} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(x) => `Month ${x}`} valueFormatter={(v) => `${v}%`} />} />
          <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={1.75} fill={`url(#${gid})`} dot={{ r: 2, fill: ORANGE }} />
        </RAreaChart>
      </ChartContainer>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">{label}</div>
    </div>
  );
}

// ---- Conversion funnel (stage drop-off) ------------------------------------
export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = steps[0]?.value || 1;
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.stage}>
          <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
            <span className="text-ink-dim">{s.stage}</span>
            <span className="font-mono text-ink">
              {s.value.toLocaleString()}
              <span className="ml-1.5 text-ink-dimmer">{Math.round(s.pct * 100)}% of top</span>
            </span>
          </div>
          <div className="h-8 w-full overflow-hidden rounded-md bg-white/[0.04]">
            <div
              className="h-full rounded-md"
              style={{ width: `${Math.max(5, (s.value / max) * 100)}%`, background: s.leak ? "rgba(254,81,0,0.42)" : "rgba(255,255,255,0.14)" }}
            />
          </div>
          {i > 0 && (
            <div
              className="mt-1 text-right font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{ color: s.leak ? ORANGE : "rgba(255,255,255,0.38)" }}
            >
              {Math.round(s.stepConv * 100)}% continued{s.leak ? " · leak" : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Radial gauge (a single rate, e.g. % answered) -------------------------
export function RadialGauge({ value, caption, color = ORANGE, height = 168 }: { value: number; caption?: string; color?: string; height?: number }) {
  const pctVal = Math.round(value * 100);
  const data = [{ name: "v", value: pctVal }];
  const config = { value: { label: caption ?? "", color } } satisfies ChartConfig;
  return (
    <div className="relative" style={{ height }}>
      <ChartContainer config={config} style={{ height }}>
        <RadialBarChart data={data} startAngle={220} endAngle={-40} innerRadius="74%" outerRadius="100%">
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "rgba(255,255,255,0.07)" }} dataKey="value" cornerRadius={10} fill="var(--color-value)" angleAxisId={0} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-medium leading-none tracking-[-0.02em] text-ink">{pctVal}%</span>
        {caption && <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{caption}</span>}
      </div>
    </div>
  );
}

// ---- Horizontal bar ranking (sorted comparison) ----------------------------
export function BarRanking({
  data,
  valueFmt,
  format = "number",
  color = ORANGE,
  track = "rgba(255,255,255,0.2)",
  labelWidth = 128,
  height,
}: {
  data: { name: string; value: number; highlight?: boolean }[];
  valueFmt?: (n: number) => string;
  format?: ValueFormat;
  color?: string;
  track?: string;
  labelWidth?: number;
  height?: number;
}) {
  const fmt = valueFmt ?? formatFor(format);
  const config = { value: { label: "Value", color } } satisfies ChartConfig;
  const h = height ?? Math.max(120, data.length * 40);
  return (
    <ChartContainer config={config} style={{ height: h }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44, top: 2, bottom: 2 }} barCategoryGap={12}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={labelWidth} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltipContent hideLabel valueFormatter={(v) => fmt(v)} />} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.highlight ? color : track} />
          ))}
          <LabelList dataKey="value" position="right" fill="rgba(255,255,255,0.72)" fontSize={11} formatter={(v) => fmt(Number(v))} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---- 100% stacked share bar (part-to-whole) --------------------------------
export function StackedShareBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="space-y-3.5">
      <div className="flex h-9 w-full overflow-hidden rounded-lg">
        {segments.map((s, i) => (
          <div key={i} className="min-w-[2px] transition-[width]" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-[12.5px]">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="text-ink-dim">{s.label}</span>
            <span className="font-mono text-ink">{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Rating distribution (1–5★) --------------------------------------------
export function RatingBars({ stars, counts }: { stars: number[]; counts: number[] }) {
  const max = Math.max(...counts, 1);
  return (
    <div className="space-y-2">
      {[...stars].reverse().map((star) => {
        const idx = stars.indexOf(star);
        const c = counts[idx];
        return (
          <div key={star} className="flex items-center gap-2.5">
            <span className="w-7 shrink-0 font-mono text-[11px] text-ink-dim">{star}★</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full" style={{ width: `${(c / max) * 100}%`, background: star >= 4 ? "rgba(255,255,255,0.28)" : ORANGE }} />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] text-ink-dim">{c}</span>
          </div>
        );
      })}
    </div>
  );
}
