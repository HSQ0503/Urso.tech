import { retention } from "@/components/dashboard/data";
import { Card, PageHeader, Display, Micro, Tag, DonutSplit, CohortCurve, fmtMoney, pct } from "@/components/dashboard/ui";

const winback = [
  { name: "Bella — Goldendoodle", store: "Winter Park", last: "63 days ago", value: 92 },
  { name: "Max — Schnauzer", store: "Windermere", last: "71 days ago", value: 84 },
  { name: "Luna — Cavapoo", store: "Winter Garden", last: "58 days ago", value: 96 },
  { name: "Cooper — Lab", store: "Lakeside Village", last: "82 days ago", value: 78 },
  { name: "Daisy — Poodle", store: "Winter Park", last: "66 days ago", value: 104 },
];

export default function CustomersPage() {
  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow="Customers · last 30 days"
        title={
          <>
            <Display className="text-orange" italic>{retention.winbackCount}</Display> good customers quietly slipped away.
          </>
        }
        sub="Grooming is repeat revenue. The customers who stop coming back are the biggest, quietest leak you have — and the easiest dollars to win back."
      />

      {/* Top stats */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-edge py-7 md:grid-cols-4">
        <div>
          <Micro>Returning</Micro>
          <Display className="mt-2 block text-[36px] leading-none text-ink">{pct(retention.returningPct)}</Display>
          <div className="mt-1.5 text-[12.5px] text-ink-dim">of visits are repeat customers</div>
        </div>
        <div>
          <Micro>Rebook rate</Micro>
          <Display className="mt-2 block text-[36px] leading-none text-ink">{pct(retention.rebook)}</Display>
          <div className="mt-1.5 text-[12.5px] text-ink-dim">booked again before leaving</div>
        </div>
        <div>
          <Micro>Average cadence</Micro>
          <Display className="mt-2 block text-[36px] leading-none text-ink">{retention.cadenceDays}d</Display>
          <div className="mt-1.5 text-[12.5px] text-ink-dim">between grooms</div>
        </div>
        <div>
          <Micro>One-and-done</Micro>
          <Display className="mt-2 block text-[36px] leading-none text-orange">{retention.oneAndDone}</Display>
          <div className="mt-1.5 text-[12.5px] text-ink-dim">came once, never returned</div>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Cohort + mix */}
        <Card className="flex flex-col gap-6">
          <div>
            <Micro>New vs returning</Micro>
            <div className="mt-3">
              <DonutSplit a={retention.returningPct} b={retention.newPct} labelA="Returning" labelB="New" />
            </div>
          </div>
          <div className="border-t border-edge pt-5">
            <Micro className="mb-3">Cohort retention — of customers from each month, % still active</Micro>
            <CohortCurve data={retention.cohort} />
            <p className="mt-3 text-[13px] leading-[1.55] text-ink-dim">
              Just over half of new customers are still active a year on. Every point we lift this curve is recurring revenue that compounds.
            </p>
          </div>
        </Card>

        {/* Win-back */}
        <Card pad={false} className="flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
            <div>
              <Micro>Win-back ready</Micro>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Lapsed customers worth calling</h2>
            </div>
            <div className="text-right">
              <Display className="text-[22px] text-orange">{fmtMoney(retention.winbackValue, true)}</Display>
              <Micro className="!text-ink-dimmer">lifetime value</Micro>
            </div>
          </div>
          {winback.map((w) => (
            <div key={w.name} className="flex items-center gap-3 border-t border-edge px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-ink">{w.name}</div>
                <Micro className="mt-0.5 !text-ink-dimmer">{w.store} · last seen {w.last}</Micro>
              </div>
              <span className="font-mono text-[13px] text-ink-dim">{fmtMoney(w.value)}</span>
              <button className="shrink-0 rounded-lg border border-edge-strong px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-white/[0.05]">
                Text
              </button>
            </div>
          ))}
          <div className="mt-auto border-t border-edge p-4">
            <button className="w-full rounded-lg bg-orange py-2.5 text-[13.5px] font-medium text-white transition hover:brightness-110">
              Start win-back campaign · {retention.winbackCount} customers
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
