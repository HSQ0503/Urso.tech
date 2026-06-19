import {
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  getMetrics,
  getCrossSell,
  getCustomerSegments,
  getCustomersByValue,
  getCustomerIntel,
  getRetention,
  getReturnRateTrend,
  getKpiDeltas,
  getWinbackList,
} from "@/components/dashboard/data.server";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  Delta,
  DonutSplit,
  CohortCurve,
  StackedShareBar,
  HistogramBars,
  RateTrend,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { WinbackCard } from "@/components/dashboard/winback-card";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  const m = await getMetrics(scope, month);
  const xs = await getCrossSell(scope, month);
  const segments = await getCustomerSegments(scope);
  const topCustomers = await getCustomersByValue(scope);
  const intel = await getCustomerIntel(scope);
  const retention = await getRetention(scope, month);
  const winback = await getWinbackList(scope);
  const deltas = await getKpiDeltas(scope, month);
  const trend = await getReturnRateTrend(scope);

  // Dormant only earns a cell once the re-segmentation (migration 0014) has
  // run — before that the count is 0 and a five-cell grid would just confuse.
  const segCells = segments.filter((s) => s.segment !== "Dormant" || s.count > 0);

  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow={`Customers · ${scopeLabel(scope)} · ${period}`}
        title="Customer retention"
        sub="Grooming is recurring revenue, so retention is the clearest indicator of long-term performance. These figures track repeat behaviour, cross-selling, and customers who have lapsed."
      />

      <section className="border-y border-edge py-7">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <Stat label="Returning" value={pct(retention.returningPct)} sub="of customers come back after their first visit" />
          <Stat label="Return rate" value={pct(m.rebook)} sub="of profiled visits are 90-day returns" delta={deltas.rebook} />
          <Stat label="Grooming cycle" value={retention.cycle.medianDays ? `${retention.cycle.medianDays} days` : "—"} sub="median time between grooms" />
          <Stat label="Single-visit" value={retention.oneAndDone.toLocaleString()} sub="came once, no return in 90+ days" accent />
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          Returning, cycle &amp; single-visit cover all recorded history (Jan 2024 →) · Return rate follows the month filter
        </p>
      </section>

      {trend && (
        <Card className="mt-3">
          <div className="flex items-center gap-1.5">
            <Micro>Return rate · by month, trailing year</Micro>
            <AskAi
              topic="Return rate trend"
              topicId="returnRateTrend"
              suggestions={["Is the return rate sliding?", "When did the trend change?"]}
            />
            <ChartInfo id="returnRateTrend" />
          </div>
          <div className="mt-3">
            <RateTrend data={trend} />
          </div>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-1.5">
              <Micro>New vs returning</Micro>
              <AskAi
                topic="New vs returning customers"
                topicId="returningVsNew"
                suggestions={["How much of the base actually comes back?", "How does this compare to last year?"]}
              />
              <ChartInfo id="returningVsNew" />
            </div>
            <div className="mt-3">
              <DonutSplit a={retention.returningPct} b={retention.newPct} labelA="Returning" labelB="New" />
            </div>
          </div>
          <div className="border-t border-edge pt-5">
            <div className="mb-3 flex items-center gap-1.5">
              <Micro>Cohort retention — share of new customers still active, by months since first visit</Micro>
              <AskAi
                topic="Cohort retention"
                topicId="cohortRetention"
                suggestions={["Which cohorts retain best?", "Where does the curve drop off?"]}
              />
              <ChartInfo id="cohortRetention" />
            </div>
            <CohortCurve data={retention.cohort} />
            <p className="mt-3 text-[13px] leading-[1.55] text-ink-dim">
              {pct(retention.cohort[retention.cohort.length - 1] / 100)} of new customers are still returning {retention.cohort.length - 1} months after their first visit. The curve deepens as history accumulates; improving it is the most durable driver of recurring revenue.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-1.5">
              <Micro>Cross-sell</Micro>
              <AskAi
                topic="Retail & grooming overlap"
                topicId="crossSellMix"
                suggestions={["How do I move grooming-only into both?", "What's the cross-sell wall costing me?"]}
              />
              <ChartInfo id="crossSellMix" />
            </div>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Retail &amp; grooming overlap</h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-ink-dim">
              Customers who buy both spend materially more per visit. The largest opportunity is converting grooming-only customers into retail buyers at checkout.
            </p>
          </div>
          <div className="mt-auto">
            <StackedShareBar
              segments={[
                { label: "Both", value: xs.both, color: "#fe5100" },
                { label: "Grooming only", value: xs.groomingOnly, color: "var(--color-series)" },
                { label: "Retail only", value: xs.retailOnly, color: "var(--color-series-soft)" },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* Grooming cycle */}
      <Card className="mt-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Micro>Grooming cycle · time between grooms</Micro>
              <AskAi
                topic="Grooming cycle"
                topicId="groomingCycle"
                suggestions={["When should rebooking nudges go out?", "How many customers are drifting off cadence?"]}
              />
              <ChartInfo id="groomingCycle" />
            </div>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">How often customers come back</h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">
            {retention.cycle.gapCount.toLocaleString()} return visits measured
          </span>
        </div>
        <div className="mt-4">
          <HistogramBars data={retention.cycle.histogram} seriesLabel="Share of return gaps" />
        </div>
        <p className="mt-3 max-w-[720px] text-[13px] leading-[1.55] text-ink-dim">
          The median customer returns every {retention.cycle.medianDays} days, and {pct(retention.cycle.recurringPct)} of returning customers hold a recurring cycle of 60 days or less ({retention.cycle.recurringCount.toLocaleString()} of {retention.cycle.cycleCustomers.toLocaleString()}). Everything right of the 8-week bars is a customer drifting off cadence — the moment a rebooking nudge earns its keep. True checkout rebooking (booked the next visit before leaving) arrives with the FranPOS booking feed.
        </p>
      </Card>

      {/* Customer intelligence */}
      <section className="mt-3">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <Micro>Customer intelligence</Micro>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Value, risk &amp; next action</h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">Avg LTV {fmtMoney(intel.avgLtv)} · all history</span>
        </div>

        <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge ${segCells.length === 5 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
          {segCells.map((s) => {
            const risk = s.segment === "At risk" || s.segment === "Lapsed";
            return (
              <div key={s.segment} className="bg-cell p-4">
                <Micro>{s.segment}</Micro>
                <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]" style={{ color: risk ? "#fe5100" : undefined }}>{s.count}</div>
              </div>
            );
          })}
        </div>

        <Card pad={false} className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                  {["Customer", "Store", "Visits", "Lifetime value", "Last visit", "Next action"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 font-normal ${i === 2 || i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c) => {
                  const risk = c.segment === "At risk" || c.segment === "Lapsed";
                  return (
                    <tr key={c.name} className="border-t border-edge transition-colors hover:bg-raise">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{c.name}</span>
                          <Tag tone={c.segment === "VIP" ? "good" : risk ? "orange" : "muted"}>{c.segment}</Tag>
                        </div>
                        <Micro className="mt-0.5">{c.pet}</Micro>
                      </td>
                      <td className="px-5 py-3.5 text-ink-dim">{c.store}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{c.visits}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(c.ltv)}</td>
                      <td className="px-5 py-3.5 font-mono" style={{ color: c.lastVisit > 60 ? "#fe5100" : "var(--color-ink-dim)" }}>{c.lastVisit}d ago</td>
                      <td className="px-5 py-3.5 text-ink-dim">{c.next}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-2.5 text-[11.5px] leading-[1.5] text-ink-dimmer">
          Customers without a name on file (incomplete FranPOS profiles, house accounts) are excluded from this list and the win-back queue — their revenue still counts everywhere else.
        </p>
      </section>

      <WinbackCard list={winback.list} winbackCount={winback.count} />
    </div>
  );
}

function Stat({ label, value, sub, accent, delta }: { label: string; value: string; sub: string; accent?: boolean; delta?: number | null }) {
  return (
    <div>
      <Micro>{label}</Micro>
      <div className={`mt-2 flex items-baseline gap-2 text-[34px] font-medium leading-none tracking-[-0.02em] ${accent ? "text-orange" : "text-ink"}`}>
        {value}
        {delta != null && <Delta value={delta} />}
      </div>
      <div className="mt-1.5 text-[12.5px] text-ink-dim">{sub}</div>
    </div>
  );
}
