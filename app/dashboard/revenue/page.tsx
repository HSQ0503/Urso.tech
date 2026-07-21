import type { CSSProperties } from "react";
import {
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  getMetrics,
  getCrossSell,
  getOwnerRevenue,
  getRevenueByLocation,
  getRevenueByService,
  getRevenueByGroomer,
  getRevenueNewVsRepeat,
} from "@/components/dashboard/data.server";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  BarRanking,
  StackedShareBar,
  EmptyState,
  fmtMoney,
} from "@/components/dashboard/ui";
import { CountUp, type CountFormat } from "@/components/dashboard/count-up";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { getI18n } from "@/lib/i18n.server";
import type { T } from "@/lib/i18n";

export default async function RevenueMapPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  const m = await getMetrics(scope, month);
  const rev = await getOwnerRevenue(scope, month);
  // Rankings arrive sorted desc — crown the leader when no store is scoped so
  // each ranking carries exactly one orange win.
  const byLocation = (await getRevenueByLocation(month)).map((r, i) => ({ name: r.name.replace("Village", "").trim(), value: r.value, highlight: scope === "all" ? i === 0 : scope === r.id }));
  const byService = await getRevenueByService(scope, month);
  const byGroomer = (await getRevenueByGroomer(scope, month)).slice(0, 6).map((g, i) => ({ name: g.name, value: g.value, highlight: i === 0 }));
  const nvr = await getRevenueNewVsRepeat(scope, month);
  const xs = await getCrossSell(scope, month);
  const repeatShare = nvr.repeat / (nvr.repeat + nvr.fresh);

  return (
    <div className="space-y-3">
      <div className="dash-rise" style={{ "--i": 0 } as CSSProperties}>
        <PageHeader
          eyebrow={`${t("Revenue map")} · ${scopeLabel(scope)} · ${period}`}
          title={t("Where the money comes from")}
        />
      </div>

      {/* Headline strip */}
      <section className="dash-rise grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-4" style={{ "--i": 1 } as CSSProperties}>
        <Kpi label={t("Total revenue")} raw={rev.total} format="money" />
        <Kpi label={t("Avg ticket")} raw={m.avgTicket} format="money" />
        <Kpi label={t("Buy both")} raw={xs.both} format="pct" />
        <Kpi label={t("Repeat revenue")} raw={repeatShare} format="pct" />
      </section>

      {/* How the owner's number adds up — QuickBooks Total Income. Hidden while
          the window has no closed books yet (register-only fallback). */}
      {rev.source !== "register" && (
        <section className="dash-rise flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-none border border-edge bg-panel px-4 py-3" style={{ "--i": 1.5 } as CSSProperties}>
          <Micro>{t("How the total adds up")}</Micro>
          <span className="text-[13px] text-ink-dim">{t("Sales")} <span className="font-semibold text-ink tabular-nums">{fmtMoney(rev.sales)}</span></span>
          <span className="text-[13px] text-ink-dim">{t("Tips (paid out to groomers)")} <span className="font-semibold text-ink tabular-nums">{fmtMoney(rev.tips)}</span></span>
          <span className="text-[13px] text-ink-dim">{t("Other income")} <span className="font-semibold text-ink tabular-nums">{fmtMoney(rev.otherIncome)}</span></span>
          {rev.openRegister > 0 && (
            <span className="text-[13px] text-ink-dim">{t("This month so far (register)")} <span className="font-semibold text-ink tabular-nums">{fmtMoney(rev.openRegister)}</span></span>
          )}
          <span className="text-[12px] text-ink-dimmer">{t("Counted the way the books count it — QuickBooks Total Income. Register sales for the same period:")} {fmtMoney(rev.registerSales)}</span>
        </section>
      )}

      {/* Location + line */}
      <section className="dash-rise grid grid-cols-1 gap-3 lg:grid-cols-2" style={{ "--i": 2 } as CSSProperties}>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>{t("By location")}</Micro>
            <AskAi
              topic={t("Revenue by store")}
              topicId="revenueByLocation"
              suggestions={[t("Why is one store ahead on revenue?"), t("Where is the biggest revenue gap?")]}
            />
            <ChartInfo id="revenueByLocation" />
          </div>
          <h2 className="mb-4 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">{t("Revenue by store")}</h2>
          {byLocation.length === 0 ? (
            <NoRevenue t={t} />
          ) : (
            <BarRanking data={byLocation} format="moneyK" labelWidth={104} valueLabel={t("Revenue")} />
          )}
        </Card>
        <Card className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-1.5">
              <Micro>{t("By line · customer overlap")}</Micro>
              <AskAi
                topic={t("Grooming vs retail overlap")}
                topicId="crossSellMix"
                suggestions={[t("How do I move grooming-only into both?"), t("What's the cross-sell wall costing me?")]}
              />
              <ChartInfo id="crossSellMix" />
            </div>
            <h2 className="mb-4 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">{t("Grooming vs retail")}</h2>
            <StackedShareBar
              segments={[
                { label: t("Both"), value: xs.both, color: "#fe5100" },
                { label: t("Grooming only"), value: xs.groomingOnly, color: "var(--color-series)" },
                { label: t("Retail only"), value: xs.retailOnly, color: "var(--color-series-soft)" },
              ]}
            />
          </div>
          <div className="border-t border-edge pt-5">
            <div className="mb-3 flex items-center gap-1.5">
              <Micro>{t("New vs repeat revenue")}</Micro>
              <AskAi
                topic={t("New vs repeat revenue")}
                topicId="newVsRepeat"
                suggestions={[t("Is growth from new customers or repeats?"), t("How much revenue is walk-in?")]}
              />
              <ChartInfo id="newVsRepeat" />
            </div>
            <StackedShareBar
              segments={[
                { label: t("Repeat customers"), value: nvr.repeat, color: "#fe5100" },
                { label: t("New customers"), value: nvr.fresh, color: "var(--color-series)" },
                { label: t("Walk-in (no profile)"), value: nvr.walkIn, color: "var(--color-series-soft)" },
              ]}
            />
          </div>
        </Card>
      </section>

      {/* Service + groomer */}
      <section className="dash-rise grid grid-cols-1 gap-3 lg:grid-cols-2" style={{ "--i": 3 } as CSSProperties}>
        <Card>
          <Micro>{t("By service")}</Micro>
          <h2 className="mb-4 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">{t("Top revenue lines")}</h2>
          {byService.length === 0 ? (
            <NoRevenue t={t} />
          ) : (
            <div className="divide-y divide-edge">
              {byService.map((s) => (
                <div key={s.name} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13.5px] text-ink">{s.name}</span>
                    <Tag tone={s.line === "Grooming" ? "orange" : "muted"}>{t(s.line)}</Tag>
                  </div>
                  <span className="font-mono text-[13px] text-ink-dim">{fmtMoney(s.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>{t("By groomer")}</Micro>
            <AskAi
              topic={t("Service revenue by groomer")}
              topicId="revenueByGroomer"
              suggestions={[t("Who are the top groomers by revenue?"), t("Which groomers have capacity to grow?")]}
            />
            <ChartInfo id="revenueByGroomer" />
          </div>
          <h2 className="mb-4 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">{t("Service revenue performed")}</h2>
          {byGroomer.length === 0 ? (
            <NoRevenue t={t} />
          ) : (
            <BarRanking data={byGroomer} format="moneyK" labelWidth={130} valueLabel={t("Service revenue")} />
          )}
        </Card>
      </section>

      <p className="dash-rise mt-3 text-[13px] leading-[1.6] text-ink-dim" style={{ "--i": 4 } as CSSProperties}>
        {t("Retail attaches to grooming visits, so grooming share and retail attach move together. The clearest revenue lever is converting grooming-only customers into retail buyers at checkout.")}
      </p>
    </div>
  );
}

function Kpi({ label, raw, format }: { label: string; raw: number; format: CountFormat }) {
  return (
    <div className="bg-cell p-4">
      <Micro>{label}</Micro>
      <div className="mt-2.5 text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums">
        <CountUp value={raw} format={format} />
      </div>
    </div>
  );
}

// Live RPCs can return zero rows for a scoped store + month — say so instead of
// leaving a blank chart box.
function NoRevenue({ t }: { t: T }) {
  return (
    <EmptyState
      label={t("No revenue recorded")}
      title={t("Nothing booked for this selection")}
      body={t("No sales or appointments landed in this store and period. Widen the view to see where the money comes from.")}
      action={
        <a
          href="/dashboard/revenue"
          className="dash-pill inline-flex items-center rounded-none px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-ink"
        >
          {t("View all stores · full period")}
        </a>
      }
    />
  );
}
