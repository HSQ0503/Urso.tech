"use client";

// Urso dashboard charts — Recharts under the shadcn-style ChartContainer.
// Same export signatures as the previous hand-drawn SVG versions, so pages
// don't need to change. Theming flows through ChartConfig color vars.

import { useId, useState } from "react";
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
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./chart";
import type { FunnelStep, WaterfallStep, CostLine, MarginTrend, StoreCostBenchmark } from "./data";
import { useT } from "@/components/dashboard/locale-provider";

const ORANGE = "#fe5100";
const MUTED = "var(--color-series)";
// No-rounding rule: values, labels and tooltips show exact figures (cents on
// money, first decimal on rates). Axis TICK labels may stay compact — Recharts
// picks round tick values, so nothing real is lost there.
const fmtPct = (n: number) => `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const fmtHour = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}`;

// Evenly-spaced X ticks: aim for ~7 so a 31-day axis reads 1·6·11·16·21·26·31
// (consistent steps) instead of Recharts' uneven minTickGap auto-thinning.
const tickEvery = (len: number) => (len <= 9 ? 0 : Math.ceil(len / 7) - 1);

// Serializable formatter tokens — so server components can pick a number
// format without passing a function across the server/client boundary.
export type ValueFormat = "number" | "money" | "moneyK" | "pct";
function formatFor(token: ValueFormat): (n: number) => string {
  switch (token) {
    case "money":
    case "moneyK": // exact for values/tooltips — compaction lives in axisFor only
      return (n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    case "pct":
      return (n) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    default:
      return (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

// Axis ticks only: compact so the scale stays readable; the data itself is
// always shown exact by formatFor.
function axisFor(token: ValueFormat): (n: number) => string {
  if (token === "moneyK") return (n) => `$${Math.round(n / 1000)}k`;
  return formatFor(token);
}

// Truncate a category label to a single line with an ellipsis. Long names
// ("Sergio Leon-Sanchez", product strings) otherwise word-wrap into a 2–3 line
// mess on the axis. Tooltips and the exact-figures tables keep the full name.
const truncName = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// X-axis tick that wraps a multi-word category onto two centered lines so store
// names ("Winter Park", "Lakeside Village") stop colliding in the columns
// layout. Fill + size come from the ChartContainer axis CSS.
function WrapTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string | number } }) {
  const raw = String(payload?.value ?? "");
  const parts = raw.split(" ");
  const lines = parts.length > 1 ? [parts[0], parts.slice(1).join(" ")] : [raw];
  return (
    <text x={x} y={y} dy={12} textAnchor="middle" style={{ fontSize: "11px", fill: "var(--color-axis)" }}>
      {lines.map((ln, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>
          {ln}
        </tspan>
      ))}
    </text>
  );
}

// Single-line Y-axis tick for the ranking chart. Recharts' default tick word-
// wraps long names ("Sergio Leon-Sanchez") onto two lines; rendering our own
// <text> with no width prop keeps it to one line and truncates to fit instead.
function RankTick({ x, y, payload, max = 18 }: { x?: number; y?: number; payload?: { value?: string | number }; max?: number }) {
  const raw = String(payload?.value ?? "");
  return (
    <text x={x} y={y} dy="0.32em" textAnchor="end" style={{ fontSize: "11px", fill: "var(--color-axis)" }}>
      {truncName(raw, max)}
    </text>
  );
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
  const t = useT();
  const fmt = valueFmt ?? formatFor(format);
  const axis = valueFmt ?? axisFor(format);
  const gid = "rev-" + useId().replace(/:/g, "");
  const chartData = data.map((v, i) => ({ label: labels[i], value: v }));
  const config = { value: { label: t("Revenue"), color } } satisfies ChartConfig;
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
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickEvery(labels.length)} />
        <YAxis tickLine={false} axisLine={false} width={42} tickFormatter={axis} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />} />
        <Area dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 3 }} />
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
  const t = useT();
  const chartData = labels.map((l, i) => ({ label: l, answered: total[i] - missed[i], missed: missed[i] }));
  const config = {
    answered: { label: t("Answered"), color: "var(--color-series)" },
    missed: { label: t("Missed"), color },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickEvery(labels.length)} />
        <YAxis tickLine={false} axisLine={false} width={30} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="answered" stackId="a" fill="var(--color-answered)" radius={0} />
        <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={0} />
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
  const t = useT();
  const chartData = labels.map((l, i) => ({ label: l, visits: visits[i], bookings: bookings[i] }));
  const config = {
    visits: { label: t("Visits"), color: "var(--color-series)" },
    bookings: { label: t("New bookings"), color },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <ComposedChart data={chartData} margin={{ left: 4, right: 6, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickEvery(labels.length)} />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={34} />
        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={26} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="left" dataKey="visits" fill="var(--color-visits)" radius={0} barSize={13} />
        <Line yAxisId="right" dataKey="bookings" type="linear" stroke="var(--color-bookings)" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} />
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
  const t = useT();
  const data = hourly.map((v, i) => ({ hour: startHour + i, answered: v - missedHourly[i], missed: missedHourly[i] }));
  const config = {
    answered: { label: t("Answered"), color: "var(--color-series)" },
    missed: { label: t("Missed"), color: "var(--color-bad)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={6} interval={1} tickFormatter={(h) => fmtHour(Number(h))} />
        <YAxis tickLine={false} axisLine={false} width={24} />
        <ReferenceArea x1={closeHour} x2={startHour + hourly.length - 1} fill="var(--color-series)" fillOpacity={0.1} ifOverflow="extendDomain" />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(h) => fmtHour(Number(h))} />} />
        <Bar dataKey="answered" stackId="a" fill="var(--color-answered)" radius={0} />
        <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={0} />
      </BarChart>
    </ChartContainer>
  );
}

