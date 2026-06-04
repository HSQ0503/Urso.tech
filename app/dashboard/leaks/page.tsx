import { leaks, type LeakStatus, type Severity } from "@/components/dashboard/data";
import { Card, PageHeader, Micro, Tag } from "@/components/dashboard/ui";

const statusMeta: Record<LeakStatus, { tone: "good" | "orange" | "warn"; label: string }> = {
  live: { tone: "good", label: "Measurable now" },
  instrument: { tone: "orange", label: "Needs tracking" },
  fix: { tone: "warn", label: "One-time fix" },
};

const sevTone: Record<Severity, "orange" | "warn" | "muted"> = { High: "orange", Medium: "warn", Low: "muted" };

const explain: Record<number, string> = {
  1: "Grooming is recurring revenue — a dog needs a cut every four to eight weeks. Customers who quietly stop returning are the largest source of lost revenue, and the hardest to notice, because there is no single moment it happens.",
  2: "Calls that ring out — during the day when the desk is busy, and after closing — are prospective customers who book elsewhere. They are not visible in current reporting because nothing records a call that was never answered.",
  3: "A grooming appointment is the strongest moment to sell food, treats, and accessories. Locations where the front desk does not attach retail to a groom are leaving margin uncaptured.",
  4: "Booked appointments that do not show, or cancel at the last minute, leave an unfillable slot. Deposits and reminder messages reduce both materially.",
  5: "Visitors who begin the online booking form but do not complete it. A shorter, mobile-first form recovers most of them.",
  6: "Winter Park ranks well locally but has no booking link on its Google listing, so the most direct path to an appointment is unavailable.",
};

export default function LeaksPage() {
  const liveCount = leaks.filter((l) => l.status === "live").length;
  const trackCount = leaks.filter((l) => l.status !== "live").length;

  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow="Leak register · Last 30 days"
        title="Identified issues"
        sub="Operational issues ranked by severity, each tied to the data source behind it. Items marked measurable can be tracked from existing data; the rest need a small piece of tracking enabled first."
      />

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <Micro>Issues flagged</Micro>
          <div className="text-[34px] font-medium leading-none tracking-[-0.02em]">{leaks.length}</div>
        </Card>
        <Card className="flex flex-col gap-2">
          <Micro>Measurable now</Micro>
          <div className="text-[34px] font-medium leading-none tracking-[-0.02em]">{liveCount}</div>
          <span className="text-[12px] text-ink-dim">from existing data</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <Micro>Needs tracking</Micro>
          <div className="text-[34px] font-medium leading-none tracking-[-0.02em]">{trackCount}</div>
          <span className="text-[12px] text-ink-dim">calls + web analytics</span>
        </Card>
      </section>

      <div className="space-y-3">
        {leaks.map((l) => {
          const st = statusMeta[l.status];
          return (
            <Card key={l.rank} className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
              <div className="flex items-center gap-4 md:w-[200px] md:flex-col md:items-start md:gap-2.5">
                <div className="text-[22px] font-medium leading-none tracking-[-0.01em]">{l.metric}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-dimmer">#{l.rank}</span>
                  <Tag tone={sevTone[l.severity]}>{l.severity} priority</Tag>
                </div>
              </div>
              <div className="flex-1 border-t border-edge pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">{l.name}</h2>
                  <Tag tone={st.tone}>{st.label}</Tag>
                </div>
                <Micro className="mt-1.5 !text-ink-dimmer">{l.scope} · source: {l.source}</Micro>
                <p className="mt-3 max-w-[640px] text-[14px] leading-[1.6] text-ink-dim">{explain[l.rank]}</p>
              </div>
              <div className="md:self-center">
                <button className="w-full rounded-lg border border-edge-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/[0.05] md:w-auto">
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
