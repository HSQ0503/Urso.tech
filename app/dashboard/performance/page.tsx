import {
  calls,
  metrics,
  callStats,
  webStats,
  funnelData,
  crossSell,
  getSeries,
  seriesLabels,
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
  type Granularity,
} from "@/components/dashboard/data";
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
  DonutSplit,
  StackedShareBar,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";
import { AskAi } from "@/components/dashboard/ask-ai";
import { InfoTip } from "@/components/dashboard/info-tip";

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
  const gran: Granularity = month === "all" ? "monthly" : "daily";
  const labels = seriesLabels(month, gran);

  const m = metrics(scope, month);
  const cs = callStats(scope, month);
  const ws = webStats(scope, month);
  const series = getSeries(scope, month);
  const funnel = funnelData(scope, month);
  const xs = crossSell(scope, month);
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;
  const period = month === "all" ? "Last 12 months" : monthLabel(month);

  return (
    <div className="animate-stage-in space-y-12">
      <PageHeader
        eyebrow={`Diagnostics · ${scopeLabel(scope)} · ${period}`}
        title="Performance"
        sub="Where bookings and revenue are won and lost — capture, conversion and revenue mix. Pending sources need tracking enabled."
      />

      {/* Capture */}
      <section>
        <SubHead
          eyebrow="Capture · Twilio"
          title="Inbound call handling"
          right={
            <div className="flex items-center gap-2">
              <AskAi
                topic="Inbound call capture"
                pending
                read={`${pct(cs.missedPct)} of inbound calls ${here} go unanswered — ${cs.missed.toLocaleString()} of ${cs.total.toLocaleString()}. The misses cluster in the busy midday hours and after closing.`}
                points={["Every missed call is usually a booking that goes to a competitor.", "Call tracking isn't live yet — shaped like the Twilio feed."]}
                recommendation="Stand up the Twilio missed-call line so every unanswered call gets an instant text-back with a booking link."
              />
              <Tag tone="muted">Call tracking pending</Tag>
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
          <Card>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <Micro>Answered vs missed</Micro>
                <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-[13px] text-ink-dim">calls</span></div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-medium text-orange">{pct(cs.missedPct)}</div>
                <Micro>missed</Micro>
              </div>
            </div>
            <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} height={224} />
            <div className="mt-3">
              <Legend items={[{ label: "Answered", color: "rgba(255,255,255,0.3)" }, { label: "Missed", color: "#fe5100" }]} />
            </div>
          </Card>

          <Card className="flex flex-col">
            <Micro>Calls answered</Micro>
            <div className="mt-1 grid place-items-center">
              <RadialGauge value={cs.answeredPct} caption="answered" />
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge">
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

        <Card className="mt-5">
          <SubHead eyebrow="When calls are missed" title="Calls by hour, with after-hours band" />
          <CallsChart hourly={calls.hourly} missedHourly={calls.missedHourly} startHour={calls.startHour} closeHour={calls.closeHour} height={180} />
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
          right={
            <div className="flex items-center gap-2">
              <AskAi
                topic="Booking conversion"
                pending
                read={`Only ${pct(ws.convRate, 1)} of website visitors ${here} finish a booking. Most drop out inside the booking form itself, not before it.`}
                points={["The biggest single drop is between starting and completing the form.", "Web analytics aren't wired yet — shaped like the GA4 feed."]}
                recommendation="Ship a shorter, mobile-first booking form and A/B test it against the current one."
              />
              <Tag tone="muted">Analytics pending</Tag>
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <Micro>Online booking funnel</Micro>
                <div className="mt-1.5 text-[15px] text-ink-dim">From first visit to a booked appointment</div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-medium">{pct(ws.convRate, 1)}</div>
                <Micro>visit → book</Micro>
              </div>
            </div>
            <ConversionFunnel steps={funnel} />
          </Card>

          <Card>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <Micro>Website traffic vs bookings</Micro>
                <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-[13px] text-ink-dim">visits</span></div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-medium">{ws.bookings.toLocaleString()}</div>
                <Micro>bookings</Micro>
              </div>
            </div>
            <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} height={228} />
            <div className="mt-3">
              <Legend items={[{ label: "Visits", color: "rgba(255,255,255,0.3)" }, { label: "Became bookings", color: "#fe5100" }]} />
            </div>
          </Card>
        </div>
      </section>

      {/* Money */}
      <section>
        <SubHead
          eyebrow="Money · FranPOS"
          title="Revenue and mix"
          right={
            <div className="flex items-center gap-2">
              <AskAi
                topic="Revenue and mix"
                read={`Revenue ${here} is ${fmtMoney(m.revenue)}, with grooming about ${pct(m.groomingShare)} of the mix. Retail attaches to ${pct(m.attach)} of grooming visits.`}
                points={["Grooming is recurring, so retention compounds this line.", "Lifting retail attach is the simplest lever on average ticket."]}
                recommendation={m.attach < 0.25 ? "Attach is low — prompt a relevant add-on at checkout based on the pet's history." : "Hold attach where it is and protect rebooking — both defend recurring revenue."}
              />
              <Tag tone="good">Measurable now</Tag>
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <Micro>Revenue</Micro>
                <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{fmtMoney(m.revenue)}</div>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">{period}</span>
            </div>
            <AreaChart data={series.revenue[gran]} labels={labels} format="moneyK" height={224} />
          </Card>

          <Card className="flex flex-col gap-5">
            <div>
              <Micro>Revenue by line</Micro>
              <div className="mt-4">
                <DonutSplit a={m.grooming} b={m.retail} labelA="Grooming" labelB="Retail" />
              </div>
            </div>
            <div className="border-t border-edge pt-5">
              <div className="mb-3 flex items-center gap-1.5">
                <Micro>Customer overlap</Micro>
                <InfoTip text="Share of customers buying grooming, retail, or both. Customers who buy both spend materially more per visit, so the goal is moving grooming-only customers into 'both'." />
              </div>
              <StackedShareBar
                segments={[
                  { label: "Both", value: xs.both, color: "#fe5100" },
                  { label: "Grooming only", value: xs.groomingOnly, color: "rgba(255,255,255,0.26)" },
                  { label: "Retail only", value: xs.retailOnly, color: "rgba(255,255,255,0.13)" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-edge pt-5">
              <div>
                <Micro>Grooming</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-ink">{fmtMoney(m.grooming, true)}</div>
              </div>
              <div>
                <Micro>Retail</Micro>
                <div className="mt-1.5 font-mono text-[16px] text-ink">{fmtMoney(m.retail, true)}</div>
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
