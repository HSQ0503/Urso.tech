import {
  stores,
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import { storeComparison, getStoreScores } from "@/components/dashboard/data.server";
import {
  Card,
  PageHeader,
  Micro,
  Meter,
  BarRanking,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { StoreScoreboard } from "@/components/dashboard/store-scoreboard";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";
import { getI18n } from "@/lib/i18n.server";

// Live FranPOS columns only — No-show, Calls missed, and Rating rejoin the
// table when the booking feed, Twilio, and GBP go live (their values today
// would be dead zeros or seed data).
const COLS = ["Location", "Revenue", "Bookings", "Avg visit", "Grooming share", "Return", "Attach"];

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? t("Last 12 months") : monthLabel(month);

  // Real data, all from Supabase: per-store metrics aggregated from the
  // metrics_daily rollup, plus the composite scoreboard scores (return rate +
  // retail attach — the live, store-controllable metrics).
  const db = await storeComparison(month);
  const scores = await getStoreScores(month);
  const rows = stores.map((s) => ({ s, m: db[s.id] }));

  const rank = (sel: (r: (typeof rows)[number]) => number) =>
    [...rows]
      .sort((a, b) => sel(b) - sel(a))
      .map((r) => ({ name: r.s.name.replace("Village", "").trim(), value: sel(r), highlight: scope === r.s.id }));

  return (
    <div className="animate-stage-in space-y-12">
      <PageHeader
        eyebrow={`${t("All locations")} · ${period}`}
        title={t("Store comparison")}
      />

      {/* Scoreboard */}
      <StoreScoreboard rows={scores} highlightId={scope === "all" ? null : scope} variant="owner" />

      {/* Comparison table */}
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                {COLS.map((h) => (
                  <th key={h} className={`px-5 py-3 font-normal ${h === "Location" ? "text-left" : "text-right"}`}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, m }) => {
                const sel = scope === s.id;
                return (
                  <tr
                    key={s.id}
                    className={`border-t border-edge transition-colors hover:bg-raise ${sel ? "bg-raise-strong" : ""}`}
                  >
                    <td className="relative px-5 py-3.5">
                      {sel && <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-orange" />}
                      <span className="text-ink">{s.name}</span>
                      <Micro className="mt-0.5">{s.tier}</Micro>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(m.revenue)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{m.bookings.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{fmtMoney(m.avgTicket)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{pct(m.groomingShare)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="ml-auto flex w-[104px] items-center gap-2">
                        <Meter value={m.rebook} />
                        <span className="font-mono text-ink-dim">{pct(m.rebook)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono" style={{ color: m.attach < 0.15 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(m.attach)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Ranked comparisons */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>{t("Revenue")}</Micro>
            <AskAi
              topic={t("Revenue by store")}
              topicId="revenueByLocation"
              suggestions={[t("Why is one store ahead on revenue?"), t("Where is the biggest revenue gap?")]}
            />
            <ChartInfo id="revenueByLocation" />
          </div>
          <h2 className="mt-1.5 mb-4 text-[16px] font-medium tracking-[-0.01em]">{t("By location")}</h2>
          <BarRanking data={rank((r) => r.m.revenue)} format="moneyK" labelWidth={104} valueLabel={t("Revenue")} />
        </Card>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>{t("Return rate")}</Micro>
            <AskAi
              topic={t("Return rate by store")}
              topicId="storeRankRebook"
              suggestions={[t("Which store has the weakest return rate?"), t("What's driving the gap to the leader?")]}
            />
            <ChartInfo id="storeRankRebook" />
          </div>
          <h2 className="mt-1.5 mb-4 text-[16px] font-medium tracking-[-0.01em]">{t("By location")}</h2>
          <BarRanking data={rank((r) => Math.round(r.m.rebook * 1000) / 10)} format="pct" labelWidth={104} valueLabel={t("Return rate")} />
        </Card>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>{t("Retail attach")}</Micro>
            <AskAi
              topic={t("Retail attach by store")}
              topicId="storeRankAttach"
              suggestions={[t("Which store has the weakest retail attach?"), t("How do I lift attach at the laggard?")]}
            />
            <ChartInfo id="storeRankAttach" />
          </div>
          <h2 className="mt-1.5 mb-4 text-[16px] font-medium tracking-[-0.01em]">{t("By location")}</h2>
          <BarRanking data={rank((r) => Math.round(r.m.attach * 1000) / 10)} format="pct" labelWidth={104} valueLabel={t("Retail attach")} />
        </Card>
      </section>

      <p className="mt-3 text-[13px] text-ink-dim">
        {scope === "all"
          ? t("Return rate and retail attach are the two levers every store controls today — the ranked bars show where coaching pays off first. Call capture joins the comparison once tracking is live.")
          : `${t("Showing")} ${scopeLabel(scope)} ${t("highlighted against the other locations.")}`}
      </p>
    </div>
  );
}
