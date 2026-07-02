import type { Metadata } from "next";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  Delta,
  Meter,
  AreaChart,
  CallsBars,
  TrafficChart,
  Legend,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { CountUp } from "@/components/dashboard/count-up";

export const metadata: Metadata = {
  title: "Health Monitor One — Live demo | Urso",
  description: "Sample operating dashboard for Health Monitor One. All figures are illustrative.",
  robots: { index: false, follow: false },
};

// Standalone showcase dashboard — no auth, no live feeds. Everything below is
// invented sample data for a fictional client ("Health Monitor One"), wired into
// the same UI + chart components the real dashboard uses.
const labels = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

const series = {
  revenue: [312000, 328000, 305000, 341000, 359000, 372000, 338000, 351000, 366000, 389000, 402000, 421000],
  callsTotal: [612, 648, 667, 701, 724, 690, 742, 768, 795, 828, 851, 873],
  callsMissed: [98, 96, 101, 99, 88, 82, 95, 90, 84, 79, 71, 68],
  webVisits: [9800, 10240, 9650, 10880, 11420, 11960, 10760, 11180, 11640, 12380, 12810, 13420],
  webBookings: [612, 690, 648, 742, 801, 852, 742, 795, 828, 902, 948, 1010],
};

const metrics = {
  revenue: 4284000,
  appointments: 18640,
  avgVisit: 229.82,
  returnRate: 0.683,
  deviceAttach: 0.314,
  monitoringShare: 0.612,
};

const deltas = {
  revenue: 0.123,
  appointments: 0.081,
  avgVisit: 0.034,
  returnRate: 0.052,
  deviceAttach: 0.097,
  monitoringShare: 0.021,
};

const calls = { total: 8899, missedPct: 0.118 };
const web = { visits: 136140, convRate: 0.068 };

