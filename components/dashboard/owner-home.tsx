import Link from "next/link";
import {
  stores,
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  getMetrics,
  getCallStats,
  getWebStats,
  getSeries,
  getTopAction,
  getKpiDeltas,
  storeComparison,
} from "@/components/dashboard/data.server";
import {
  Card,
  Micro,
  Tag,
  Delta,
  Meter,
  AreaChart,
  CallsBars,
  TrafficChart,
  Legend,
  WelcomeBanner,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ActionItemCard } from "@/components/dashboard/action-item-card";
import { ChartInfo } from "@/components/dashboard/chart-info";

export async function OwnerHome({ searchParams, userName, streak }: { searchParams: Promise<{ store?: string; month?: string }>; userName: string; streak: number }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const monthScoped = month !== "all";
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;
  const periodLabel = monthScoped ? monthLabel(month) : "Last 12 months";

  const [m, cs, ws, series, action, cards, deltas] = await Promise.all([
    getMetrics(scope, month),
    getCallStats(scope, month),
    getWebStats(scope, month),
    getSeries(scope, month),
    getTopAction(scope, month),
    storeComparison(month),
    getKpiDeltas(scope, month),
  ]);
  const labels = series.labels;

  return (
    <div className="animate-stage-in">
      <WelcomeBanner name={userName} streak={streak} />

      <header className="mb-7">
        <Micro>Overview · {scopeLabel(scope)} · {periodLabel}</Micro>
        <h1 className="mt-2.5 text-[clamp(26px,3.6vw,34px)] font-medium tracking-[-0.02em]">Performance overview</h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-ink-dim">
          Revenue, demand and conversion {scope === "all" ? "across all four locations" : `for ${scopeLabel(scope)}`}. Use the store and month filters in the top bar to change this view.
        </p>
      </header>

      {/* KPI row — all six are live FranPOS metrics with real period-over-period
          deltas (chips hide when no honest prior period exists). Calls answered
          and no-show join the row when Twilio / the booking feed go live. */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue" value={fmtMoney(m.revenue)} delta={deltas.revenue} />
        <Kpi label="Bookings" value={m.bookings.toLocaleString()} delta={deltas.bookings} />
        <Kpi label="Avg visit" value={fmtMoney(m.avgTicket)} delta={deltas.avgTicket} />
        <Kpi label="Return rate" value={pct(m.rebook)} delta={deltas.rebook} />
        <Kpi label="Retail attach" value={pct(m.attach)} delta={deltas.attach} />
        <Kpi label="Grooming share" value={pct(m.groomingShare)} delta={deltas.groomingShare} />
      </section>

      {/* One action item + revenue */}
      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.25fr]">
        <ActionItemCard
          eyebrow="Action item · what to fix first"
          title={action.title}
          detail={action.detail}
          metric={action.metric}
          pending={action.pending}
          planKey={action.planKey}
        />

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Micro>Revenue</Micro>
                <AskAi
                  topic="Revenue trend"
                  read={`Revenue ${here} is ${fmtMoney(m.revenue)} over ${monthScoped ? monthLabel(month) : "the last 12 months"}, trending up. This is measured directly from FranPOS, so it's solid ground.`}
                  points={[
                    "Grooming drives roughly two-thirds of revenue — it's recurring, so retention compounds it.",
                    "The fastest growth here is recovering demand you already pay for: missed calls and online drop-off.",
                  ]}
                  recommendation="Don't chase more traffic yet — close the call-capture and rebooking leaks first. They convert demand you already have."
                />
                <ChartInfo id="revenueTrend" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="text-[22px] font-medium tracking-[-0.01em]">{fmtMoney(m.revenue)}</span>
                {deltas.revenue != null && <Delta value={deltas.revenue} />}
                <span className="text-[12px] text-ink-dim">{periodLabel}</span>
              </div>
            </div>
          </div>
          <AreaChart data={series.revenue} labels={labels} format="moneyK" height={224} />
        </Card>
      </section>

      {/* Calls + Traffic */}
      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Micro>Inbound calls</Micro>
                <AskAi
                  topic="Inbound call capture"
                  pending
                  read={`${pct(cs.missedPct)} of inbound calls ${here} go unanswered — ${cs.missed.toLocaleString()} of ${cs.total.toLocaleString()}. The misses cluster after closing, when no one is at the desk.`}
                  points={["An unanswered call is usually a booking that goes to a competitor.", "Call tracking isn't live yet — this is shaped like the Twilio feed."]}
                  recommendation="Stand up the Twilio missed-call line so every unanswered call gets an instant text-back with a booking link."
                />
                <ChartInfo id="callsAnsweredMissed" />
              </div>
              <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-[13px] text-ink-dim">calls</span></div>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-medium text-orange">{pct(cs.missedPct)}</div>
              <Micro>missed</Micro>
            </div>
          </div>
          <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
          <div className="mt-3 flex items-center justify-between">
            <Legend items={[{ label: "Answered", color: "var(--color-series)" }, { label: "Missed", color: "#fe5100" }]} />
            <Tag tone="muted">Call tracking pending</Tag>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Micro>Website traffic vs bookings</Micro>
                <AskAi
                  topic="Website traffic vs bookings"
                  pending
                  read={`${ws.visits.toLocaleString()} people visited the site ${here} but only ${pct(ws.convRate, 1)} booked. The bars are visits; the line is how many became bookings — the gap between them is demand leaving without an appointment.`}
                  points={["Most of the drop happens inside the booking form itself.", "Web analytics aren't wired yet — shaped like the GA4 feed."]}
                  recommendation="Test a shorter, mobile-first booking form to recover the visitors abandoning mid-form."
                />
                <ChartInfo id="webTraffic" />
              </div>
              <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-[13px] text-ink-dim">visits</span></div>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-medium text-orange">{pct(ws.convRate, 1)}</div>
              <Micro>book online</Micro>
            </div>
          </div>
          <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <Legend items={[{ label: "Visits", color: "var(--color-series)" }, { label: "Became bookings", color: "#fe5100" }]} />
            <Tag tone="muted">Analytics pending</Tag>
          </div>
        </Card>
      </section>

      {/* Store performance */}
      <section className="mt-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Micro>By location</Micro>
            <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Store performance</h2>
          </div>
          <Link href="/dashboard/stores" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            Compare →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s) => {
            const sm = cards[s.id];
            return (
              <Card key={s.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14.5px] text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{s.tier}</Micro>
                  </div>
                  <span className="font-mono text-[12px] text-ink-dim">{fmtMoney(sm.avgTicket)} avg</span>
                </div>
                <div className="text-[27px] font-medium leading-none tracking-[-0.02em]">{fmtMoney(sm.revenue, true)}</div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Return</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(sm.rebook)}</span>
                  </div>
                  <Meter value={sm.rebook} />
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <Micro>Retail attach</Micro>
                  <span className="font-mono text-[12px]" style={{ color: sm.attach < 0.15 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(sm.attach)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, delta, deltaInvert }: { label: string; value: string; delta: number | null; deltaInvert?: boolean }) {
  return (
    <div className="bg-cell p-4">
      <div className="flex items-center justify-between">
        <Micro>{label}</Micro>
        {delta != null && <Delta value={delta} invert={deltaInvert} />}
      </div>
      <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]">{value}</div>
    </div>
  );
}
