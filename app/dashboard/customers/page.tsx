import {
  retention,
  metrics,
  crossSell,
  customerSegments,
  customersByValue,
  customerIntel,
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  DonutSplit,
  CohortCurve,
  StackedShareBar,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { WinbackCard } from "@/components/dashboard/winback-card";

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
  const segments = customerSegments(scope);
  const topCustomers = customersByValue(scope);
  const intel = customerIntel(scope);
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

      {/* Customer intelligence */}
      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <Micro>Customer intelligence</Micro>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Value, risk &amp; next action</h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">Avg LTV {fmtMoney(intel.avgLtv)}</span>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-4">
          {segments.map((s) => {
            const risk = s.segment === "At risk" || s.segment === "Lapsed";
            return (
              <div key={s.segment} className="bg-bg p-4">
                <Micro>{s.segment}</Micro>
                <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]" style={{ color: risk ? "#fe5100" : undefined }}>{s.count}</div>
              </div>
            );
          })}
        </div>

        <Card pad={false} className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                  {["Customer", "Store", "Visits", "Lifetime value", "Last visit", "Next action"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 font-normal ${i === 2 || i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c) => {
                  const risk = c.segment === "At risk" || c.segment === "Lapsed";
                  return (
                    <tr key={c.name} className="border-t border-edge transition-colors hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{c.name}</span>
                          <Tag tone={c.segment === "VIP" ? "good" : risk ? "orange" : "muted"}>{c.segment}</Tag>
                        </div>
                        <Micro className="mt-0.5">{c.pet}</Micro>
                      </td>
                      <td className="px-5 py-3.5 text-ink-dim">{c.store}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{c.visits}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(c.ltv)}</td>
                      <td className="px-5 py-3.5 font-mono" style={{ color: c.lastVisit > 60 ? "#fe5100" : "rgba(255,255,255,0.58)" }}>{c.lastVisit}d ago</td>
                      <td className="px-5 py-3.5 text-ink-dim">{c.next}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <WinbackCard list={list} winbackCount={retention.winbackCount} />
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
