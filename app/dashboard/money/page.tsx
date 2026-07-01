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
  ProfitWaterfall,
  MoneyTrend,
  CostBars,
  CostBenchmark,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { AskAi } from "@/components/dashboard/ask-ai";
import { getI18n } from "@/lib/i18n.server";

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
  // Open-books month with no income yet: QuickBooks records income after
  // expenses, so this month would render $0 revenue against real costs — a
  // misleading "loss". Show an honest provisional notice instead of the numbers.
  const provisionalEmpty = !!openSelected && overview.revenue === 0;

  return (
    <div className="animate-stage-in space-y-3">
      <PageHeader
        eyebrow={`${t("Money")} · ${scopeLabel(scope)} · ${period}`}
        title={t("Profit & margins")}
        period
      />

      {/* Honesty notices */}
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="muted">{t("QuickBooks · accrual")}</Tag>
        {openSelected && <Tag tone="warn">{t("Books not closed — provisional")}</Tag>}
        {!openSelected && overview.openMonth && <Tag tone="muted">{t("Current month excluded (books open)")}</Tag>}
        {overview.classedOnly && <Tag tone="muted">{t("Per-store P&L — excludes company-level unallocated costs")}</Tag>}
      </div>

      {!hasData ? (
        <Card>
          <p className="py-8 text-center text-sm text-ink-dim">{t("No QuickBooks data for this period.")}</p>
        </Card>
      ) : provisionalEmpty ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-ink">{t("{month}'s books are still open.", { month: period })}</p>
            <p className="mx-auto mt-2 max-w-[480px] text-sm leading-relaxed text-ink-dim">
              {t("In QuickBooks, income posts after expenses, so an open month shows costs with no matching revenue yet — its profit isn't meaningful until the books close. Pick a closed month or “Last 12 months” for an accurate picture.")}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI strip */}
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t("Revenue")} value={fmtMoney(overview.revenue)} delta={deltas.revenue} />
            <Kpi label={t("Gross margin")} value={pct(overview.grossMargin)} />
            <Kpi
              label={t("Net profit")}
              value={fmtMoney(overview.netIncome)}
              delta={deltas.netIncome}
              tone={overview.netIncome >= 0 ? "good" : "bad"}
            />
            <Kpi
              label={t("Net margin")}
              value={pct(overview.netMargin)}
              sub={deltas.netMargin != null ? `${deltas.netMargin >= 0 ? "+" : "−"}${Math.abs(deltas.netMargin * 100).toFixed(1)} ${t("pts")}` : undefined}
            />
            <Kpi label={t("Labor ratio")} value={pct(overview.laborRatio)} sub={t("payroll ÷ revenue")} />
            <Kpi label={t("Profit / groom")} value={fmtMoney(ppb.netPerBooking)} sub={t("net ÷ bookings")} />
          </section>

          {/* Money trend with Revenue / Profit / Margin toggle */}
          <section>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Trend · all closed months")}</Micro>
                <AskAi
                  topic={t("Profit & margin trend")}
                  topicId="marginTrend"
                  suggestions={[t("Is profitability improving or eroding?"), t("Which months are the most profitable?")]}
                />
              </div>
              <h2 className="mb-3 text-base font-semibold tracking-[-0.01em]">{t("Revenue, profit & margin over time")}</h2>
              <MoneyTrend trend={trend} />
            </Card>
          </section>

          {/* Waterfall + cost-as-%-of-revenue */}
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Where the money goes")}</Micro>
                <AskAi
                  topic={t("Profit waterfall")}
                  topicId="profitWaterfall"
                  suggestions={[t("What's my single biggest cost?"), t("What would lift net profit the most?")]}
                />
              </div>
              <h2 className="mb-2 text-base font-semibold tracking-[-0.01em]">{t("Revenue to net profit")}</h2>
              <ProfitWaterfall steps={waterfall} />
            </Card>
            <Card>
              <Micro>{t("Cost as % of revenue")}</Micro>
              <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Cost breakdown")}</h2>
              <CostBars lines={costs} />
            </Card>
          </section>

          {/* Cross-store cost benchmark ⭐ */}
          <section>
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("Cross-store benchmark · cost as % of revenue")}</Micro>
                <AskAi
                  topic={t("Cross-store cost benchmark")}
                  topicId="costBenchmark"
                  suggestions={[t("Which store has the worst cost problem?"), t("Why is one store less profitable than another?")]}
                />
              </div>
              <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Where each store's costs run high")}</h2>
              <CostBenchmark rows={benchmark} />
              <p className="mt-4 text-xs leading-relaxed text-ink-dim">
                {t("Every cost is shown as a share of that store's own revenue, so stores of different sizes compare fairly. Hotter cells are higher — they point to the specific line dragging a store's margin.")}
              </p>
              {scope === "all" && consolidated.unallocated !== 0 && (
                <p className="mt-2 text-xs text-ink-dimmer">
                  {t("Note")}: {fmtMoney(Math.abs(consolidated.unallocated))} {t("of Windermere + Lakeside costs aren't tagged to a store in QuickBooks (kept in the consolidated total, not in either store above).")}
                </p>
              )}
            </Card>
          </section>

          {/* Owner P&L + per-store contribution */}
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <Micro>{scope === "all" ? t("Consolidated P&L") : t("Profit & loss")}</Micro>
              <h2 className="mb-3 text-base font-semibold tracking-[-0.01em]">{scope === "all" ? t("All stores, this period") : scopeLabel(scope)}</h2>
              <div className="divide-y divide-edge font-mono text-sm">
                <PnlRow label={t("Revenue")} value={fmtMoney(overview.revenue)} />
                <PnlRow label={t("− Cost of goods")} value={fmtMoney(overview.cogs)} dim />
                <PnlRow label={t("Gross profit")} value={fmtMoney(overview.grossProfit)} bold sub={pct(overview.grossMargin)} />
                <PnlRow label={t("− Operating expenses")} value={fmtMoney(overview.expenses)} dim />
                <PnlRow label={t("Net profit")} value={fmtMoney(overview.netIncome)} bold accent={overview.netIncome >= 0 ? "good" : "bad"} sub={pct(overview.netMargin)} />
              </div>
            </Card>
            <Card>
              <Micro>{t("Net margin by store")}</Micro>
              <h2 className="mb-3 text-base font-semibold tracking-[-0.01em]">{t("Who's carrying the profit")}</h2>
              <div className="divide-y divide-edge">
                {[...consolidated.perStore].sort((a, b) => b.netMargin - a.netMargin).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-ink">{s.name}</span>
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-ink-dim">{fmtMoney(s.netIncome)}</span>
                      <span className="w-14 text-right font-mono text-sm tabular-nums" style={{ color: s.netMargin >= 0 ? "var(--color-good)" : "var(--color-bad)" }}>
                        {pct(s.netMargin)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* Service-line margin + break-even */}
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <Micro>{t("True margin by service line")}</Micro>
                <AskAi
                  topic={t("Grooming vs retail margin")}
                  topicId="serviceMargin"
                  suggestions={[t("Is grooming or retail more profitable?"), t("Does retail attach help or hurt margin?")]}
                />
              </div>
              <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("Grooming vs retail")}</h2>
              <div className="grid grid-cols-2 gap-3">
                {serviceMargin.map((s) => (
                  <div key={s.line} className="rounded-lg border border-edge bg-cell p-4">
                    <div className="flex items-center justify-between">
                      <Micro>{t(s.line)}</Micro>
                      <span className="font-mono text-base font-semibold text-ink">{pct(s.marginPct)}</span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-ink-dimmer">{t("Revenue")}</span><span className="font-mono text-ink-dim">{fmtMoney(s.revenue)}</span></div>
                      <div className="flex justify-between"><span className="text-ink-dimmer">{t("Cost of goods")}</span><span className="font-mono text-ink-dim">{fmtMoney(s.cogs)}</span></div>
                      <div className="flex justify-between"><span className="text-ink-dimmer">{t("Gross profit")}</span><span className="font-mono text-ink">{fmtMoney(s.grossProfit)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-dim">
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
              <h2 className="mb-4 text-base font-semibold tracking-[-0.01em]">{t("What it takes to profit")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <Stat label={t("Break-even revenue")} value={breakeven.breakevenRevenue == null ? "—" : fmtMoney(breakeven.breakevenRevenue)} />
                <Stat label={t("Monthly revenue")} value={fmtMoney(breakeven.monthlyRevenue)} />
                <Stat label={t("Contribution margin")} value={pct(breakeven.contributionMargin)} />
                <Stat label={t("Fixed costs / mo")} value={fmtMoney(breakeven.fixedMonthly)} />
              </div>
              <div className="mt-4 border-t border-edge pt-4">
                {breakeven.bookingsToBreakeven == null ? (
                  <p className="text-sm text-ink-dim">{t("Costs exceed revenue at every volume this period — fix the cost base before chasing volume.")}</p>
                ) : breakeven.bookingsToBreakeven <= 0 ? (
                  <p className="text-sm text-ink-dim">
                    {t("Above break-even by")} <span className="font-mono text-[var(--color-good)]">{Math.round(-breakeven.bookingsToBreakeven)}</span> {t("grooms/month of cushion.")}
                  </p>
                ) : (
                  <p className="text-sm text-ink-dim">
                    {t("Need")} <span className="font-mono text-bad">{Math.round(breakeven.bookingsToBreakeven)}</span> {t("more grooms/month")} ({t("at")} {fmtMoney(breakeven.avgTicket)} {t("avg")}) {t("to break even.")}
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-dimmer">
                {t("Directional model: payroll, COGS, royalty, card fees and supplies treated as variable; rent, insurance, utilities and repairs as fixed.")}
              </p>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, delta, sub, tone }: { label: string; value: string; delta?: number | null; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-cell p-4">
      <Micro>{label}</Micro>
      <div className="mt-2.5 flex items-baseline gap-2">
        <div className="text-2xl font-semibold leading-none tracking-[-0.01em] tabular-nums" style={tone ? { color: tone === "good" ? "var(--color-good)" : "var(--color-bad)" } : undefined}>
          {value}
        </div>
        {delta != null && <Delta value={delta} />}
      </div>
      {sub && <div className="mt-1.5 font-mono text-2xs uppercase tracking-[0.1em] text-ink-dimmer">{sub}</div>}
    </div>
  );
}

function PnlRow({ label, value, bold, dim, accent, sub }: { label: string; value: string; bold?: boolean; dim?: boolean; accent?: "good" | "bad"; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className={`${bold ? "text-ink" : dim ? "text-ink-dimmer" : "text-ink-dim"}`}>{label}</span>
      <div className="flex items-baseline gap-2.5">
        {sub && <span className="text-xs text-ink-dimmer">{sub}</span>}
        <span
          className={`tabular-nums ${bold ? "font-semibold" : ""}`}
          style={accent ? { color: accent === "good" ? "var(--color-good)" : "var(--color-bad)" } : undefined}
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
      <div className="mt-1.5 font-mono text-base text-ink">{value}</div>
    </div>
  );
}
