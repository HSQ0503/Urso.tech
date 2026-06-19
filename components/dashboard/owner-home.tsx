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
  PageHeader,
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
    <div>
      <div className="animate-stage-in">
        <WelcomeBanner name={userName} streak={streak} />
        <PageHeader
          eyebrow={`Overview · ${scopeLabel(scope)} · ${periodLabel}`}
          title="Performance overview"
          sub={`Revenue, demand and conversion ${scope === "all" ? "across all four locations" : `for ${scopeLabel(scope)}`}. Use the store and month filters in the top bar to change this view.`}
        />
      </div>

      {/* KPI row — all six are live FranPOS metrics with real period-over-period
          deltas (chips hide when no honest prior period exists). Calls answered
          and no-show join the row when Twilio / the booking feed go live. */}
      <section className="dash-raise mt-2 grid animate-stage-in grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6" style={{ animationDelay: "50ms" }}>
        <Kpi label="Revenue" value={fmtMoney(m.revenue)} delta={deltas.revenue} />
        <Kpi label="Bookings" value={m.bookings.toLocaleString()} delta={deltas.bookings} />
        <Kpi label="Avg visit" value={fmtMoney(m.avgTicket)} delta={deltas.avgTicket} />
        <Kpi label="Return rate" value={pct(m.rebook)} delta={deltas.rebook} />
        <Kpi label="Retail attach" value={pct(m.attach)} delta={deltas.attach} />
        <Kpi label="Grooming share" value={pct(m.groomingShare)} delta={deltas.groomingShare} />
      </section>

      {/* One action item + revenue */}
      <section className="mt-3 grid animate-stage-in grid-cols-1 gap-3 lg:grid-cols-[1fr_1.25fr]" style={{ animationDelay: "110ms" }}>
        <ActionItemCard
          eyebrow="Action item · what to fix first"
          title={action.title}
          detail={action.detail}
          metric={action.metric}
          pending={action.pending}
          planKey={action.planKey}
        />

        <Card className="dash-raise">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Micro>Revenue</Micro>
                <AskAi
                  topic="Revenue trend"
                  topicId="revenueTrend"
                  suggestions={[
                    "What's driving the revenue trend?",
                    "Which store moved the most recently?",
                    "How does this month compare to the same month last year?",
                  ]}
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
      <section className="mt-3 grid animate-stage-in grid-cols-1 gap-3 xl:grid-cols-2" style={{ animationDelay: "170ms" }}>
        <Card className="dash-raise">
          <div className="mb-4 flex items-center gap-2">
            <Micro>Inbound calls</Micro>
            <AskAi
              topic="Inbound call capture"
              topicId="callsAnsweredMissed"
              pending
              suggestions={["What would call tracking tell me?", "What's measurable today instead?"]}
            />
            <ChartInfo id="callsAnsweredMissed" />
          </div>
          {cs.total === 0 ? (
            <EmptyFeed
              title="Call tracking goes live with Twilio"
              detail="Once connected, you'll see answered vs missed calls each month — and the revenue behind every missed one."
              tag="Call tracking pending"
            />
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-[22px] font-medium tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-[13px] text-ink-dim">calls</span></div>
                <div className="text-right">
                  <div className="text-[20px] font-medium text-orange">{pct(cs.missedPct)}</div>
                  <Micro>missed</Micro>
                </div>
              </div>
              <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
              <div className="mt-3">
                <Legend items={[{ label: "Answered", color: "var(--color-series)" }, { label: "Missed", color: "#fe5100" }]} />
              </div>
            </>
          )}
        </Card>

        <Card className="dash-raise">
          <div className="mb-4 flex items-center gap-2">
            <Micro>Website traffic vs bookings</Micro>
            <AskAi
              topic="Website traffic vs bookings"
              topicId="webTraffic"
              pending
              suggestions={["What would web tracking tell me?", "What's measurable today instead?"]}
            />
            <ChartInfo id="webTraffic" />
          </div>
          {ws.visits === 0 ? (
            <EmptyFeed
              title="Website analytics connect next"
              detail="With analytics linked, you'll track visits, online bookings, and exactly where the booking funnel leaks."
              tag="Analytics pending"
            />
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-[22px] font-medium tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-[13px] text-ink-dim">visits</span></div>
                <div className="text-right">
                  <div className="text-[20px] font-medium text-orange">{pct(ws.convRate, 1)}</div>
                  <Micro>book online</Micro>
                </div>
              </div>
              <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
              <div className="mt-3">
                <Legend items={[{ label: "Visits", color: "var(--color-series)" }, { label: "Became bookings", color: "#fe5100" }]} />
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Store performance */}
      <section className="mt-3 animate-stage-in" style={{ animationDelay: "230ms" }}>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Micro>By location</Micro>
            <h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.01em] text-ink">Store performance</h2>
          </div>
          <Link href="/dashboard/stores" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            Compare →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s) => {
            const sm = cards[s.id];
            return (
              <Card key={s.id} className="dash-raise flex flex-col gap-4 transition-all duration-200 hover:-translate-y-px">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14.5px] text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{s.tier}</Micro>
                  </div>
                  <span className="font-mono text-[12px] text-ink-dim">{fmtMoney(sm.avgTicket)} avg</span>
                </div>
                <div className="text-[27px] font-medium leading-none tracking-[-0.02em]">{fmtMoney(sm.revenue)}</div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Return</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(sm.rebook)}</span>
                  </div>
                  <Meter value={sm.rebook} color="var(--color-ink-dim)" />
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

// Pending-feed empty state — a premium "coming online" moment (serif line + a
// faint warm bloom) rather than a dead chart at zero. Used until Twilio / web
// analytics go live.
function EmptyFeed({ title, detail, tag }: { title: string; detail: string; tag: string }) {
  return (
    <div className="relative flex min-h-[176px] flex-col items-center justify-center overflow-hidden rounded-none px-6 py-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 70% at 50% 32%, var(--color-orange-wash), transparent 72%)" }}
      />
      <div aria-hidden className="dash-grain pointer-events-none absolute inset-0" />
      <p className="relative text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink">{title}</p>
      <p className="relative mt-2 max-w-[300px] text-[12.5px] leading-[1.5] text-ink-dim">{detail}</p>
      <div className="relative mt-4">
        <Tag tone="muted">{tag}</Tag>
      </div>
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
