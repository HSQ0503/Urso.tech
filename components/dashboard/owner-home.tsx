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
    <div className="space-y-5">
      {/* Greeting — the Origin "Good afternoon" headline, in Urso's serif. */}
      <header className="flex flex-wrap items-end justify-between gap-4 animate-stage-in">
        <div className="min-w-0">
          <Micro>{t("Overview")} · {t(scopeLabel(scope))} · {t(periodLabel)}</Micro>
          <h1 className="mt-2.5 font-serif text-[clamp(28px,4vw,40px)] font-medium leading-[1.04] tracking-[-0.02em] text-ink">
            {t("Welcome back")}, {first}<span className="text-orange">.</span>
          </h1>
        </div>
        <StreakPill streak={streak} t={t} />
      </header>

      {/* In-page tab links → the deeper views, filter preserved. */}
      <nav className="flex flex-wrap gap-2 animate-stage-in" style={{ animationDelay: "40ms" }}>
        <span className="rounded-lg bg-raise-strong px-4 py-2 text-[14px] text-ink">{t("Overview")}</span>
        <Link href={`/dashboard/revenue${q}`} className="rounded-lg px-4 py-2 text-[14px] text-ink-dim transition-colors hover:bg-raise hover:text-ink">{t("Revenue map")}</Link>
        <Link href={`/dashboard/compare${q}`} className="rounded-lg px-4 py-2 text-[14px] text-ink-dim transition-colors hover:bg-raise hover:text-ink">{t("Compare")}</Link>
      </nav>

      {winner && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[rgba(254,81,0,0.25)] bg-orange-wash px-4 py-3 animate-stage-in" style={{ animationDelay: "70ms" }}>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange">urso.ai</span>
          <span className="text-[13px] text-ink-dim">
            <span className="font-semibold text-orange">{t(WIN_LABELS[winner.key])} {t("up")} {pct(winner.d)}</span> — {t("your strongest move this period.")}
          </span>
        </div>
      )}

      {/* Hero row — the revenue chart (Origin's net-worth card) beside the
          "what to fix first" action item (the rail card). */}
      <section className="grid grid-cols-1 gap-5 animate-stage-in lg:grid-cols-[1.5fr_1fr]" style={{ animationDelay: "110ms" }}>
        <div className="dash-raise rounded-3xl border border-edge bg-panel p-6 md:p-7">
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
            <span className="text-[clamp(34px,5vw,46px)] font-medium leading-none tracking-[-0.03em] tabular-nums text-ink">
              <CountUp value={m.revenue} format="money" />
            </span>
            {deltas.revenue != null && <Delta value={deltas.revenue} />}
          </div>
          <div className="mt-1.5 text-[13px] text-ink-dim">{t(periodLabel)}</div>
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
      <section className="grid grid-cols-2 gap-3 animate-stage-in md:grid-cols-3 xl:grid-cols-6" style={{ animationDelay: "170ms" }}>
        <Kpi label={t("Revenue")} raw={m.revenue} format="money" delta={deltas.revenue} accent={winner?.key === "revenue"} />
        <Kpi label={t("Bookings")} raw={m.bookings} format="int" delta={deltas.bookings} accent={winner?.key === "bookings"} />
        <Kpi label={t("Avg visit")} raw={m.avgTicket} format="money" delta={deltas.avgTicket} accent={winner?.key === "avgTicket"} />
        <Kpi label={t("Return rate")} raw={m.rebook} format="pct" delta={deltas.rebook} accent={winner?.key === "rebook"} />
        <Kpi label={t("Retail attach")} raw={m.attach} format="pct" delta={deltas.attach} accent={winner?.key === "attach"} />
        <Kpi label={t("Grooming share")} raw={m.groomingShare} format="pct" delta={deltas.groomingShare} accent={winner?.key === "groomingShare"} />
      </section>

      {/* Calls + Traffic */}
      <section className="grid grid-cols-1 gap-5 animate-stage-in xl:grid-cols-2" style={{ animationDelay: "230ms" }}>
        <div className="dash-raise rounded-3xl border border-edge bg-panel p-6">
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
                <div className="text-[22px] font-semibold tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-[13px] font-normal text-ink-dim">{t("calls")}</span></div>
                <div className="text-right">
                  <div className="text-[20px] font-semibold text-orange">{pct(cs.missedPct)}</div>
                  <Micro>{t("missed")}</Micro>
                </div>
              </div>
              <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
              <div className="mt-3">
                <Legend items={[{ label: t("Answered"), color: "var(--color-series)" }, { label: t("Missed"), color: "#fe5100" }]} />
              </div>
            </>
          )}
        </div>

        <div className="dash-raise rounded-3xl border border-edge bg-panel p-6">
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
                <div className="text-[22px] font-semibold tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-[13px] font-normal text-ink-dim">{t("visits")}</span></div>
                <div className="text-right">
                  <div className="text-[20px] font-semibold text-orange">{pct(ws.convRate, 1)}</div>
                  <Micro>{t("book online")}</Micro>
                </div>
              </div>
              <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
              <div className="mt-3">
                <Legend items={[{ label: t("Visits"), color: "var(--color-series)" }, { label: t("Became bookings"), color: "#fe5100" }]} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Store performance */}
      <section className="animate-stage-in" style={{ animationDelay: "290ms" }}>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Micro>{t("By location")}</Micro>
            <h2 className="mt-1.5 font-serif text-[20px] font-medium tracking-[-0.01em] text-ink">{t("Store performance")}</h2>
          </div>
          <Link href="/dashboard/stores" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            {t("Compare")} →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s) => {
            const sm = cards[s.id];
            return (
              <div key={s.id} className="dash-raise flex flex-col gap-4 rounded-2xl border border-edge bg-panel p-5 transition-all duration-200 hover:-translate-y-px">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14.5px] text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{t(s.tier)}</Micro>
                  </div>
                  <span className="font-mono text-[12px] text-ink-dim">{fmtMoney(sm.avgTicket)} {t("avg")}</span>
                </div>
                <div className="text-[27px] font-semibold leading-none tracking-[-0.02em] tabular-nums"><CountUp value={sm.revenue} format="money" /></div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>{t("Return")}</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(sm.rebook)}</span>
                  </div>
                  <Meter value={sm.rebook} color="var(--color-ink-dim)" />
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <Micro>{t("Retail attach")}</Micro>
                  <span className="font-mono text-[12px]" style={{ color: sm.attach < 0.15 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(sm.attach)}</span>
                </div>
              </div>
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
    <div className="relative flex min-h-[176px] flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 70% at 50% 32%, var(--color-orange-wash), transparent 72%)" }}
      />
      <div aria-hidden className="dash-grain pointer-events-none absolute inset-0" />
      <p className="relative font-serif text-[17px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">{title}</p>
      <p className="relative mt-2 max-w-[300px] text-[12.5px] leading-[1.5] text-ink-dim">{detail}</p>
      <div className="relative mt-4">
        <Tag tone="muted">{tag}</Tag>
      </div>
    </div>
  );
}

function Kpi({ label, raw, format, delta, deltaInvert, accent }: { label: string; raw: number; format: "money" | "pct" | "int"; delta: number | null; deltaInvert?: boolean; accent?: boolean }) {
  return (
    <div className="dash-raise rounded-2xl border border-edge bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <Micro>{label}</Micro>
        {delta != null && <Delta value={delta} invert={deltaInvert} />}
      </div>
      <div className={`mt-3 text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${accent ? "text-orange" : "text-ink"}`}>
        <CountUp value={raw} format={format} />
      </div>
    </div>
  );
}
