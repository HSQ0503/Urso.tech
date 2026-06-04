import { stores, totals, calls, web, grooming } from "@/components/dashboard/data";
import {
  Card,
  PageHeader,
  Display,
  Micro,
  Tag,
  Meter,
  DonutSplit,
  StackedArea,
  CallsChart,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";

function SubHead({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <Micro>{eyebrow}</Micro>
        <h2 className="mt-1.5 text-[19px] font-medium tracking-[-0.01em]">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-edge bg-white/[0.015] px-3.5 py-3">
      <Micro>{label}</Micro>
      <div className={`mt-1.5 font-mono text-[17px] ${accent ? "text-orange" : "text-ink"}`}>{value}</div>
    </div>
  );
}

export default function StoresPage() {
  return (
    <div className="animate-stage-in space-y-12">
      <div>
        <PageHeader
          eyebrow="All four stores · last 30 days"
          title="Your four stores, side by side."
          sub="Every number means the same thing across all four — so you can tell a real difference from a measurement quirk. Windermere is the one to watch."
        />

        {/* Comparison table */}
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                  {["Store", "Revenue", "Bookings", "No-show", "Rebook", "Attach", "Rating", "Leak/mo"].map((h) => (
                    <th key={h} className={`px-5 py-3 font-normal ${h === "Store" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const lag = s.id === "wm";
                  return (
                    <tr key={s.id} className="border-t border-edge transition-colors hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{s.name}</span>
                          {lag && <Tag tone="orange">Watch</Tag>}
                        </div>
                        <Micro className="mt-0.5">{s.tier}</Micro>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink">{fmtMoney(s.revenue, true)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{s.bookings}</td>
                      <td className="px-5 py-3.5 text-right font-mono" style={{ color: s.noShow > 0.1 ? "#fe5100" : undefined }}>{pct(s.noShow)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="ml-auto flex w-[96px] items-center gap-2">
                          <Meter value={s.rebook} />
                          <span className="font-mono text-ink-dim">{pct(s.rebook)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{pct(s.attach)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink-dim">{s.rating.toFixed(1)}★</td>
                      <td className="px-5 py-3.5 text-right font-mono text-orange">{fmtMoney(s.leak, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Calls + Bookings */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div>
          <SubHead eyebrow="Capture · Twilio (pending)" title="The phone after you close" right={<Tag tone="orange">Twilio pending</Tag>} />
          <Card>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <MiniStat label="Calls / day" value={String(calls.perDay)} />
              <MiniStat label="Missed" value={pct(calls.missedPct)} accent />
              <MiniStat label="After-hours / mo" value={`${fmtMoney(calls.afterMissValue, true)}`} accent />
            </div>
            <CallsChart hourly={calls.hourly} missedHourly={calls.missedHourly} startHour={calls.startHour} closeHour={calls.closeHour} />
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[rgba(254,81,0,0.25)] bg-orange-wash px-4 py-3">
              <span className="text-[13px] text-ink">
                Recovery: <span className="font-mono">{calls.recovery.texted}</span> texted back ·{" "}
                <span className="font-mono text-orange">{calls.recovery.booked}</span> booked
              </span>
              <Micro className="!text-ink-dimmer">your proof number</Micro>
            </div>
          </Card>
        </div>

        <div>
          <SubHead eyebrow="Convert · FranPOS + web" title="Booking → showed → sold" right={<Tag>FranPOS</Tag>} />
          <Card>
            <div className="mb-5 grid grid-cols-3 gap-3">
              <MiniStat label="Booking → show" value="91%" />
              <MiniStat label="Capacity used" value="78%" />
              <MiniStat label="Cancels" value="4%" accent />
            </div>
            <div className="flex items-center justify-between">
              <Micro>Web booking funnel</Micro>
              <Tag tone="orange">Analytics pending</Tag>
            </div>
            <div className="mt-3 space-y-2.5">
              {[
                ["Visited site", web.visits, false],
                ["Started form", web.formStart, false],
                ["Completed form", web.formComplete, true],
                ["Booked", web.booked, false],
              ].map(([label, value, leak]) => (
                <div key={label as string} className="flex items-center gap-3">
                  <span className="w-[110px] text-[13px] text-ink-dim">{label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
                    <div
                      className="flex h-full items-center justify-end rounded-md px-2"
                      style={{ width: `${((value as number) / web.visits) * 100}%`, background: leak ? "rgba(254,81,0,0.35)" : "rgba(255,255,255,0.12)" }}
                    >
                      <span className="font-mono text-[11px] text-ink">{(value as number).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-ink-dim">
              <span className="text-orange">{pct(web.abandonRate)}</span> who start the form never finish it.
            </p>
          </Card>
        </div>
      </section>

      {/* Revenue mix */}
      <section>
        <SubHead eyebrow="Money · FranPOS order items" title="Grooming vs retail" />
        <Card>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex flex-col gap-5">
              <DonutSplit a={totals.groomingShare} b={1 - totals.groomingShare} labelA="Grooming" labelB="Retail" />
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Attach rate" value={pct(grooming.attach)} />
                <MiniStat label="Avg service" value={fmtMoney(grooming.avgService)} />
                <MiniStat label="+ retail ticket" value={fmtMoney(grooming.avgTicketWithRetail)} accent />
              </div>
            </div>
            <div className="border-t border-edge pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <Micro className="mb-3">Grooming (orange) vs retail — last six months</Micro>
              <StackedArea data={grooming.byMonth} />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