// ---- Grooming vs retail stacked area ---------------------------------------
export function StackedArea({ data }: { data: { m: string; grooming: number; retail: number }[] }) {
  const t = useT();
  const gid = "mix-" + useId().replace(/:/g, "");
  const config = {
    grooming: { label: t("Grooming"), color: ORANGE },
    retail: { label: t("Retail"), color: MUTED },
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
        <Area dataKey="grooming" type="linear" stackId="1" stroke="var(--color-grooming)" strokeWidth={1.5} fill={`url(#${gid}-g)`} />
        <Area dataKey="retail" type="linear" stackId="1" stroke="var(--color-retail)" strokeWidth={1.5} fill={`url(#${gid}-r)`} />
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
    <div className="flex items-center gap-2 text-xs">
      <span className="size-2 rounded-none" style={{ background: color }} />
      <span className="text-ink">{label}</span>
      <span className="font-mono text-ink-dim">{value}</span>
    </div>
  );
}

// ---- Donut (N segments) — e.g. the customer mix incl. a "both" slice --------
export function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const data = segments.map((s, i) => ({ name: `s${i}`, value: s.value }));
  const config = Object.fromEntries(
    segments.map((s, i) => [`s${i}`, { label: s.label, color: s.color }] as [string, { label: string; color: string }]),
  ) satisfies ChartConfig;
  return (
    <div className="flex items-center gap-4">
      <ChartContainer config={config} className="shrink-0" style={{ height: 96, width: 96 }}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <ChartTooltip content={<ChartTooltipContent hideLabel valueFormatter={(v) => fmtPct(v / total)} />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={28} outerRadius={46} strokeWidth={0} paddingAngle={2}>
            {segments.map((s, i) => (
              <Cell key={i} fill={s.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <LegendRow key={i} color={s.color} label={s.label} value={fmtPct(s.value / total)} />
        ))}
      </div>
    </div>
  );
}

// ---- Cohort retention curve ------------------------------------------------
export function CohortCurve({ data, label = "months since first visit" }: { data: number[]; label?: string }) {
  const t = useT();
  const gid = "co-" + useId().replace(/:/g, "");
  const chartData = data.map((v, i) => ({ x: i, value: v }));
  const config = { value: { label: t("Still active"), color: ORANGE } } satisfies ChartConfig;
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
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(x) => t("Month {x}", { x: String(x) })} valueFormatter={(v) => `${v}%`} />} />
          <Area dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={1.75} fill={`url(#${gid})`} dot={false} />
        </RAreaChart>
      </ChartContainer>
      <div className="mt-1.5 font-mono text-2xs uppercase tracking-[0.1em] text-ink-dimmer">{t(label)}</div>
    </div>
  );
}

