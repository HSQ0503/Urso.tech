import {
  retention,
  metrics,
  crossSell,
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  Card,
  PageHeader,
  Micro,
  DonutSplit,
  CohortCurve,
  StackedShareBar,
  pct,
} from "@/components/dashboard/ui";

const inactive = [
  { name: "Bella — Goldendoodle", store: "Winter Park", last: "63 days ago", visits: 11 },
  { name: "Max — Schnauzer", store: "Windermere", last: "71 days ago", visits: 8 },
  { name: "Luna — Cavapoo", store: "Winter Garden", last: "58 days ago", visits: 14 },
  { name: "Cooper — Labrador", store: "Lakeside Village", last: "82 days ago", visits: 7 },
  { name: "Daisy — Poodle", store: "Winter Park", last: "66 days ago", visits: 16 },
];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  const m = metrics(scope, month);
  const xs = crossSell(scope, month);
  const list = scope === "all" ? inactive : inactive.filter((c) => c.store === scopeLabel(scope) || scopeLabel(scope).startsWith(c.store.split(" ")[0]));

  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow={`Customers · ${scopeLabel(scope)} · ${period}`}
        title="Customer retention"
        sub="Grooming is recurring revenue, so retention is the clearest indicator of long-term performance. These figures track repeat behaviour, cross-selling, and customers who have lapsed."
      />

      <section className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-edge py-7 md:grid-cols-4">
        <Stat label="Returning" value={pct(retention.returningPct)} sub="of visits are repeat customers" />
        <Stat label="Rebook rate" value={pct(m.rebook)} sub="rebook before leaving" />
        <Stat label="Average cadence" value={`${retention.cadenceDays} days`} sub="between grooms" />
        <Stat label="Single-visit" value={String(retention.oneAndDone)} sub="came once, did not return" accent />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-6">
          <div>
            <Micro>New vs returning</Micro>
            <div className="mt-3">
              <DonutSplit a={retention.returningPct} b={retention.newPct} labelA="Returning" labelB="New" />
            </div>
          </div>
          <div className="border-t border-edge pt-5">
            <Micro className="mb-3">Cohort retention — share of each month&rsquo;s new customers still active</Micro>
            <CohortCurve data={retention.cohort} />
            <p className="mt-3 text-[13px] leading-[1.55] text-ink-dim">
              Just over half of new customers remain active after a year. Improving this curve is the most durable driver of recurring revenue.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col gap-6">
          <div>
            <Micro>Cross-sell</Micro>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Retail &amp; grooming overlap</h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-ink-dim">
              Customers who buy both spend materially more per visit. The largest opportunity is converting grooming-only customers into retail buyers at checkout.
            </p>
          </div>
          <div className="mt-auto">
            <StackedShareBar
              segments={[
                { label: "Both", value: xs.both, color: "#fe5100" },
                { label: "Grooming only", value: xs.groomingOnly, color: "rgba(255,255,255,0.26)" },
                { label: "Retail only", value: xs.retailOnly, color: "rgba(255,255,255,0.13)" },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card pad={false} className="mt-5 flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <Micro>Retention</Micro>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Inactive customers</h2>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-medium tracking-[-0.01em]">{retention.winbackCount}</div>
            <Micro>eligible for win-back</Micro>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="border-t border-edge px-5 py-8 text-center text-[13px] text-ink-dim">No lapsed customers flagged for this location in the selected period.</div>
        ) : (
          list.map((c) => (
            <div key={c.name} className="flex items-center gap-3 border-t border-edge px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-ink">{c.name}</div>
                <Micro className="mt-0.5 !text-ink-dimmer">{c.store} · last visit {c.last}</Micro>
              </div>
              <span className="font-mono text-[12px] text-ink-dim">{c.visits} visits</span>
              <button className="shrink-0 rounded-lg border border-edge-strong px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-white/[0.05]">
                Contact
              </button>
            </div>
          ))
        )}
        <div className="mt-auto border-t border-edge p-4">
          <button className="w-full rounded-lg border border-edge-strong py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-white/[0.05]">
            Start win-back campaign · {retention.winbackCount} customers
          </button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div>
      <Micro>{label}</Micro>
      <div className={`mt-2 text-[34px] font-medium leading-none tracking-[-0.02em] ${accent ? "text-orange" : "text-ink"}`}>{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-dim">{sub}</div>
    </div>
  );
}
