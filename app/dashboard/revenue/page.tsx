import {
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  getMetrics,
  getCrossSell,
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
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";

export default async function RevenueMapPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  const m = await getMetrics(scope, month);
  const byLocation = (await getRevenueByLocation(month)).map((r) => ({ name: r.name.replace("Village", "").trim(), value: r.value, highlight: scope === r.id }));
  const byService = await getRevenueByService(scope, month);
  const byGroomer = (await getRevenueByGroomer(scope, month)).slice(0, 6).map((g) => ({ name: g.name, value: g.value }));
  const nvr = await getRevenueNewVsRepeat(scope, month);
  const xs = await getCrossSell(scope, month);
  const repeatShare = nvr.repeat / (nvr.repeat + nvr.fresh);

  return (
    <div className="animate-stage-in space-y-3">
      <PageHeader
        eyebrow={`Revenue map · ${scopeLabel(scope)} · ${period}`}
        title="Where the money comes from"
      />

      {/* Headline strip */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-4">
        <Kpi label="Total revenue" value={fmtMoney(m.revenue)} />
        <Kpi label="Avg ticket" value={fmtMoney(m.avgTicket)} />
        <Kpi label="Buy both" value={pct(xs.both)} />
        <Kpi label="Repeat revenue" value={pct(repeatShare)} />
      </section>

      {/* Location + line */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>By location</Micro>
            <AskAi
              topic="Revenue by store"
              topicId="revenueByLocation"
              suggestions={["Why is one store ahead on revenue?", "Where is the biggest revenue gap?"]}
            />
            <ChartInfo id="revenueByLocation" />
          </div>
          <h2 className="mb-4 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Revenue by store</h2>
          <BarRanking data={byLocation} format="moneyK" labelWidth={104} valueLabel="Revenue" />
        </Card>
        <Card className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-1.5">
              <Micro>By line · customer overlap</Micro>
              <AskAi
                topic="Grooming vs retail overlap"
                topicId="crossSellMix"
                suggestions={["How do I move grooming-only into both?", "What's the cross-sell wall costing me?"]}
              />
              <ChartInfo id="crossSellMix" />
            </div>
            <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Grooming vs retail</h2>
            <div className="mt-4">
              <StackedShareBar
                segments={[
                  { label: "Both", value: xs.both, color: "#fe5100" },
                  { label: "Grooming only", value: xs.groomingOnly, color: "var(--color-series)" },
                  { label: "Retail only", value: xs.retailOnly, color: "var(--color-series-soft)" },
                ]}
              />
            </div>
          </div>
          <div className="border-t border-edge pt-5">
            <div className="mb-3 flex items-center gap-1.5">
              <Micro>New vs repeat revenue</Micro>
              <AskAi
                topic="New vs repeat revenue"
                topicId="newVsRepeat"
                suggestions={["Is growth from new customers or repeats?", "How much revenue is walk-in?"]}
              />
              <ChartInfo id="newVsRepeat" />
            </div>
            <StackedShareBar
              segments={[
                { label: "Repeat customers", value: nvr.repeat, color: "#fe5100" },
                { label: "New customers", value: nvr.fresh, color: "var(--color-series)" },
                { label: "Walk-in (no profile)", value: nvr.walkIn, color: "var(--color-series-soft)" },
              ]}
            />
          </div>
        </Card>
      </section>

      {/* Service + groomer */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <Micro>By service</Micro>
          <h2 className="mb-3 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Top revenue lines</h2>
          <div className="divide-y divide-edge">
            {byService.map((s) => (
              <div key={s.name} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-[13.5px] text-ink">{s.name}</span>
                  <Tag tone={s.line === "Grooming" ? "orange" : "muted"}>{s.line}</Tag>
                </div>
                <span className="font-mono text-[13px] text-ink-dim">{fmtMoney(s.value)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5">
            <Micro>By groomer</Micro>
            <AskAi
              topic="Service revenue by groomer"
              topicId="revenueByGroomer"
              suggestions={["Who are the top groomers by revenue?", "Which groomers have capacity to grow?"]}
            />
            <ChartInfo id="revenueByGroomer" />
          </div>
          <h2 className="mb-4 mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Service revenue performed</h2>
          <BarRanking data={byGroomer} format="moneyK" labelWidth={130} valueLabel="Service revenue" />
        </Card>
      </section>

      <p className="mt-3 text-[13px] leading-[1.6] text-ink-dim">
        Retail attaches to grooming visits, so grooming share and retail attach move together. The clearest revenue lever is converting grooming-only customers into retail buyers at checkout.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-cell p-4">
      <Micro>{label}</Micro>
      <div className="mt-2.5 text-[22px] font-bold leading-none tracking-[-0.02em]">{value}</div>
    </div>
  );
}