// ---- Rate trend (monthly % line — e.g. return rate over the trailing year) --
export function RateTrend({ data, seriesLabel = "Return rate" }: { data: { label: string; value: number }[]; seriesLabel?: string }) {
  const t = useT();
  const gid = "rt-" + useId().replace(/:/g, "");
  const config = { value: { label: t(seriesLabel), color: ORANGE } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height: 150 }}>
      <RAreaChart data={data} margin={{ left: 0, right: 6, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} width={34} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => `${v}%`} />} />
        <Area dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={1.75} fill={`url(#${gid})`} dot={false} />
      </RAreaChart>
    </ChartContainer>
  );
}

// ---- Conversion funnel (stage drop-off) ------------------------------------
export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const t = useT();
  const max = steps[0]?.value || 1;
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.stage}>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-ink-dim">{s.stage}</span>
            <span className="font-mono text-ink">
              {s.value.toLocaleString()}
              <span className="ml-1.5 text-ink-dimmer">{(s.pct * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% {t("of top")}</span>
            </span>
          </div>
          <div className="h-8 w-full overflow-hidden rounded-none bg-raise">
            <div
              className="h-full rounded-none"
              style={{ width: `${Math.max(5, (s.value / max) * 100)}%`, background: s.leak ? "color-mix(in srgb, var(--color-bad) 45%, transparent)" : "var(--color-series-soft)" }}
            />
          </div>
          {i > 0 && (
            <div
              className="mt-1 text-right font-mono text-2xs uppercase tracking-[0.1em]"
              style={{ color: s.leak ? "var(--color-bad)" : "var(--color-ink-dimmer)" }}
            >
              {(s.stepConv * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% {t("continued")}{s.leak ? ` · ${t("leak")}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Radial gauge (a single rate, e.g. % answered) -------------------------
export function RadialGauge({ value, caption, color = ORANGE, height = 168 }: { value: number; caption?: string; color?: string; height?: number }) {
  const pctVal = (value * 100).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const data = [{ name: "v", value: pctVal }];
  const config = { value: { label: caption ?? "", color } } satisfies ChartConfig;
  return (
    <div className="relative mx-auto" style={{ height, width: height }}>
      <ChartContainer config={config} style={{ height }}>
        <RadialBarChart data={data} startAngle={220} endAngle={-40} innerRadius="74%" outerRadius="100%">
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "var(--color-track)" }} dataKey="value" cornerRadius={0} fill="var(--color-value)" angleAxisId={0} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold leading-none tracking-[-0.01em] tabular-nums text-ink">{pctVal}%</span>
        {caption && <span className="mt-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-ink-dimmer">{caption}</span>}
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
  track = "var(--color-track)",
  labelWidth = 128,
  height,
  valueLabel = "Value",
}: {
  data: { name: string; value: number; highlight?: boolean }[];
  valueFmt?: (n: number) => string;
  format?: ValueFormat;
  color?: string;
  track?: string;
  labelWidth?: number;
  height?: number;
  valueLabel?: string;
}) {
  const t = useT();
  const fmt = valueFmt ?? formatFor(format);
  const config = { value: { label: t(valueLabel), color } } satisfies ChartConfig;
  const h = height ?? Math.max(120, data.length * 40);
  return (
    <ChartContainer config={config} style={{ height: h }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44, top: 2, bottom: 2 }} barCategoryGap={12}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={<RankTick max={Math.max(6, Math.floor(labelWidth / 7))} />}
        />
        <ChartTooltip cursor={{ fill: "var(--color-raise)" }} content={<ChartTooltipContent hideLabel valueFormatter={(v) => fmt(v)} />} />
        <Bar dataKey="value" radius={0} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.highlight ? color : track} />
          ))}
          <LabelList dataKey="value" position="right" fill="var(--color-ink-dim)" fontSize={11} formatter={(v) => fmt(Number(v))} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---- 100% stacked share bar (part-to-whole) --------------------------------
export function StackedShareBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const last = segments.length - 1;
  return (
    <div className="space-y-3.5">
      {/* No overflow-hidden so the hover tooltip can escape; ends are rounded instead. */}
      <div className="flex h-9 w-full">
        {segments.map((s, i) => {
          const share = ((s.value / total) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 });
          return (
            <div
              key={i}
              className={`group/seg relative min-w-[2px] cursor-default transition-[width,filter] hover:brightness-110 ${i === 0 ? "rounded-none" : ""} ${i === last ? "rounded-none" : ""}`}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            >
              <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-none border border-edge bg-surface px-3 py-2 opacity-0 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] transition-opacity duration-150 group-hover/seg:opacity-100">
                <span className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                  <span className="text-ink-dim">{s.label}</span>
                  <span className="font-mono tabular-nums text-ink">{share}%</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="text-ink-dim">{s.label}</span>
            <span className="font-mono text-ink">{((s.value / total) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%</span>
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
            <span className="w-7 shrink-0 font-mono text-xs text-ink-dim">{star}★</span>
            <div className="h-3 flex-1 overflow-hidden rounded-none bg-raise">
              <div className="h-full rounded-none" style={{ width: `${(c / max) * 100}%`, background: star >= 4 ? "var(--color-series)" : "var(--color-bad)" }} />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-ink-dim">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Compare page: period-vs-period charts ----------------------------------

// Grouped now-vs-before bars. layout="columns" (few entities, e.g. stores)
// renders vertical columns; layout="rows" (many named entities, e.g. groomers)
// renders horizontal paired bars with the names on the left.
// Extra baselines (multi-year compares) render as progressively softer series.
const EXTRA_COLORS = ["var(--color-series-soft)", "var(--color-track)"];

export function CompareBars({
  data,
  labelA,
  labelB,
  moreLabels = [],
  format = "number",
  layout = "columns",
  height,
}: {
  data: { name: string; a: number | null; b: number | null; more?: (number | null)[] }[];
  labelA: string;
  labelB: string;
  moreLabels?: string[]; // labels for data[].more series (older baselines)
  format?: ValueFormat;
  layout?: "columns" | "rows";
  height?: number;
}) {
  const fmt = formatFor(format);
  const axis = axisFor(format);
  // Keep nulls: "no activity that period" (new hire, departure) must read as
  // absent, not $0. Recharts skips null bars; the tooltip shows an em dash.
  const chartData = data.map((d) => ({
    name: d.name, a: d.a, b: d.b,
    ...Object.fromEntries(moreLabels.map((_, i) => [`m${i}`, d.more?.[i] ?? null])),
  }));
  const fmtLabel = (v: unknown) => (v == null ? "" : fmt(Number(v)));
  const config = {
    a: { label: labelA, color: ORANGE },
    b: { label: labelB, color: MUTED },
    ...Object.fromEntries(moreLabels.map((l, i) => [`m${i}`, { label: l, color: EXTRA_COLORS[i % EXTRA_COLORS.length] }])),
  } satisfies ChartConfig;
  // Bars render oldest → newest left-to-right within each group.
  const orderedKeys = [...moreLabels.map((_, i) => `m${i}`).reverse(), "b"];

  if (layout === "rows") {
    const h = height ?? Math.max(150, data.length * (52 + moreLabels.length * 12));
    return (
      <ChartContainer config={config} style={{ height: h }}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 56, top: 2, bottom: 2 }} barCategoryGap={12} barGap={2}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={118} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} tickFormatter={(v) => truncName(String(v), 16)} />
          <ChartTooltip cursor={{ fill: "var(--color-raise)" }} content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />} />
          {orderedKeys.map((k) => (
            <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={0} barSize={8} isAnimationActive={false} />
          ))}
          <Bar dataKey="a" fill="var(--color-a)" radius={0} barSize={8} isAnimationActive={false}>
            <LabelList dataKey="a" position="right" fill="var(--color-ink-dim)" fontSize={10.5} formatter={fmtLabel} />
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={config} style={{ height: height ?? 250 }}>
      <BarChart data={chartData} margin={{ left: 4, right: 8, top: 20, bottom: 0 }} barCategoryGap="26%" barGap={5}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} height={40} tick={<WrapTick />} />
        <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={axis} />
        <ChartTooltip cursor={{ fill: "var(--color-raise)" }} content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />} />
        {orderedKeys.map((k) => (
          <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={0} isAnimationActive={false} />
        ))}
        <Bar dataKey="a" fill="var(--color-a)" radius={0} isAnimationActive={false}>
          <LabelList dataKey="a" position="top" fill="var(--color-ink-dim)" fontSize={10.5} formatter={fmtLabel} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Winners vs losers: the change between the two periods, diverging from zero.
// Gainers grow right (green), decliners grow left (orange).
export function CompareDiverging({
  data,
  format = "number",
  height,
}: {
  data: { name: string; delta: number }[];
  format?: ValueFormat;
  height?: number;
}) {
  const t = useT();
  const fmt = formatFor(format);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
  const config = { delta: { label: t("Change"), color: ORANGE } } satisfies ChartConfig;
  const h = height ?? Math.max(150, data.length * 40);
  return (
    <ChartContainer config={config} style={{ height: h }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 56, top: 2, bottom: 2 }} barCategoryGap={10}>
        {/* Pad the domain so the longest bar never reaches the edge — its value
            label needs room and must never collide with the category name. */}
        <XAxis type="number" hide domain={[(min: number) => Math.min(0, min) * 1.25, (max: number) => Math.max(0, max) * 1.25]} />
        <YAxis type="category" dataKey="name" width={126} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} tickFormatter={(v) => truncName(String(v), 17)} />
        <ReferenceLine x={0} stroke="var(--color-edge-strong)" />
        <ChartTooltip cursor={{ fill: "var(--color-raise)" }} content={<ChartTooltipContent hideLabel valueFormatter={(v) => signed(v)} />} />
        <Bar dataKey="delta" radius={0} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.delta >= 0 ? "var(--color-good)" : "var(--color-bad)"} />
          ))}
          <LabelList dataKey="delta" position="right" fill="var(--color-ink-dim)" fontSize={10.5} formatter={(v) => signed(Number(v))} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Periods overlaid day by day as running totals — "is this period ahead of
// or behind the others at the same point?" Solid orange = focus period,
// dashed grey = primary baseline, softer dashes = older baselines.
export function ComparePace({
  a,
  b,
  more = [],
  labelA,
  labelB,
  moreLabels = [],
  format = "moneyK",
  height = 230,
}: {
  a: number[];
  b: number[];
  more?: number[][]; // older baselines, daily revenue per period
  labelA: string;
  labelB: string;
  moreLabels?: string[];
  format?: ValueFormat;
  height?: number;
}) {
  const t = useT();
  const fmt = formatFor(format);
  const axis = axisFor(format);
  const all = [a, b, ...more];
  const len = Math.max(...all.map((xs) => xs.length));
  const cumulative = (xs: number[]) => {
    const out: number[] = [];
    for (const v of xs) out.push((out[out.length - 1] ?? 0) + v);
    return out;
  };
  const cum = all.map(cumulative);
  const keys = ["a", "b", ...more.map((_, i) => `m${i}`)];
  const chartData = Array.from({ length: len }, (_, i) => ({
    label: String(i + 1),
    ...Object.fromEntries(keys.map((k, s) => [k, i < all[s].length ? cum[s][i] : null])),
  }));
  const config = {
    a: { label: labelA, color: ORANGE },
    b: { label: labelB, color: MUTED },
    ...Object.fromEntries(moreLabels.map((l, i) => [`m${i}`, { label: l, color: EXTRA_COLORS[i % EXTRA_COLORS.length] }])),
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickEvery(len)} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={axis} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={<ChartTooltipContent labelFormatter={(l) => t("Day {l}", { l: String(l) })} valueFormatter={(v) => fmt(v)} />}
        />
        {more.map((_, i) => (
          <Line key={i} dataKey={`m${i}`} type="linear" stroke={`var(--color-m${i})`} strokeWidth={1.5} strokeDasharray="3 4" dot={false} />
        ))}
        <Line dataKey="b" type="linear" stroke="var(--color-b)" strokeWidth={1.75} strokeDasharray="5 4" dot={false} />
        <Line dataKey="a" type="linear" stroke="var(--color-a)" strokeWidth={2.25} dot={false} activeDot={{ r: 3 }} />
      </LineChart>
    </ChartContainer>
  );
}

// ---- Simple share histogram (grooming cycle distribution) -------------------
export function HistogramBars({
  data,
  height = 190,
  color = ORANGE,
  seriesLabel = "Share",
}: {
  data: { label: string; value: number }[]; // value = share 0..1
  height?: number;
  color?: string;
  seriesLabel?: string;
}) {
  const t = useT();
  const config = { value: { label: t(seriesLabel), color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
        <YAxis hide />
        <ChartTooltip cursor={{ fill: "var(--color-raise)" }} content={<ChartTooltipContent valueFormatter={(v) => `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={0} isAnimationActive={false}>
          <LabelList dataKey="value" position="top" fill="var(--color-ink-dim)" fontSize={10.5} formatter={(v) => `${(Number(v) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Money / profit charts
// ════════════════════════════════════════════════════════════════════════════
const money0 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const moneyK = (n: number) => `${n < 0 ? "−" : ""}$${(Math.abs(n) / 1000).toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100000 ? 0 : 1 })}k`;
const pct1 = (n: number) => `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

// Segmented pill control (Revenue / Profit / Margin …).
function Segmented<T extends string>({ options, value, onChange }: { options: readonly { k: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-[var(--pill-edge)] bg-[var(--pill-bg)] p-0.5">
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={`cursor-pointer rounded-full px-3 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors ${value === o.k ? "bg-raise-strong text-ink" : "text-ink-dim hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Profit waterfall ------------------------------------------------------
// Revenue → −COGS → Gross profit → −Payroll → −Rent → −Royalty → −Other → Net.
// Hand-drawn SVG so each step's bar, its connector to the running total, and the
// value label sit exactly where they should — recharts floating-stacked bars
// crowd the labels and can't draw the connecting flow.
type WBar = { label: string; value: number; kind: WaterfallStep["kind"]; lo: number; hi: number; after: number };
function waterfallGeometry(steps: WaterfallStep[]): WBar[] {
  let run = 0;
  return steps.map((s) => {
    let lo: number, hi: number;
    if (s.kind === "subtract") {
      const before = run;
      const after = run + s.amount;
      run = after;
      lo = Math.min(before, after);
      hi = Math.max(before, after);
    } else {
      run = s.amount;
      lo = Math.min(0, s.amount);
      hi = Math.max(0, s.amount);
    }
    return { label: s.label, value: s.amount, kind: s.kind, lo, hi, after: run };
  });
}

// Round axis ticks to a "nice" step covering [lo, hi] with ~5 lines.
function niceTicks(lo: number, hi: number): number[] {
  const range = hi - lo || 1;
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(v);
  return ticks.length ? ticks : [0];
}

export function ProfitWaterfall({ steps }: { steps: WaterfallStep[]; height?: number }) {
  const bars = waterfallGeometry(steps);
  const W = 600, H = 320, padL = 48, padR = 14, padT = 24, padB = 48;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / bars.length;
  const barW = Math.min(46, slot * 0.6);
  const hiMax = Math.max(0, ...bars.map((b) => b.hi));
  const loMin = Math.min(0, ...bars.map((b) => b.lo));
  const ticks = niceTicks(loMin, hiMax);
  const domMin = Math.min(loMin, ticks[0]);
  const domMax = Math.max(hiMax, ticks[ticks.length - 1]);
  const yOf = (v: number) => padT + plotH * (1 - (v - domMin) / (domMax - domMin || 1));
  const cx = (i: number) => padL + slot * i + slot / 2;

  return (
    <div className="w-full font-mono">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: "auto", display: "block" }} preserveAspectRatio="xMidYMid meet">
        {ticks.map((v, i) => (
          <g key={`t${i}`}>
            <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="var(--color-grid)" strokeWidth={1} />
            <text x={padL - 8} y={yOf(v)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--color-axis)">{moneyK(v)}</text>
          </g>
        ))}
        {bars.slice(0, -1).map((b, i) => (
          <line key={`c${i}`} x1={cx(i) + barW / 2} y1={yOf(b.after)} x2={cx(i + 1) - barW / 2} y2={yOf(b.after)} stroke="var(--color-edge-strong)" strokeWidth={1} />
        ))}
        {bars.map((b, i) => {
          const yTop = yOf(b.hi), yBot = yOf(b.lo);
          const isTotal = b.kind !== "subtract";
          const fill = isTotal ? (b.value >= 0 ? "var(--color-good)" : "var(--color-bad)") : MUTED;
          return (
            <g key={`b${i}`}>
              <title>{`${b.label}: ${money0(b.value)}`}</title>
              <rect x={cx(i) - barW / 2} y={yTop} width={barW} height={Math.max(1.5, yBot - yTop)} fill={fill} />
              <text x={cx(i)} y={yTop - 6} textAnchor="middle" fontSize={11} fontWeight={isTotal ? 600 : 400} fill={isTotal ? "var(--color-ink)" : "var(--color-ink-dim)"}>
                {moneyK(b.value)}
              </text>
            </g>
          );
        })}
        {bars.map((b, i) => {
          const words = b.label.split(" ");
          const lines = words.length > 1 ? [words[0], words.slice(1).join(" ")] : [b.label];
          return (
            <text key={`x${i}`} x={cx(i)} y={padT + plotH + 16} textAnchor="middle" fontSize={11} fill="var(--color-axis)">
              {lines.map((ln, k) => (
                <tspan key={k} x={cx(i)} dy={k === 0 ? 0 : 12}>{ln}</tspan>
              ))}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ---- Money trend with Revenue / Gross / Net / Margin toggle ----------------
export function MoneyTrend({ trend, height = 248 }: { trend: MarginTrend; height?: number }) {
  const t = useT();
  const [metric, setMetric] = useState<"revenue" | "gross" | "net" | "margin">("revenue");
  const gross$ = trend.revenue.map((r, i) => r * trend.grossMargin[i]);
  const net$ = trend.revenue.map((r, i) => r * trend.netMargin[i]);
  const options = [
    { k: "revenue", label: t("Revenue") },
    { k: "gross", label: t("Gross profit") },
    { k: "net", label: t("Net profit") },
    { k: "margin", label: t("Margin") },
  ] as const;
  const series = metric === "revenue" ? trend.revenue : metric === "gross" ? gross$ : net$;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Segmented options={options} value={metric} onChange={setMetric} />
      </div>
      {metric === "margin" ? (
        <MarginLines labels={trend.labels} gross={trend.grossMargin} net={trend.netMargin} height={height} />
      ) : (
        <MoneyArea labels={trend.labels} data={series} label={options.find((o) => o.k === metric)!.label} height={height} />
      )}
    </div>
  );
}

function MoneyArea({ labels, data, label, height }: { labels: string[]; data: number[]; label: string; height: number }) {
  const gid = "money-" + useId().replace(/:/g, "");
  const chartData = data.map((v, i) => ({ label: labels[i], value: v }));
  const config = { value: { label, color: ORANGE } } satisfies ChartConfig;
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
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickEvery(labels.length)} />
        <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={(n) => moneyK(Number(n))} />
        <ReferenceLine y={0} stroke="var(--color-edge-strong)" />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent valueFormatter={(v) => money0(Number(v))} />} />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 3 }} />
      </RAreaChart>
    </ChartContainer>
  );
}

function MarginLines({ labels, gross, net, height }: { labels: string[]; gross: number[]; net: number[]; height: number }) {
  const t = useT();
  const data = labels.map((l, i) => ({ label: l, gross: gross[i] * 100, net: net[i] * 100 }));
  const config = {
    gross: { label: t("Gross margin"), color: MUTED },
    net: { label: t("Net margin"), color: ORANGE },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height }}>
      <LineChart data={data} margin={{ left: 4, right: 10, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickEvery(labels.length)} />
        <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(n) => `${Math.round(Number(n))}%`} />
        <ReferenceLine y={0} stroke="var(--color-edge-strong)" />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent valueFormatter={(v) => `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`} />} />
        <Line dataKey="gross" type="monotone" stroke="var(--color-gross)" strokeWidth={2} dot={false} />
        <Line dataKey="net" type="monotone" stroke="var(--color-net)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}

// ---- Cost-as-%-of-revenue ranked list --------------------------------------
export function CostBars({ lines }: { lines: CostLine[] }) {
  const max = Math.max(...lines.map((l) => l.pctOfRevenue), 0.01);
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l) => (
        <div key={l.category} className="flex items-center gap-3">
          <div className="w-[104px] shrink-0 truncate font-mono text-xs text-ink-dim">{l.category}</div>
          <div className="relative h-[18px] flex-1 overflow-hidden rounded-[2px] bg-[var(--color-track)]">
            <div className="h-full bg-orange" style={{ width: `${(l.pctOfRevenue / max) * 100}%` }} />
          </div>
          <div className="w-[124px] shrink-0 text-right font-mono text-xs tabular-nums text-ink">
            {money0(l.amount)} <span className="text-ink-dimmer">· {pct1(l.pctOfRevenue)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Cross-store cost benchmark heatmap ------------------------------------
export function CostBenchmark({ rows }: { rows: StoreCostBenchmark[] }) {
  const cols = [
    { k: "cogsPct", label: "COGS" },
    { k: "laborPct", label: "Labor" },
    { k: "rentPct", label: "Rent" },
    { k: "royaltyPct", label: "Royalty" },
    { k: "otherPct", label: "Other" },
  ] as const;
  const colMax: Record<string, number> = {};
  for (const c of cols) colMax[c.k] = Math.max(...rows.map((r) => r[c.k]), 0.0001);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="font-mono text-2xs uppercase tracking-[0.1em] text-ink-dimmer">
            <th className="py-1.5 pr-3 text-left font-medium">Store</th>
            {cols.map((c) => (
              <th key={c.k} className="px-2 py-1.5 text-right font-medium">{c.label}</th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium">Net margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-edge">
              <td className="py-2 pr-3 text-ink">{r.name}</td>
              {cols.map((c) => (
                <td key={c.k} className="px-2 py-2 text-right font-mono tabular-nums text-ink-dim" style={{ background: `rgba(254,81,0,${(r[c.k] / colMax[c.k]) * 0.2})` }}>
                  {pct1(r[c.k])}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-mono tabular-nums" style={{ color: r.netMargin >= 0 ? "var(--color-good)" : "var(--color-bad)" }}>
                {pct1(r.netMargin)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
