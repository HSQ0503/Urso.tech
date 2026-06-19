import {
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
} from "@/components/dashboard/data";
import {
  getMetrics,
  getCallStats,
  getWebStats,
  getFunnel,
  getCrossSell,
  getSeries,
  getCallsHourly,
} from "@/components/dashboard/data.server";
import {
  Card,
  PageHeader,
  Micro,
  Tag,
  Legend,
  AreaChart,
  CallsBars,
  CallsChart,
  TrafficChart,
  ConversionFunnel,
  RadialGauge,
  Donut,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { AskAi } from "@/components/dashboard/ask-ai";
import { ChartInfo } from "@/components/dashboard/chart-info";

function SubHead({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <Micro>{eyebrow}</Micro>
        <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const m = await getMetrics(scope, month);
  const cs = await getCallStats(scope, month);
  const ws = await getWebStats(scope, month);
  const series = await getSeries(scope, month);
  const labels = series.labels;
  const funnel = await getFunnel(scope, month);
  const xs = await getCrossSell(scope, month);
  const hourly = await getCallsHourly(scope, month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  return (
    <div className="animate-stage-in space-y-12">
      <PageHeader
        eyebrow={`Diagnostics · ${scopeLabel(scope)} · ${period}`}
        title="Performance"
      />

      {/* Capture */}
      <section>
        <SubHead
          eyebrow="Capture · Twilio"
          title="Inbound call handling"
          right={<Tag tone="muted">Call tracking pending</Tag>}
        />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.7fr_1fr]">
          <Card>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Micro>Answered vs missed</Micro>
                  <AskAi
                    topic="Calls answered vs missed"
                    topicId="callsAnsweredMissed"
                    pending
                    suggestions={["What would call tracking tell me?", "What's measurable today instead?"]}
                  />
                  <ChartInfo id="callsAnsweredMissed" />
                </div>
                <div className="mt-1.5 text-[22px] font-bold tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-[13px] text-ink-dim">calls</span></div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold text-orange">{pct(cs.missedPct)}</div>
                <Micro>missed</Micro>
              </div>
            </div>
            <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} height={224} />
            <div className="mt-3">
              <Legend items={[{ label: "Answered", color: "var(--color-series)" }, { label: "Missed", color: "#fe5100" }]} />
            </div>
          </Card>

          <Card className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <Micro>Calls answered</Micro>
              <AskAi
                topic="Call answer rate"
                topicId="callsAnsweredGauge"
                pending
                suggestions={["What would call tracking tell me?", "What's measurable today instead?"]}
              />
              <ChartInfo id="callsAnsweredGauge" />
            </div>
            <div className="mt-1 grid place-items-center">
              <RadialGauge value={cs.answeredPct} caption="answered" />
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-edge bg-edge">
              <div className="bg-panel p-3.5">
                <Micro>Answered</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-ink">{(cs.total - cs.missed).toLocaleString()}</div>
              </div>
              <div className="bg-panel p-3.5">
                <Micro>Missed</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-orange">{cs.missed.toLocaleString()}</div>
              </div>
            </div>
            <p className="mt-auto pt-4 text-[12.5px] leading-[1.5] text-ink-dim">
              Each missed call is a prospective booking. Instant text-back recovers most after-hours misses before they reach a competitor.
            </p>
          </Card>
        </div>

        <Card className="mt-3">
          <SubHead
            eyebrow="When calls are missed"
            title="Calls by hour, with after-hours band"
            right={
              <div className="flex items-center gap-2">
                <AskAi
                  topic="Calls by hour"
                  topicId="callsByHour"
                  pending
                  suggestions={["What would call tracking tell me?", "What's measurable today instead?"]}
                />
                <ChartInfo id="callsByHour" align="right" />
              </div>
            }
          />
          <CallsChart hourly={hourly.hourly} missedHourly={hourly.missedHourly} startHour={hourly.startHour} closeHour={hourly.closeHour} height={180} />
          <p className="mt-3 text-[13px] text-ink-dim">
            Misses cluster in the busy midday desk hours and after closing (shaded). After-hours calls are the clearest case for instant text-back.
          </p>
        </Card>
      </section>

      {/* Convert */}
      <section>
        <SubHead
          eyebrow="Convert · Web analytics + FranPOS"
          title="Booking conversion"
          right={<Tag tone="muted">Analytics pending</Tag>}
        />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Micro>Online booking funnel</Micro>
                  <AskAi
                    topic="Online booking funnel"
                    topicId="bookingFunnel"
                    pending
                    suggestions={["What would web tracking tell me?", "What's measurable today instead?"]}
                  />
                  <ChartInfo id="bookingFunnel" />
                </div>
                <div className="mt-1.5 text-[15px] text-ink-dim">From first visit to a booked appointment</div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold">{pct(ws.convRate, 1)}</div>
                <Micro>visit → book</Micro>
              </div>
            </div>
            <ConversionFunnel steps={funnel} />
          </Card>

          <Card>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Micro>Website traffic vs bookings</Micro>
                  <AskAi
                    topic="Website traffic vs bookings"
                    topicId="webTraffic"
                    pending
                    suggestions={["What would web tracking tell me?", "What's measurable today instead?"]}
                  />
                  <ChartInfo id="webTraffic" />
                </div>
                <div className="mt-1.5 text-[22px] font-bold tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-[13px] text-ink-dim">visits</span></div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold">{ws.bookings.toLocaleString()}</div>
                <Micro>bookings</Micro>
              </div>
            </div>
            <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} height={228} />
            <div className="mt-3">
              <Legend items={[{ label: "Visits", color: "var(--color-series)" }, { label: "Became bookings", color: "#fe5100" }]} />
            </div>
          </Card>
        </div>
      </section>

      {/* Money */}
      <section>
        <SubHead
          eyebrow="Money · FranPOS"
          title="Revenue and mix"
          right={<Tag tone="good">Measurable now</Tag>}
        />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Micro>Revenue</Micro>
                  <AskAi
                    topic="Revenue and mix"
                    topicId="revenueTrend"
                    suggestions={[
                      "How is the grooming vs retail mix trending?",
                      "Which products drive retail revenue?",
                      "Where is retail attach weakest?",
                    ]}
                  />
                  <ChartInfo id="revenueTrend" />
                </div>
                <div className="mt-1.5 text-[22px] font-bold tracking-[-0.01em]">{fmtMoney(m.revenue)}</div>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">{period}</span>
            </div>
            <AreaChart data={series.revenue} labels={labels} format="moneyK" height={224} />
          </Card>

          <Card className="flex flex-col gap-5">
            <div>
              <div className="flex items-center gap-1.5">
                <Micro>Grooming &amp; retail mix</Micro>
                <AskAi
                  topic="Grooming & retail mix"
                  topicId="crossSellMix"
                  suggestions={[
                    "How is the cross-sell mix trending?",
                    "How do I move grooming-only into both?",
                  ]}
                />
                <ChartInfo id="crossSellMix" />
              </div>
              <div className="mt-4">
                <Donut
                  segments={[
                    { label: "Both", value: xs.both, color: "#fe5100" },
                    { label: "Grooming only", value: xs.groomingOnly, color: "var(--color-series)" },
                    { label: "Retail only", value: xs.retailOnly, color: "var(--color-series-soft)" },
                  ]}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-edge pt-5">
              <div>
                <Micro>Grooming</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-ink">{fmtMoney(m.grooming)}</div>
              </div>
              <div>
                <Micro>Retail</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-ink">{fmtMoney(m.retail)}</div>
              </div>
              <div>
                <Micro>Avg ticket</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-ink">{fmtMoney(m.avgTicket)}</div>
              </div>
              <div>
                <Micro>Retail attach</Micro>
                <div className="mt-1.5 font-mono text-[16px]" style={{ color: m.attach < 0.25 ? "#fe5100" : undefined }}>{pct(m.attach)}</div>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
