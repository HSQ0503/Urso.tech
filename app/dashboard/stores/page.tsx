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
  Tag,
  Meter,
  BarRanking,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { StoreScoreboard } from "@/components/dashboard/store-scoreboard";
import { ChartInfo } from "@/components/dashboard/chart-info";

const COLS = ["Location", "Revenue", "Bookings", "Avg visit", "No-show", "Return", "Attach", "Calls missed", "Rating"];

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  // Real data, all from Supabase: per-store metrics aggregated from the
  // metrics_daily rollup, plus the composite scoreboard scores (which fold in
  // the store rating from store_listings). Same shapes as the old mock.
  const db = await storeComparison(month);
  const scores = await getStoreScores(month);
  const rows = stores.map((s) => ({ s, m: db[s.id], missed: db[s.id].missedPct }));

  const rank = (sel: (r: (typeof rows)[number]) => number) =>
    [...rows]
      .sort((a, b) => sel(b) - sel(a))
      .map((r) => ({ name: r.s.name.replace("Village", "").trim(), value: sel(r), highlight: scope === r.s.id }));

  return (
    <div className="animate-stage-in space-y-12">
      <PageHeader
        eyebrow={`All locations · ${period}`}
        title="Store comparison"
        sub="Every metric is defined identically across the four locations, so differences reflect performance rather than measurement. Use the store filter to highlight one; the month filter rescopes every figure."
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
                  <th key={h} className={`px-5 py-3 font-normal ${h === "Location" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, m, missed }) => {
                const sel = scope === s.id;
                const lag = s.id === "wm";
                return (
                  <tr
                    key={s.id}
                    className={`border-t border-edge transition-colors hover:bg-raise ${sel ? "bg-raise-strong" : ""}`}
                  >
                    <td className="relative px-5 py-3.5">
                      {sel && <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-orange" />}
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{s.name}</span>
                        {lag && <Tag tone="orange">Review</Tag>}
                      </div>
                      <Micro className="mt-0.5">{s.tier}</Micro>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(m.revenue, true)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{m.bookings.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{fmtMoney(m.avgTicket)}</td>
                    <td className="px-5 py-3.5 text-right font-mono" style={{ color: m.noShow > 0.1 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(m.noShow)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="ml-auto flex w-[104px] items-center gap-2">
                        <Meter value={m.rebook} />
                        <span className="font-mono text-ink-dim">{pct(m.rebook)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono" style={{ color: m.attach < 0.25 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(m.attach)}</td>
                    <td className="px-5 py-3.5 text-right font-mono" style={{ color: missed > 0.25 ? "#fe5100" : "var(--color-ink-dim)" }}>{pct(missed)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{s.rating.toFixed(1)}★</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Ranked comparisons */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>Revenue</Micro>
            <ChartInfo id="revenueByLocation" />
          </div>
          <h2 className="mt-1.5 mb-4 text-[16px] font-medium tracking-[-0.01em]">By location</h2>
          <BarRanking data={rank((r) => r.m.revenue)} format="moneyK" labelWidth={104} valueLabel="Revenue" />
        </Card>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>Return rate</Micro>
            <ChartInfo id="storeRankRebook" />
          </div>
          <h2 className="mt-1.5 mb-4 text-[16px] font-medium tracking-[-0.01em]">By location</h2>
          <BarRanking data={rank((r) => Math.round(r.m.rebook * 100))} format="pct" labelWidth={104} valueLabel="Return rate" />
        </Card>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>Calls missed</Micro>
            <ChartInfo id="storeRankMissed" />
          </div>
          <h2 className="mt-1.5 mb-4 text-[16px] font-medium tracking-[-0.01em]">By location</h2>
          <BarRanking data={rank((r) => Math.round(r.missed * 100))} format="pct" labelWidth={104} valueLabel="Calls missed" />
        </Card>
      </section>

      <p className="-mt-6 text-[13px] text-ink-dim">
        {scope === "all"
          ? "Windermere and Lakeside trail the established stores on call capture and rebooking — the newer stores are where the clearest gains are."
          : `Showing ${scopeLabel(scope)} highlighted against the other locations.`}
      </p>
    </div>
  );
}
