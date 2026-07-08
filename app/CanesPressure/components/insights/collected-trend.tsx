"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/canes/analytics";

// The one recharts island on the Insights page: money collected per ET bucket,
// stacked cash (green) + card (sky). Flat + still per the design discipline —
// no gradients, no entrance animation. Values plot in dollars; the tooltip
// shows exact figures, only axis ticks compact.

const CASH = "var(--cp-good, #0f7b48)";
const CARD = "var(--cp-cold, #0b6aa2)";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Axis ticks only: $1.2k compaction keeps the scale readable.
const axisMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : `$${n}`;

// Aim for ~7 x labels no matter how many buckets the range produced.
const tickInterval = (len: number) => (len <= 9 ? 0 : Math.ceil(len / 7) - 1);

type TipItem = { dataKey?: string | number; value?: number };

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => Number(payload.find((p) => p.dataKey === k)?.value ?? 0);
  const cash = get("cash");
  const card = get("card");
  return (
    <div className="rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 shadow-[0_4px_12px_rgba(12,43,63,0.08)]">
      <p className="cp-mono">{label}</p>
      <div className="mt-1.5 space-y-1">
        <Row swatch={CASH} label="Cash" value={money(cash)} />
        <Row swatch={CARD} label="Card" value={money(card)} />
        <div className="border-t border-[var(--cp-line)] pt-1">
          <Row label="Total" value={money(cash + card)} strong />
        </div>
      </div>
    </div>
  );
}

function Row({ swatch, label, value, strong }: { swatch?: string; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5 text-[12px]">
      <span className="flex items-center gap-1.5 text-[var(--cp-muted)]">
        {swatch && <span className="h-2 w-2 rounded-[2px]" style={{ background: swatch }} />}
        {label}
      </span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

export function CollectedTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[224px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--cp-line, #e4e6e8)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={tickInterval(data.length)}
            tick={{ fontSize: 10.5, fill: "var(--cp-faint, #84888f)" }}
            tickMargin={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={axisMoney}
            tick={{ fontSize: 10.5, fill: "var(--cp-faint, #84888f)" }}
          />
          <Tooltip cursor={{ fill: "var(--cp-hover, #f1f2f4)" }} content={<TrendTooltip />} />
          <Bar dataKey="cash" stackId="m" fill={CASH} isAnimationActive={false} maxBarSize={26} />
          <Bar
            dataKey="card"
            stackId="m"
            fill={CARD}
            isAnimationActive={false}
            maxBarSize={26}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
