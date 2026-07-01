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
  Micro,
  Tag,
  Delta,
  Meter,
  AreaChart,
  CallsBars,
  TrafficChart,
  Legend,
  StreakPill,
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
  const first = (userName ?? "there").split(" ")[0];

  // Carry the active store/month filter onto the in-page tab links.
  const qp = new URLSearchParams();
  if (sp.store) qp.set("store", sp.store);
  if (sp.month) qp.set("month", sp.month);
  const q = qp.toString() ? `?${qp.toString()}` : "";

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

  // The single metric with the strongest positive move — stated plainly in the
  // insight line. Real data only: when nothing actually improved, nothing shows.
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
    <div className="animate-stage-in space-y-4">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Micro>{t("Overview")} · {t(scopeLabel(scope))} · {t(periodLabel)}</Micro>
          <h1 className="mt-1.5 text-xl font-semibold leading-snug tracking-[-0.01em] text-ink">
            {t("Welcome back")}, {first}
          </h1>
        </div>
        <StreakPill streak={streak} t={t} />
      </header>

      {/* In-page tab links → the deeper views, filter preserved. */}
      <nav className="flex flex-wrap gap-1.5">
        <span className="rounded-lg bg-raise-strong px-3 py-1.5 text-sm font-medium text-ink">{t("Overview")}</span>
        <Link href={`/dashboard/revenue${q}`} className="rounded-lg px-3 py-1.5 text-sm text-ink-dim transition-colors duration-150 hover:bg-raise hover:text-ink">{t("Revenue map")}</Link>
        <Link href={`/dashboard/compare${q}`} className="rounded-lg px-3 py-1.5 text-sm text-ink-dim transition-colors duration-150 hover:bg-raise hover:text-ink">{t("Compare")}</Link>
      </nav>

      {winner && (
        <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-panel px-4 py-3">
          <span className="font-mono text-2xs uppercase tracking-[0.12em] text-orange">urso.ai</span>
          <span className="text-sm text-ink-dim">
            <span className="font-medium text-ink">{t(WIN_LABELS[winner.key])}</span>{" "}
            <span className="font-medium text-good">{t("up")} {pct(winner.d)}</span> — {t("your strongest move this period.")}
          </span>
        </div>
      )}

      {/* Hero row — revenue trend beside the "what to fix first" action item. */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="dash-raise rounded-xl border border-edge bg-panel p-5">
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
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-semibold leading-none tracking-[-0.01em] tabular-nums text-ink">
              <CountUp value={m.revenue} format="money" />
            </span>
            {deltas.revenue != null && <Delta value={deltas.revenue} />}
          </div>
          <div className="mt-1.5 text-xs text-ink-dim">{t(periodLabel)}</div>
          <div className="mt-5">
            <AreaChart data={series.revenue} labels={labels} format="moneyK" height={240} />
          </div>
        </div>

        <ActionItemCard
          eyebrow={t("Action item · what to fix first")}
          title={action.title}
          detail={action.detail}
          metric={action.metric}
          pending={action.pending}
          planKey={action.planKey}
        />
      </section>

      {/* KPI row — all six live FranPOS metrics with period-over-period deltas
          (chips hide when no honest prior period exists). */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t("Revenue")} raw={m.revenue} format="money" delta={deltas.revenue} />
        <Kpi label={t("Bookings")} raw={m.bookings} format="int" delta={deltas.bookings} />
        <Kpi label={t("Avg visit")} raw={m.avgTicket} format="money" delta={deltas.avgTicket} />
        <Kpi label={t("Return rate")} raw={m.rebook} format="pct" delta={deltas.rebook} />
        <Kpi label={t("Retail attach")} raw={m.attach} format="pct" delta={deltas.attach} />
        <Kpi label={t("Grooming share")} raw={m.groomingShare} format="pct" delta={deltas.groomingShare} />
      </section>

      {/* Calls + Traffic */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="dash-raise rounded-xl border border-edge bg-panel p-5">
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
              title={t("Call tracking goes live with Twilio")}
              detail={t("Once connected, you'll see answered vs missed calls each month — and the revenue behind every missed one.")}
              tag={t("Call tracking pending")}
            />
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-xl font-semibold tabular-nums tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-sm font-normal text-ink-dim">{t("calls")}</span></div>
                <div className="text-right">
                  <div className="text-xl font-semibold tabular-nums text-ink">{pct(cs.missedPct)}</div>
                  <Micro>{t("missed")}</Micro>
                </div>
              </div>
              <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
              <div className="mt-3">
                <Legend items={[{ label: t("Answered"), color: "var(--color-series)" }, { label: t("Missed"), color: "var(--color-bad)" }]} />
              </div>
            </>
          )}
        </div>

        <div className="dash-raise rounded-xl border border-edge bg-panel p-5">
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
              title={t("Website analytics connect next")}
              detail={t("With analytics linked, you'll track visits, online bookings, and exactly where the booking funnel leaks.")}
              tag={t("Analytics pending")}
            />
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-xl font-semibold tabular-nums tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-sm font-normal text-ink-dim">{t("visits")}</span></div>
                <div className="text-right">
                  <div className="text-xl font-semibold tabular-nums text-ink">{pct(ws.convRate, 1)}</div>
                  <Micro>{t("book online")}</Micro>
                </div>
              </div>
              <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
              <div className="mt-3">
                <Legend items={[{ label: t("Visits"), color: "var(--color-series)" }, { label: t("Became bookings"), color: "var(--color-orange)" }]} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Store performance */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <Micro>{t("By location")}</Micro>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-ink">{t("Store performance")}</h2>
          </div>
          <Link href="/dashboard/stores" className="font-mono text-2xs uppercase tracking-[0.1em] text-ink-dim transition-colors duration-150 hover:text-ink">
            {t("Compare")} →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s) => {
            const sm = cards[s.id];
            return (
              <div key={s.id} className="dash-raise flex flex-col gap-4 rounded-xl border border-edge bg-panel p-4 transition-colors duration-150 hover:border-edge-strong">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{t(s.tier)}</Micro>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-ink-dim">{fmtMoney(sm.avgTicket)} {t("avg")}</span>
                </div>
                <div className="text-2xl font-semibold leading-none tracking-[-0.01em] tabular-nums"><CountUp value={sm.revenue} format="money" /></div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>{t("Return")}</Micro>
                    <span className="font-mono text-xs tabular-nums text-ink-dim">{pct(sm.rebook)}</span>
                  </div>
                  <Meter value={sm.rebook} color="var(--color-ink-dim)" />
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <Micro>{t("Retail attach")}</Micro>
                  <span className="font-mono text-xs tabular-nums" style={{ color: sm.attach < 0.15 ? "var(--color-bad)" : "var(--color-ink-dim)" }}>{pct(sm.attach)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Pending-feed empty state — quiet and structural: what's coming, why it
// matters, one status tag. Used until Twilio / web analytics go live.
function EmptyFeed({ title, detail, tag }: { title: string; detail: string; tag: string }) {
  return (
    <div className="flex min-h-[176px] flex-col items-center justify-center rounded-lg border border-dashed border-edge-strong px-6 py-8 text-center">
      <p className="text-sm font-medium leading-snug text-ink">{title}</p>
      <p className="mt-1.5 max-w-[300px] text-xs leading-relaxed text-ink-dim">{detail}</p>
      <div className="mt-3.5">
        <Tag tone="muted">{tag}</Tag>
      </div>
    </div>
  );
}

function Kpi({ label, raw, format, delta, deltaInvert }: { label: string; raw: number; format: "money" | "pct" | "int"; delta: number | null; deltaInvert?: boolean }) {
  return (
    <div className="dash-raise rounded-xl border border-edge bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <Micro>{label}</Micro>
        {delta != null && <Delta value={delta} invert={deltaInvert} />}
      </div>
      <div className="mt-3 text-xl font-semibold leading-none tracking-[-0.01em] tabular-nums text-ink">
        <CountUp value={raw} format={format} />
      </div>
    </div>
  );
}