const clinics = [
  { id: "downtown", name: "HMO Downtown", tier: "Flagship clinic", revenue: 1486000, avgVisit: 241.5, returnRate: 0.71, deviceAttach: 0.36 },
  { id: "lakeside", name: "HMO Lakeside", tier: "Core clinic", revenue: 1128000, avgVisit: 228.0, returnRate: 0.69, deviceAttach: 0.33 },
  { id: "northpark", name: "HMO Northpark", tier: "Core clinic", revenue: 982000, avgVisit: 219.4, returnRate: 0.66, deviceAttach: 0.29 },
  { id: "bayheights", name: "HMO Bay Heights", tier: "Growth clinic", revenue: 688000, avgVisit: 206.8, returnRate: 0.61, deviceAttach: 0.13 },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Topbar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-edge bg-bg/70 px-5 py-3 backdrop-blur-xl md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-orange font-mono text-[12px] font-bold text-white">H</span>
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Health Monitor One</span>
          <Tag tone="orange">Live demo</Tag>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer sm:block">
          Powered by Urso
        </span>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-6 md:px-8 md:py-8">
        <div className="animate-stage-in">
          <PageHeader
            eyebrow="Overview · All clinics · Last 12 months"
            title="Performance overview"
          />
        </div>

        {/* urso.ai win banner */}
        <div className="mt-3 inline-flex animate-stage-in items-center gap-2.5 border-l-2 border-orange bg-orange-wash py-2 pl-3 pr-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange">urso.ai</span>
          <span className="text-[13px] text-ink-dim">
            <span className="font-semibold text-orange">Revenue up {pct(deltas.revenue)}</span> — your strongest move this period.
          </span>
        </div>

        {/* KPI row */}
        <section className="dash-raise mt-2 grid animate-stage-in grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6" style={{ animationDelay: "50ms" }}>
          <Kpi label="Revenue" raw={metrics.revenue} format="money" delta={deltas.revenue} accent />
          <Kpi label="Appointments" raw={metrics.appointments} format="int" delta={deltas.appointments} />
          <Kpi label="Avg visit" raw={metrics.avgVisit} format="money" delta={deltas.avgVisit} />
          <Kpi label="Return rate" raw={metrics.returnRate} format="pct" delta={deltas.returnRate} />
          <Kpi label="Device attach" raw={metrics.deviceAttach} format="pct" delta={deltas.deviceAttach} />
          <Kpi label="Monitoring share" raw={metrics.monitoringShare} format="pct" delta={deltas.monitoringShare} />
        </section>

        {/* Action item + revenue */}
        <section className="mt-3 grid animate-stage-in grid-cols-1 gap-3 lg:grid-cols-[1fr_1.25fr]" style={{ animationDelay: "110ms" }}>
          <Card className="dash-raise flex flex-col">
            <Micro>Action item · what to fix first</Micro>
            <h3 className="mt-3 text-[18px] font-semibold leading-[1.2] tracking-[-0.01em] text-ink">
              Bay Heights is converting the fewest add-on monitoring plans
            </h3>
            <p className="mt-2.5 flex-1 text-[13.5px] leading-[1.55] text-ink-dim">
              Device attach at Bay Heights is <span className="font-medium text-orange">13%</span> versus 36% at Downtown.
              At the network average ticket, closing half that gap is worth roughly <span className="font-medium text-ink">$94k</span> in
              annualized recurring revenue. Coach the front desk on the post-visit plan offer.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Tag tone="orange">$94k opportunity</Tag>
              <Tag tone="muted">Bay Heights</Tag>
            </div>
          </Card>

          <Card className="dash-raise">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <Micro>Revenue</Micro>
                <div className="mt-1.5 flex items-baseline gap-2.5">
                  <span className="text-[22px] font-bold tracking-[-0.01em] tabular-nums">
                    <CountUp value={metrics.revenue} format="money" />
                  </span>
                  <Delta value={deltas.revenue} />
                  <span className="text-[12px] text-ink-dim">Last 12 months</span>
                </div>
              </div>
            </div>
            <AreaChart data={series.revenue} labels={labels} format="moneyK" height={224} />
          </Card>
        </section>

        {/* Calls + Traffic */}
        <section className="mt-3 grid animate-stage-in grid-cols-1 gap-3 xl:grid-cols-2" style={{ animationDelay: "170ms" }}>
          <Card className="dash-raise">
            <div className="mb-4 flex items-center gap-2">
              <Micro>Inbound calls</Micro>
            </div>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="text-[22px] font-bold tracking-[-0.01em]">
                {calls.total.toLocaleString()} <span className="text-[13px] text-ink-dim">calls</span>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold text-orange">{pct(calls.missedPct)}</div>
                <Micro>missed</Micro>
              </div>
            </div>
            <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
            <div className="mt-3">
              <Legend items={[{ label: "Answered", color: "var(--color-series)" }, { label: "Missed", color: "#fe5100" }]} />
            </div>
          </Card>

          <Card className="dash-raise">
            <div className="mb-4 flex items-center gap-2">
              <Micro>Website traffic vs appointments</Micro>
            </div>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="text-[22px] font-bold tracking-[-0.01em]">
                {web.visits.toLocaleString()} <span className="text-[13px] text-ink-dim">visits</span>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold text-orange">{pct(web.convRate, 1)}</div>
                <Micro>book online</Micro>
              </div>
            </div>
            <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
            <div className="mt-3">
              <Legend items={[{ label: "Visits", color: "var(--color-series)" }, { label: "Became appointments", color: "#fe5100" }]} />
            </div>
          </Card>
        </section>

        {/* Clinic performance */}
        <section className="mt-3 animate-stage-in" style={{ animationDelay: "230ms" }}>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <Micro>By location</Micro>
              <h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.01em] text-ink">Clinic performance</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {clinics.map((c) => (
              <Card key={c.id} className="dash-raise flex flex-col gap-4 transition-all duration-200 hover:-translate-y-px">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14.5px] text-ink">{c.name}</div>
                    <Micro className="mt-0.5">{c.tier}</Micro>
                  </div>
                  <span className="font-mono text-[12px] text-ink-dim">{fmtMoney(c.avgVisit)} avg</span>
                </div>
                <div className="text-[27px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                  <CountUp value={c.revenue} format="money" />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Return</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(c.returnRate)}</span>
                  </div>
                  <Meter value={c.returnRate} color="var(--color-ink-dim)" />
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <Micro>Device attach</Micro>
                  <span className="font-mono text-[12px]" style={{ color: c.deviceAttach < 0.15 ? "#fe5100" : "var(--color-ink-dim)" }}>
                    {pct(c.deviceAttach)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
          Sample data · for demonstration only
        </p>
      </main>
    </div>
  );
}

function Kpi({ label, raw, format, delta, accent }: { label: string; raw: number; format: "money" | "pct" | "int"; delta: number; accent?: boolean }) {
  return (
    <div className="bg-cell p-4">
      <div className="flex items-center justify-between">
        <Micro>{label}</Micro>
        <Delta value={delta} />
      </div>
      <div className={`mt-2.5 text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums ${accent ? "text-orange" : "text-ink"}`}>
        <CountUp value={raw} format={format} />
      </div>
    </div>
  );
}
