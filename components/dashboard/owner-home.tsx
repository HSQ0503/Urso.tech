import Link from "next/link";
import type { CSSProperties } from "react";
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
  getOwnerRevenue,
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
import { CountUp } from "@/components/dashboard/count-up";
import { getI18n } from "@/lib/i18n.server";

export async function OwnerHome({ searchParams, userName, streak }: { searchParams: Promise<{ store?: string; month?: string }>; userName: string; streak: number }) {
  const { t } = await getI18n();
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const monthScoped = month !== "all";
  const periodLabel = monthScoped ? monthLabel(month) : "Last 12 months";

  const [m, cs, ws, series, action, cards, deltas, rev] = await Promise.all([
    getMetrics(scope, month),
    getCallStats(scope, month),
    getWebStats(scope, month),
    getSeries(scope, month),
    getTopAction(scope, month),
    storeComparison(month),
    getKpiDeltas(scope, month),
    getOwnerRevenue(scope, month),
  ]);
  const labels = series.labels;
  // Books-basis delta when the whole window is closed books; register
  // like-for-like otherwise — never a books number against a register one.
  const revDelta = rev.source === "books" ? rev.delta : deltas.revenue;

  // The single metric with the strongest positive move — surfaced in orange as a
  // "win". Real data only: when nothing actually improved, nothing is shown.
  const WIN_LABELS: Record<string, string> = {
    revenue: "Revenue",
    bookings: "Bookings",
    avgTicket: "Avg visit",
    rebook: "Return rate",
    attach: "Retail attach",
    groomingShare: "Grooming share",
  };
  const winner = (
    [
      { key: "revenue", d: deltas.revenue },
      { key: "bookings", d: deltas.bookings },
      { key: "avgTicket", d: deltas.avgTicket },
      { key: "rebook", d: deltas.rebook },
      { key: "attach", d: deltas.attach },
      { key: "groomingShare", d: deltas.groomingShare },
    ] as { key: string; d: number | null }[]
  )
    .filter((k): k is { key: string; d: number } => k.d != null && k.d > 0)
    .sort((a, b) => b.d - a.d)[0];

  return (
    <div>
      <div className="dash-rise">
        <WelcomeBanner name={userName} streak={streak} />
        <PageHeader
          eyebrow={`${t("Overview")} · ${t(scopeLabel(scope))} · ${t(periodLabel)}`}
          title={t("Performance overview")}
        />
      </div>

      {winner && (
        <div className="dash-rise relative mt-3 inline-flex items-center gap-2.5 border-l-2 border-orange bg-orange-wash py-2 pl-3 pr-4" style={{ "--i": 1 } as CSSProperties}>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange">urso.ai</span>
          <span className="text-[13px] text-ink-dim">
            <span className="font-semibold text-orange">{t(WIN_LABELS[winner.key])} {t("up")} <CountUp value={winner.d} format="pct" className="tabular-nums" /></span> — {t("your strongest move this period.")}
          </span>
          {/* Win rule: the page's single dash-draw, arriving once the banner has settled. */}
          <span aria-hidden className="dash-draw absolute inset-x-0 bottom-0 h-px bg-orange" style={{ "--reveal-delay": "500ms" } as CSSProperties} />
        </div>
      )}

      {/* KPI row — revenue counts the owner's way (QuickBooks Total Income:
          register sales + tips + commission) once a month's books exist, and
          falls back to register sales for the still-open month. The other five
          are live FranPOS metrics with real period-over-period deltas (chips
          hide when no honest prior period exists). Calls answered and no-show
          join the row when Twilio / the booking feed go live. */}
      <section className="dash-raise dash-rise mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6" style={{ "--i": 2 } as CSSProperties}>
        <Kpi label={t("Revenue")} raw={rev.total} format="money" delta={revDelta} accent={winner?.key === "revenue"} />
        <Kpi label={t("Bookings")} raw={m.bookings} format="int" delta={deltas.bookings} accent={winner?.key === "bookings"} />
        <Kpi label={t("Avg visit")} raw={m.avgTicket} format="money" delta={deltas.avgTicket} accent={winner?.key === "avgTicket"} />
        <Kpi label={t("Return rate")} raw={m.rebook} format="pct" delta={deltas.rebook} accent={winner?.key === "rebook"} />
        <Kpi label={t("Retail attach")} raw={m.attach} format="pct" delta={deltas.attach} accent={winner?.key === "attach"} />
        <Kpi label={t("Grooming share")} raw={m.groomingShare} format="pct" delta={deltas.groomingShare} accent={winner?.key === "groomingShare"} />
      </section>

      {/* One action item + revenue */}
      <section className="dash-rise mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.25fr]" style={{ "--i": 3 } as CSSProperties}>
        <ActionItemCard
          eyebrow={t("Action item · what to fix first")}
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
                <Micro>{t("Revenue")}</Micro>
                <AskAi
                  topic={t("Revenue trend")}
                  topicId="revenueTrend"
                  suggestions={[
                    t("What's driving the revenue trend?"),
                    t("Which store moved the most recently?"),
                    t("How does this month compare to the same month last year?"),
                  ]}
                />
                <ChartInfo id="revenueTrend" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="text-[22px] font-bold tracking-[-0.01em] tabular-nums"><CountUp value={rev.total} format="money" /></span>
                {revDelta != null && <Delta value={revDelta} />}
                <span className="text-[12px] text-ink-dim">{t(periodLabel)}</span>
              </div>
            </div>
          </div>
          <AreaChart data={series.revenue} labels={labels} format="moneyK" height={224} />
        </Card>
      </section>

      {/* Calls + Traffic */}
      <section className="dash-rise mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2" style={{ "--i": 4 } as CSSProperties}>
        <Card className="dash-raise">
          <div className="mb-4 flex items-center gap-2">
            <Micro>{t("Inbound calls")}</Micro>
            <AskAi
              topic={t("Inbound call capture")}
              topicId="callsAnsweredMissed"
              pending
              suggestions={[t("What would call tracking tell me?"), t("What's measurable today instead?")]}
            />
            <ChartInfo id="callsAnsweredMissed" />
          </div>
          {cs.total === 0 ? (
            <EmptyFeed
              label={t("Coming online")}
              title={t("Call tracking goes live with Twilio")}
              detail={t("Once connected, you'll see answered vs missed calls each month — and the revenue behind every missed one.")}
              tag={t("Call tracking pending")}
              actionHref="/dashboard/actions"
              actionLabel={t("Set up call tracking")}
            />
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-[22px] font-bold tracking-[-0.01em] tabular-nums"><CountUp value={cs.total} format="int" /> <span className="text-[13px] text-ink-dim">{t("calls")}</span></div>
                <div className="text-right">
                  <div className="text-[20px] font-bold tabular-nums text-orange"><CountUp value={cs.missedPct} format="pct" /></div>
                  <Micro>{t("missed")}</Micro>
                </div>
              </div>
              <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
              <div className="mt-3">
                <Legend items={[{ label: t("Answered"), color: "var(--color-series)" }, { label: t("Missed"), color: "#fe5100" }]} />
              </div>
            </>
          )}
        </Card>

        <Card className="dash-raise">
          <div className="mb-4 flex items-center gap-2">
            <Micro>{t("Website traffic vs bookings")}</Micro>
            <AskAi
              topic={t("Website traffic vs bookings")}
              topicId="webTraffic"
              pending
              suggestions={[t("What would web tracking tell me?"), t("What's measurable today instead?")]}
            />
            <ChartInfo id="webTraffic" />
          </div>
          {ws.visits === 0 ? (
            <EmptyFeed
              label={t("Coming online")}
              title={t("Website analytics connect next")}
              detail={t("With analytics linked, you'll track visits, online bookings, and exactly where the booking funnel leaks.")}
              tag={t("Analytics pending")}
              actionHref="/dashboard/actions"
              actionLabel={t("Connect analytics")}
            />
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-[22px] font-bold tracking-[-0.01em] tabular-nums"><CountUp value={ws.visits} format="int" /> <span className="text-[13px] text-ink-dim">{t("visits")}</span></div>
                <div className="text-right">
                  <div className="text-[20px] font-bold tabular-nums text-orange"><CountUp value={ws.convRate} format="pct" /></div>
                  <Micro>{t("book online")}</Micro>
                </div>
              </div>
              <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
              <div className="mt-3">
                <Legend items={[{ label: t("Visits"), color: "var(--color-series)" }, { label: t("Became bookings"), color: "#fe5100" }]} />
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Store performance */}
      <section className="dash-rise mt-3" style={{ "--i": 5 } as CSSProperties}>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Micro>{t("By location")}</Micro>
            <h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.01em] text-ink">{t("Store performance")}</h2>
          </div>
          <Link href="/dashboard/stores" className="dash-press font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            {t("Compare")} →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s, i) => {
            const sm = cards[s.id];
            return (
              <Link key={s.id} href={`/dashboard/stores?store=${s.id}`} className="block">
                <Card interactive className="dash-raise flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[14.5px] text-ink">{s.name}</div>
                      <Micro className="mt-0.5">{t(s.tier)}</Micro>
                    </div>
                    <span className="font-mono text-[12px] text-ink-dim">{fmtMoney(sm.avgTicket)} {t("avg")}</span>
                  </div>
                  <div className="text-[27px] font-bold leading-none tracking-[-0.02em] tabular-nums"><CountUp value={sm.revenue} format="money" /></div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <Micro>{t("Return")}</Micro>
                      <span className="font-mono text-[11px] text-ink-dim">{pct(sm.rebook)}</span>
                    </div>
                    {/* Fills sweep left-to-right across the row as the section lands (~250ms in). */}
                    <Meter value={sm.rebook} color="var(--color-ink-dim)" delay={300 + i * 80} />
                  </div>
                  <div className="flex items-center justify-between border-t border-edge pt-3">
                    <Micro>{t("Retail attach")}</Micro>
                    <span className="font-mono text-[12px]" style={{ color: sm.attach < 0.15 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(sm.attach)}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Pending-feed empty state — a premium "coming online" moment (a faint warm
// bloom, what will appear here, and the one step that turns the feed on) rather
// than a dead chart at zero. Used until Twilio / web analytics go live.
function EmptyFeed({ label, title, detail, tag, actionHref, actionLabel }: { label: string; title: string; detail: string; tag: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="relative flex min-h-[176px] flex-col items-center justify-center overflow-hidden rounded-none px-6 py-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 70% at 50% 32%, var(--color-orange-wash), transparent 72%)" }}
      />
      <div aria-hidden className="dash-grain pointer-events-none absolute inset-0" />
      <Micro className="relative">{label}</Micro>
      <p className="relative mt-2 text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink">{title}</p>
      <p className="relative mt-2 max-w-[300px] text-[12.5px] leading-[1.5] text-ink-dim">{detail}</p>
      <div className="relative mt-4 flex items-center gap-3">
        <Tag tone="muted">{tag}</Tag>
        <Link href={actionHref} className="dash-press font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
          {actionLabel} →
        </Link>
      </div>
    </div>
  );
}

function Kpi({ label, raw, format, delta, deltaInvert, accent }: { label: string; raw: number; format: "money" | "pct" | "int"; delta: number | null; deltaInvert?: boolean; accent?: boolean }) {
  return (
    <div className="bg-cell p-4">
      <div className="flex items-center justify-between">
        <Micro>{label}</Micro>
        {delta != null && <Delta value={delta} invert={deltaInvert} />}
      </div>
      <div className={`mt-2.5 text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums ${accent ? "text-orange" : "text-ink"}`}>
        <CountUp value={raw} format={format} />
      </div>
    </div>
  );
}
