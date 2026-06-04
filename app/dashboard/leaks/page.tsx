import { leaks, totals, type LeakStatus } from "@/components/dashboard/data";
import { Card, PageHeader, Display, Micro, Tag, fmtMoney } from "@/components/dashboard/ui";

const statusMeta: Record<LeakStatus, { tone: "good" | "orange" | "warn"; label: string }> = {
  live: { tone: "good", label: "Measurable now" },
  instrument: { tone: "orange", label: "Needs tracking" },
  fix: { tone: "warn", label: "One-time fix" },
};

// Plain-English explanation per leak.
const explain: Record<number, string> = {
  1: "Grooming is repeat business — a dog needs a cut every 4–8 weeks. Customers who quietly stop coming are the biggest leak in the business, and nobody feels it because there’s no single moment it happens.",
  2: "Calls that ring out — during the day when the desk is busy, and after you close — are new customers who simply call the next groomer instead. You can’t see them today because nothing records a call that was never answered.",
  3: "A dog in the chair is your best retail shopper, if someone asks. Stores where the front desk doesn’t attach food or treats to a groom leave easy margin on the floor.",
  4: "Booked appointments that don’t show — or cancel last minute — leave an empty chair you can’t refill. A deposit and a reminder text close most of it.",
  5: "People who start your online booking form but never finish. A short, mobile-friendly form recovers most of them.",
  6: "Winter Park is your top store but has no “Book online” button on Google — so the easiest bookings never start. A 10-minute listing fix.",
};

export default function LeaksPage() {
  const liveTotal = leaks.filter((l) => l.status === "live").reduce((s, l) => s + l.amount, 0);
  const instrumentTotal = leaks.filter((l) => l.status !== "live").reduce((s, l) => s + l.amount, 0);

  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow="Leak register · last 30 days"
        title={
          <>
            You’re losing about <Display className="text-orange" italic>{fmtMoney(totals.leak, true)}</Display> a month.
          </>
        }
        sub="Ranked by how much you can recover. Green leaks we can measure today with the data you already have. Orange ones need a small piece of tracking switched on first."
      />

      {/* Summary */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <Micro>Total recoverable</Micro>
          <Display className="text-[34px] leading-none text-orange">{fmtMoney(totals.leak, true)}<span className="text-[16px] text-ink-dimmer">/mo</span></Display>
        </Card>
        <Card className="flex flex-col gap-2">
          <Micro>Measurable today</Micro>
          <Display className="text-[34px] leading-none text-ink">{fmtMoney(liveTotal, true)}</Display>
          <span className="text-[12px] text-ink-dim">no new setup needed</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <Micro>Needs tracking first</Micro>
          <Display className="text-[34px] leading-none text-ink">{fmtMoney(instrumentTotal, true)}</Display>
          <span className="text-[12px] text-ink-dim">calls + web analytics</span>
        </Card>
      </section>

      {/* Register */}
      <div className="space-y-3">
        {leaks.map((l) => {
          const st = statusMeta[l.status];
          return (
            <Card key={l.rank} className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
              <div className="flex items-center gap-4 md:w-[180px] md:flex-col md:items-start md:gap-2">
                <Display className="text-[32px] leading-none text-orange">{fmtMoney(l.amount, true)}<span className="text-[14px] text-ink-dimmer">/mo</span></Display>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-dimmer">#{l.rank}</span>
                  <Tag tone={st.tone}>{st.label}</Tag>
                </div>
              </div>
              <div className="flex-1 border-t border-edge pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">{l.name}</h2>
                </div>
                <Micro className="mt-1.5 !text-ink-dimmer">{l.scope} · source: {l.source}</Micro>
                <p className="mt-3 max-w-[640px] text-[14px] leading-[1.6] text-ink-dim">{explain[l.rank]}</p>
              </div>
              <div className="md:self-center">
                <button className="w-full rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110 md:w-auto">
                  {l.action}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
