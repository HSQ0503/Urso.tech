"use client";

import { useId } from "react";
import {
  Area,
  Bar,
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
    incomeCents: { label: "Received", color: "#fe5100" },
    outflowCents: { label: "Paid", color: "var(--color-series)" },
    endingCashCents: { label: "Balance", color: "var(--color-good)" },
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
    fullName: deal.clientName,
    contractedCents: deal.contractedCents,
    companyCents: deal.companyAllocationCents,
    spentCents: Math.min(deal.businessSpentCents, deal.retainedTargetCents),
    hanCents: deal.plannedHanDrawCents,
    gugaCents: deal.plannedGugaDrawCents,
  }));

  return (
    <div className="mt-5 divide-y divide-edge border-y border-edge" aria-label="Company cash, spending, and founder allocation for every deal">
      {data.map((deal) => {
        const share = (amountCents: number) => deal.contractedCents > 0 ? `${(amountCents / deal.contractedCents) * 100}%` : "0%";

        return (
          <section key={deal.fullName} className="py-4 first:pt-3 last:pb-3">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="min-w-0 truncate text-[13px] font-medium text-ink" title={deal.fullName}>{deal.fullName}</h3>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink">{money(deal.contractedCents)}</span>
            </div>

            <div className="mt-3 flex h-2.5 overflow-hidden bg-track" aria-hidden>
              <span className="bg-orange" style={{ width: share(deal.companyCents) }} />
              <span className="bg-[var(--color-period-1)]" style={{ width: share(deal.spentCents) }} />
              <span className="bg-[var(--color-period-2)]" style={{ width: share(deal.hanCents) }} />
              <span className="bg-[var(--color-period-3)]" style={{ width: share(deal.gugaCents) }} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 2xl:grid-cols-4">
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[10.5px] text-ink-dimmer"><span className="size-1.5 shrink-0 bg-orange" />Company</dt>
                <dd className="mt-1 truncate font-mono text-[10.5px] tabular-nums text-ink">{money(deal.companyCents)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[10.5px] text-ink-dimmer"><span className="size-1.5 shrink-0 bg-[var(--color-period-1)]" />Spent</dt>
                <dd className="mt-1 truncate font-mono text-[10.5px] tabular-nums text-ink">{money(deal.spentCents)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[10.5px] text-ink-dimmer"><span className="size-1.5 shrink-0 bg-[var(--color-period-2)]" />Han</dt>
                <dd className="mt-1 truncate font-mono text-[10.5px] tabular-nums text-ink">{money(deal.hanCents)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[10.5px] text-ink-dimmer"><span className="size-1.5 shrink-0 bg-[var(--color-period-3)]" />Guga</dt>
                <dd className="mt-1 truncate font-mono text-[10.5px] tabular-nums text-ink">{money(deal.gugaCents)}</dd>
              </div>
            </dl>
          </section>
        );
      })}
    </div>
  );
}
