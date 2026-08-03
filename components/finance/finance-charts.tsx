"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/dashboard/chart";
import type { FinanceDeal, FinanceMonth } from "@/lib/finance";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const axisMoney = (cents: number) => {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};
const motion = () => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CashFlowChart({ months }: { months: FinanceMonth[] }) {
  const gradientId = `fi-cash-${useId().replace(/:/g, "")}`;
  const config = {
    incomeCents: { label: "Cash in", color: "#fe5100" },
    outflowCents: { label: "Cash out", color: "var(--color-series)" },
    endingCashCents: { label: "Available cash", color: "var(--color-good)" },
  } satisfies ChartConfig;

  return (
    <>
      <ChartContainer config={config} className="h-[270px]" aria-label="Monthly cash in, cash out, and ending balance">
        <ComposedChart data={months} margin={{ left: 0, right: 8, top: 14, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-endingCashCents)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-endingCashCents)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={9} />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axisMoney} />
          <ChartTooltip content={<ChartTooltipContent valueFormatter={(value) => money(value)} />} />
          <Bar dataKey="incomeCents" fill="var(--color-incomeCents)" maxBarSize={16} radius={0} isAnimationActive={motion()} />
          <Bar dataKey="outflowCents" fill="var(--color-outflowCents)" maxBarSize={16} radius={0} isAnimationActive={motion()} />
          <Area
            dataKey="endingCashCents"
            type="linear"
            stroke="var(--color-endingCashCents)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 6, stroke: "color-mix(in srgb, var(--color-good) 18%, transparent)" }}
            isAnimationActive={motion()}
          />
        </ComposedChart>
      </ChartContainer>
      <div className="sr-only">
        <table>
          <caption>Monthly cash movement</caption>
          <thead><tr><th>Month</th><th>Cash in</th><th>Cash out</th><th>Ending cash</th></tr></thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.key}><th>{month.label}</th><td>{money(month.incomeCents)}</td><td>{money(month.outflowCents)}</td><td>{money(month.endingCashCents)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function DealAllocationChart({ deals }: { deals: FinanceDeal[] }) {
  const data = deals.filter((deal) => deal.status !== "canceled").map((deal) => ({
    name: deal.clientName.length > 22 ? `${deal.clientName.slice(0, 21)}…` : deal.clientName,
    fullName: deal.clientName,
    retainedCents: deal.retainedTargetCents,
    hanCents: deal.plannedHanDrawCents,
    gugaCents: deal.plannedGugaDrawCents,
  }));
  const config = {
    retainedCents: { label: "Stays in Urso", color: "#fe5100" },
    hanCents: { label: "Han", color: "var(--color-period-1)" },
    gugaCents: { label: "Guga", color: "var(--color-period-3)" },
  } satisfies ChartConfig;
  const height = Math.max(210, data.length * 54 + 60);

  return (
    <>
      <ChartContainer config={config} style={{ height }} aria-label="Planned company and founder allocation for every deal">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={axisMoney} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={118} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent valueFormatter={(value) => money(value)} />} />
          <Bar dataKey="retainedCents" stackId="allocation" fill="var(--color-retainedCents)" radius={0} isAnimationActive={motion()} />
          <Bar dataKey="hanCents" stackId="allocation" fill="var(--color-hanCents)" radius={0} isAnimationActive={motion()} />
          <Bar dataKey="gugaCents" stackId="allocation" fill="var(--color-gugaCents)" radius={0} isAnimationActive={motion()} />
        </BarChart>
      </ChartContainer>
      <div className="sr-only">
        <table>
          <caption>Planned deal allocation</caption>
          <thead><tr><th>Deal</th><th>Stays in Urso</th><th>Han</th><th>Guga</th></tr></thead>
          <tbody>
            {data.map((deal) => (
              <tr key={deal.fullName}><th>{deal.fullName}</th><td>{money(deal.retainedCents)}</td><td>{money(deal.hanCents)}</td><td>{money(deal.gugaCents)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
