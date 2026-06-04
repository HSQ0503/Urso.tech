import Link from "next/link";
import { totals, leaks, actions, stores, funnel } from "@/components/dashboard/data";
import { Card, PageHeader, BigStat, Display, Micro, Tag, Meter, fmtMoney, pct } from "@/components/dashboard/ui";

export default function HomePage() {
  const topLeaks = leaks.slice(0, 3);

  return (
    <div className="animate-stage-in">
      <PageHeader
        eyebrow="Good morning · all four stores · last 30 days"
        title={
          <>
            You made <Display className="text-ink">{fmtMoney(totals.revenue, true)}</Display> — and left{" "}
            <Display className="text-orange" italic>
              {fmtMoney(totals.leak, true)}
            </Display>{" "}
            on the table.
          </>
        }
        sub="Here is the whole business at a glance. The orange numbers are money you can still get back."
      />

      {/* Hero stats */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-edge py-7 md:grid-cols-4">
        <BigStat label="Revenue" value={fmtMoney(totals.revenue, true)} delta={0.06} sub={`${pct(totals.groomingShare)} grooming · ${pct(1 - totals.groomingShare)} retail`} />
        <BigStat label="Recoverable / mo" value={fmtMoney(totals.leak, true)} delta={0.04} deltaInvert accent sub="across 6 leaks" />
        <BigStat label="Rebook rate" value={pct(totals.rebook)} delta={0.05} sub="booked again before leaving" />
        <BigStat label="No-show rate" value={pct(totals.noShow)} delta={-0.02} deltaInvert sub="booked but didn’t show" />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* Needs you today */}
        <Card pad={false}>
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div>
              <Micro>Needs you today</Micro>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">A few things only you can clear</h2>
            </div>
            <Tag tone="orange">{actions.length}</Tag>
          </div>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-edge px-5 py-3.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-orange-soft font-mono text-[11px] text-orange">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] leading-snug text-ink">{a.text}</div>
                <Micro className="mt-1 !text-ink-dimmer">{a.store}{a.value ? ` · ${a.value}` : ""}</Micro>
              </div>
              <button className="shrink-0 rounded-lg border border-edge-strong px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-white/[0.05]">
                {a.action}
              </button>
            </div>
          ))}
        </Card>

        {/* Biggest leaks */}
        <Card pad={false}>
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div>
              <Micro>Where it’s going</Micro>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">Your three biggest leaks</h2>
            </div>
            <Link href="/dashboard/leaks" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
              All leaks →
            </Link>
          </div>
          {topLeaks.map((l) => (
            <div key={l.rank} className="flex items-center gap-4 border-t border-edge px-5 py-4">
              <Display className="text-[22px] text-orange">{fmtMoney(l.amount, true)}</Display>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-ink">{l.name}</div>
                <Micro className="mt-0.5 !text-ink-dimmer">{l.scope}</Micro>
              </div>
              <Tag tone={l.status === "live" ? "good" : "orange"}>{l.status === "live" ? "Measurable" : "Needs setup"}</Tag>
            </div>
          ))}
          <div className="border-t border-edge px-5 py-3.5">
            <div className="flex items-baseline justify-between">
              <Micro>Total recoverable</Micro>
              <Display className="text-[20px] text-orange">{fmtMoney(totals.leak, true)}/mo</Display>
            </div>
          </div>
        </Card>
      </div>

      {/* Store snapshot */}
      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Micro>Your stores</Micro>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">How each location is doing</h2>
          </div>
          <Link href="/dashboard/stores" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            Compare stores →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s) => {
            const lag = s.id === "wm";
            return (
              <Card key={s.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{s.tier}</Micro>
                  </div>
                  {lag ? <Tag tone="orange">Watch</Tag> : <span className="font-mono text-[12px] text-ink-dim">{s.rating.toFixed(1)}★</span>}
                </div>
                <Display className="text-[30px] leading-none tracking-[-0.02em] text-ink">{fmtMoney(s.revenue, true)}</Display>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Rebook</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(s.rebook)}</span>
                  </div>
                  <Meter value={s.rebook} />
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <Micro>Leaking</Micro>
                  <span className="font-mono text-[13px] text-orange">−{fmtMoney(s.leak, true)}/mo</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Journey */}
      <section className="mt-8">
        <div className="mb-4">
          <Micro>The journey</Micro>
          <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.01em]">First click to final sale</h2>
        </div>
        <Card>
          <div className="flex items-end gap-2">
            {funnel.map((f, i) => {
              const prev = i > 0 ? funnel[i - 1].value : f.value;
              const drop = i > 0 ? 1 - f.value / prev : 0;
              return (
                <div key={f.stage} className="flex flex-1 flex-col">
                  <div
                    className="rounded-xl border px-3 py-4"
                    style={{
                      borderColor: f.dropLeak ? "rgba(254,81,0,0.3)" : "rgba(255,255,255,0.08)",
                      background: f.dropLeak ? "rgba(254,81,0,0.05)" : "rgba(255,255,255,0.015)",
                    }}
                  >
                    <Display className="text-[24px] leading-none text-ink">{f.value >= 1000 ? `${(f.value / 1000).toFixed(1)}k` : f.value}</Display>
                    <div className="mt-2 text-[13px] text-ink">{f.stage}</div>
                    <Micro className="mt-0.5 !text-ink-dimmer">{f.note}</Micro>
                  </div>
                  <div className={`mt-2 text-center font-mono text-[10px] ${f.dropLeak ? "text-orange" : "text-ink-dimmer"}`}>
                    {i > 0 ? `−${pct(drop)}` : "start"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
