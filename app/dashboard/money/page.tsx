import {
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  getMoneyOverview,
  getProfitDeltas,
  getProfitWaterfall,
  getCostBreakdown,
  getMarginTrend,
  getCostBenchmark,
  getConsolidatedPnl,
  getProfitPerBooking,
  getServiceLineMargin,
  getBreakeven,
} from "@/components/dashboard/data.server";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  Delta,
  EmptyState,
  ProfitWaterfall,
  MoneyTrend,
  CostBars,
  CostBenchmark,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { CountUp, type CountFormat } from "@/components/dashboard/count-up";
import { AskAi } from "@/components/dashboard/ask-ai";
import { getI18n } from "@/lib/i18n.server";
import Link from "next/link";
import type { CSSProperties } from "react";

const rise = (i: number) => ({ "--i": i } as CSSProperties);

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? t("Last 12 months") : monthLabel(month);

  const [overview, deltas, waterfall, costs, trend, benchmark, consolidated, ppb, serviceMargin, breakeven] = await Promise.all([
    getMoneyOverview(scope, month),
    getProfitDeltas(scope, month),
    getProfitWaterfall(scope, month),
    getCostBreakdown(scope, month),
    getMarginTrend(scope),
    getCostBenchmark(month),
    getConsolidatedPnl(month),
    getProfitPerBooking(scope, month),
    getServiceLineMargin(scope, month),
    getBreakeven(scope, month),
  ]);

  const hasData = overview.revenue !== 0 || overview.expenses !== 0;
  const openSelected = overview.openMonth && /^\d{4}-\d{2}$/.test(month) && month === overview.openMonth;

  return (
    <div className="space-y-3">
      <div className="dash-rise" style={rise(0)}>
        <PageHeader
          eyebrow={`${t("Money")} · ${scopeLabel(scope)} · ${period}`}
          title={t("Profit & margins")}
          period
        />
      </div>

      {/* Honesty notices */}
      <div className="dash-rise flex flex-wrap items-center gap-2" style={rise(1)}>
        <Tag tone="muted">{t("QuickBooks · accrual")}</Tag>
        {openSelected && <Tag tone="warn">{t("Books not closed — provisional")}</Tag>}
        {!openSelected && overview.openMonth && <Tag tone="muted">{t("Current month excluded (books open)")}</Tag>}
        {overview.classedOnly && <Tag tone="muted">{t("Per-store P&L — excludes company-level unallocated costs")}</Tag>}
      </div>

      {!hasData ? (
        <div className="dash-rise" style={rise(2)}>
          <EmptyState
            label={`${t("Money")} · ${period}`}
            title={t("No QuickBooks data for this period.")}
            body={month !== "all" ? t("Books for this month may not be closed yet — the 12-month view covers every closed month.") : undefined}
            action={
              month !== "all" ? (
                <Link
                  href={`/dashboard/money?month=all${sp.store ? `&store=${sp.store}` : ""}`}
                  className="dash-pill inline-flex items-center rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-ink"
                >
                  {t("View last 12 months")}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <section className="dash-rise grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6" style={rise(2)}>
            <Kpi label={t("Revenue")} value={overview.revenue} format="money" delta={deltas.revenue} />
            <Kpi label={t("Gross margin")} value={overview.grossMargin} format="pct" />
            <Kpi
              label={t("Net profit")}
              value={overview.netIncome}
              format="money"
              delta={deltas.netIncome}
              tone={overview.netIncome >= 0 ? "good" : "bad"}
            />
            <Kpi
              label={t("Net margin")}
              value={overview.netMargin}
              format="pct"
              sub={deltas.netMargin != null ? `${deltas.netMargin >= 0 ? "+" : "−"}${Math.abs(deltas.netMargin * 100).toFixed(1)} ${t("pts")}` : undefined}
            />
            <Kpi label={t("Labor ratio")} value={overview.laborRatio} format="pct" sub={t("payroll ÷ revenue")} />
            <Kpi label={t("Profit / groom")} value={ppb.netPerBooking} format="money" sub={t("net ÷ bookings")} />
          </section>

          {/* Money trend with Revenue / Profit / Margin toggle */}
          <section className="dash-rise" style={rise(3)}>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Trend · all closed months")}</Micro>
                <AskAi
                  topic={t("Profit & margin trend")}
                  topicId="marginTrend"
                  suggestions={[t("Is profitability improving or eroding?"), t("Which months are the most profitable?")]}
                />
              </div>
              <h2 className="mb-3 text-[17px] font-medium tracking-[-0.01em]">{t("Revenue, profit & margin over time")}</h2>
              <MoneyTrend trend={trend} />
            </Card>
          </section>

          {/* Waterfall + cost-as-%-of-revenue */}
          <section className="dash-rise grid grid-cols-1 gap-3 lg:grid-cols-2" style={rise(4)}>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Where the money goes")}</Micro>
                <AskAi
                  topic={t("Profit waterfall")}
                  topicId="profitWaterfall"
                  suggestions={[t("What's my single biggest cost?"), t("What would lift net profit the most?")]}
                />
              </div>
              <h2 className="mb-2 text-[17px] font-medium tracking-[-0.01em]">{t("Revenue to net profit")}</h2>
              <ProfitWaterfall steps={waterfall} />
            </Card>
            <Card>
              <Micro>{t("Cost as % of revenue")}</Micro>
              <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Cost breakdown")}</h2>
              <CostBars lines={costs} />
            </Card>
          </section>

          {/* Cross-store cost benchmark ⭐ */}
          <section className="dash-rise" style={rise(5)}>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Cross-store benchmark · cost as % of revenue")}</Micro>
                <AskAi
                  topic={t("Cross-store cost benchmark")}
                  topicId="costBenchmark"
                  suggestions={[t("Which store has the worst cost problem?"), t("Why is one store less profitable than another?")]}
                />
              </div>
              <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Where each store's costs run high")}</h2>
              <CostBenchmark rows={benchmark} />
              <p className="mt-4 text-[12.5px] leading-[1.6] text-ink-dim">
                {t("Every cost is shown as a share of that store's own revenue, so stores of different sizes compare fairly. Hotter cells are higher — they point to the specific line dragging a store's margin.")}
              </p>
              {scope === "all" && consolidated.unallocated !== 0 && (
                <p className="mt-2 text-[12px] text-ink-dimmer">
                  {t("Note")}: {fmtMoney(Math.abs(consolidated.unallocated))} {t("of Windermere + Lakeside costs aren't tagged to a store in QuickBooks (kept in the consolidated total, not in either store above).")}
                </p>
              )}
            </Card>
          </section>

          {/* Owner P&L + per-store contribution */}
          <section className="dash-rise grid grid-cols-1 gap-3 lg:grid-cols-2" style={rise(6)}>
            <Card>
              <Micro>{scope === "all" ? t("Consolidated P&L") : t("Profit & loss")}</Micro>
              <h2 className="mb-3 text-[17px] font-medium tracking-[-0.01em]">{scope === "all" ? t("All stores, this period") : scopeLabel(scope)}</h2>
              <div className="divide-y divide-edge font-mono text-[13px]">
                <PnlRow label={t("Revenue")} value={fmtMoney(overview.revenue)} />
                <PnlRow label={t("− Cost of goods")} value={fmtMoney(overview.cogs)} dim />
                <PnlRow label={t("Gross profit")} value={fmtMoney(overview.grossProfit)} bold sub={pct(overview.grossMargin)} />
                <PnlRow label={t("− Operating expenses")} value={fmtMoney(overview.expenses)} dim />
                <PnlRow label={t("Net profit")} value={fmtMoney(overview.netIncome)} bold accent={overview.netIncome >= 0 ? "good" : "bad"} sub={pct(overview.netMargin)} />
              </div>
            </Card>
            <Card>
              <Micro>{t("Net margin by store")}</Micro>
              <h2 className="mb-3 text-[17px] font-medium tracking-[-0.01em]">{t("Who's carrying the profit")}</h2>
              <div className="divide-y divide-edge">
                {[...consolidated.perStore].sort((a, b) => b.netMargin - a.netMargin).map((s, i) => (
                  <Link
                    key={s.id}
                    href={`/dashboard/money?store=${s.id}&month=${month}`}
                    className="-mx-2 flex items-center justify-between px-2 py-2.5 transition-colors duration-150 hover:bg-raise"
                  >
                    <span className="flex items-center gap-2 text-[13.5px] text-ink">
                      {s.name}
                      {i === 0 && s.netMargin > 0 && <Tag tone="good">{t("Top")}</Tag>}
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[12px] text-ink-dim">{fmtMoney(s.netIncome)}</span>
                      <span className="w-14 text-right font-mono text-[13px] tabular-nums" style={{ color: s.netMargin >= 0 ? "var(--color-good)" : "var(--color-orange)" }}>
                        {pct(s.netMargin)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </section>

          {/* Service-line margin + break-even */}
          <section className="dash-rise grid grid-cols-1 gap-3 lg:grid-cols-2" style={rise(7)}>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("True margin by service line")}</Micro>
                <AskAi
                  topic={t("Grooming vs retail margin")}
                  topicId="serviceMargin"
                  suggestions={[t("Is grooming or retail more profitable?"), t("Does retail attach help or hurt margin?")]}
                />
              </div>
              <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("Grooming vs retail")}</h2>
              <div className="grid grid-cols-2 gap-3">
                {serviceMargin.map((s) => (
                  <div key={s.line} className="border border-edge bg-cell p-4">
                    <div className="flex items-center justify-between">
                      <Micro>{t(s.line)}</Micro>
                      <span className="font-mono text-[15px] font-semibold text-orange">{pct(s.marginPct)}</span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-[11.5px]">
                      <div className="flex justify-between"><span className="text-ink-dimmer">{t("Revenue")}</span><span className="font-mono text-ink-dim">{fmtMoney(s.revenue)}</span></div>
                      <div className="flex justify-between"><span className="text-ink-dimmer">{t("Cost of goods")}</span><span className="font-mono text-ink-dim">{fmtMoney(s.cogs)}</span></div>
                      <div className="flex justify-between"><span className="text-ink-dimmer">{t("Gross profit")}</span><span className="font-mono text-ink">{fmtMoney(s.grossProfit)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12px] leading-[1.6] text-ink-dim">
                {t("Gross margin only — service-line operating costs aren't split in QuickBooks. Retail is higher-margin at the register, so attach lifts both revenue and blended margin.")}
              </p>
            </Card>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Break-even · per month")}</Micro>
                <AskAi
                  topic={t("Break-even")}
                  topicId="breakeven"
                  suggestions={[t("How many more grooms to break even?"), t("What's my contribution margin?")]}
                />
              </div>
              <h2 className="mb-4 text-[17px] font-medium tracking-[-0.01em]">{t("What it takes to profit")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <Stat label={t("Break-even revenue")} value={breakeven.breakevenRevenue == null ? "—" : fmtMoney(breakeven.breakevenRevenue)} />
                <Stat label={t("Monthly revenue")} value={fmtMoney(breakeven.monthlyRevenue)} />
                <Stat label={t("Contribution margin")} value={pct(breakeven.contributionMargin)} />
                <Stat label={t("Fixed costs / mo")} value={fmtMoney(breakeven.fixedMonthly)} />
              </div>
              <div className="relative mt-4 border-t border-edge pt-4">
                {/* The page's one win moment — a green hairline draws itself over the divider. */}
                {breakeven.bookingsToBreakeven != null && breakeven.bookingsToBreakeven <= 0 && (
                  <div
                    aria-hidden
                    className="dash-draw absolute inset-x-0 -top-px h-px"
                    style={{ background: "color-mix(in srgb, var(--color-good) 55%, transparent)" }}
                  />
                )}
                {breakeven.bookingsToBreakeven == null ? (
                  <p className="text-[13px] text-ink-dim">{t("Costs exceed revenue at every volume this period — fix the cost base before chasing volume.")}</p>
                ) : breakeven.bookingsToBreakeven <= 0 ? (
                  <p className="text-[13px] text-ink-dim">
                    {t("Above break-even by")}{" "}
                    <CountUp
                      value={Math.round(-breakeven.bookingsToBreakeven)}
                      format="int"
                      className="font-mono font-semibold tabular-nums text-[var(--color-good)]"
                    />{" "}
                    {t("grooms/month of cushion.")}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-dim">
                    {t("Need")} <span className="font-mono text-orange">{Math.round(breakeven.bookingsToBreakeven)}</span> {t("more grooms/month")} ({t("at")} {fmtMoney(breakeven.avgTicket)} {t("avg")}) {t("to break even.")}
                  </p>
                )}
              </div>
              <p className="mt-3 text-[11.5px] leading-[1.5] text-ink-dimmer">
                {t("Directional model: payroll, COGS, royalty, card fees and supplies treated as variable; rent, insurance, utilities and repairs as fixed.")}
              </p>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, format, delta, sub, tone }: { label: string; value: number; format: CountFormat; delta?: number | null; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-cell p-4">
      <Micro>{label}</Micro>
      <div className="mt-2.5 flex items-baseline gap-2">
        <div className="text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums" style={tone ? { color: tone === "good" ? "var(--color-good)" : "var(--color-orange)" } : undefined}>
          <CountUp value={value} format={format} />
        </div>
        {delta != null && <Delta value={delta} />}
      </div>
      {sub && <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">{sub}</div>}
    </div>
  );
}

function PnlRow({ label, value, bold, dim, accent, sub }: { label: string; value: string; bold?: boolean; dim?: boolean; accent?: "good" | "bad"; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className={`${bold ? "text-ink" : dim ? "text-ink-dimmer" : "text-ink-dim"}`}>{label}</span>
      <div className="flex items-baseline gap-2.5">
        {sub && <span className="text-[11px] text-ink-dimmer">{sub}</span>}
        <span
          className={`tabular-nums ${bold ? "font-semibold" : ""}`}
          style={accent ? { color: accent === "good" ? "var(--color-good)" : "var(--color-orange)" } : undefined}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Micro>{label}</Micro>
      <div className="mt-1.5 font-mono text-[16px] text-ink">{value}</div>
    </div>
  );
}
