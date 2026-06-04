"use client";

import { useState } from "react";
import Link from "next/link";
import {
  stores,
  totals,
  leaks,
  actions,
  getSeries,
  callStats,
  webStats,
  timeMeta,
  type StoreId,
  type Granularity,
  type Severity,
} from "@/components/dashboard/data";
import {
  Card,
  Micro,
  Tag,
  Delta,
  Meter,
  AreaChart,
  CallsBars,
  TrafficChart,
  Legend,
  Segmented,
  fmtMoney,
  pct,
} from "@/components/dashboard/ui";

const scopeOptions = [
  { value: "all" as const, label: "All stores" },
  { value: "wp" as const, label: "Winter Park" },
  { value: "wg" as const, label: "Winter Garden" },
  { value: "lv" as const, label: "Lakeside" },
  { value: "wm" as const, label: "Windermere" },
];

const granOptions: { value: Granularity; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const sevTone: Record<Severity, "orange" | "warn" | "muted"> = { High: "orange", Medium: "warn", Low: "muted" };

function kpisFor(scope: "all" | StoreId) {
  const s = scope === "all" ? null : stores.find((x) => x.id === scope)!;
  const cs = callStats(scope);
  return {
    revenue: s ? s.revenue : totals.revenue,
    bookings: s ? s.bookings : totals.bookings,
    avgTicket: s ? s.avgTicket : 89,
    rebook: s ? s.rebook : totals.rebook,
    noShow: s ? s.noShow : totals.noShow,
    answered: cs.answeredPct,
    rating: s ? s.rating : 4.48,
  };
}

export default function HomePage() {
  const [scope, setScope] = useState<"all" | StoreId>("all");
  const [gran, setGran] = useState<Granularity>("weekly");

  const series = getSeries(scope);
  const k = kpisFor(scope);
  const cs = callStats(scope);
  const ws = webStats(scope);
  const scopeLabel = scopeOptions.find((o) => o.value === scope)!.label;

  return (
    <div className="animate-stage-in">
      {/* Header */}
      <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Micro>Overview · {scopeLabel} · Last 30 days</Micro>
          <h1 className="mt-2.5 text-[clamp(26px,3.6vw,34px)] font-medium tracking-[-0.02em]">Performance overview</h1>
          <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-ink-dim">
            Revenue, demand and conversion across {scope === "all" ? "all four locations" : scopeLabel}.
          </p>
        </div>
        <Segmented options={scopeOptions} value={scope} onChange={setScope} />
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue" value={fmtMoney(k.revenue, true)} delta={0.06} />
        <Kpi label="Bookings" value={k.bookings.toLocaleString()} delta={0.03} />
        <Kpi label="Avg ticket" value={fmtMoney(k.avgTicket)} delta={0.02} />
        <Kpi label="Calls answered" value={pct(k.answered)} delta={0.04} />
        <Kpi label="Rebook rate" value={pct(k.rebook)} delta={0.05} />
        <Kpi label="No-show rate" value={pct(k.noShow)} delta={-0.02} deltaInvert />
      </section>

      {/* Revenue chart */}
      <Card className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Micro>Revenue</Micro>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-[22px] font-medium tracking-[-0.01em]">{fmtMoney(k.revenue, true)}</span>
              <Delta value={0.06} />
              <span className="text-[12px] text-ink-dim">{timeMeta[gran].caption}</span>
            </div>
          </div>
          <Segmented options={granOptions} value={gran} onChange={setGran} />
        </div>
        <AreaChart
          data={series.revenue[gran]}
          labels={timeMeta[gran].labels}
          valueFmt={(n) => `$${Math.round(n / 1000)}k`}
        />
      </Card>

      {/* Calls + Traffic */}
      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Micro>Inbound calls</Micro>
              <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{cs.total.toLocaleString()} <span className="text-[13px] text-ink-dim">calls</span></div>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-medium text-orange">{pct(cs.missedPct)}</div>
              <Micro>missed</Micro>
            </div>
          </div>
          <CallsBars labels={timeMeta.weekly.labels} total={series.callsTotal} missed={series.callsMissed} />
          <div className="mt-3 flex items-center justify-between">
            <Legend items={[{ label: "Answered", color: "rgba(255,255,255,0.3)" }, { label: "Missed", color: "#fe5100" }]} />
            <Tag tone="orange">Call tracking pending</Tag>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Micro>Website traffic vs bookings</Micro>
              <div className="mt-1.5 text-[22px] font-medium tracking-[-0.01em]">{ws.visits.toLocaleString()} <span className="text-[13px] text-ink-dim">visits</span></div>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-medium">{pct(ws.convRate, 1)}</div>
              <Micro>book online</Micro>
            </div>
          </div>
          <TrafficChart labels={timeMeta.weekly.labels} visits={series.webVisits} bookings={series.webBookings} />
          <div className="mt-3 flex items-center justify-between">
            <Legend items={[{ label: "Visits", color: "rgba(255,255,255,0.3)" }, { label: "New bookings", color: "#fe5100" }]} />
            <Tag tone="orange">Analytics pending</Tag>
          </div>
        </Card>
      </section>

      {/* Action items + Priority issues */}
      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card pad={false}>
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div>
              <Micro>Action items</Micro>
              <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Requires attention</h2>
            </div>
            <Tag tone="muted">{actions.length}</Tag>
          </div>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-edge px-5 py-3.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-edge-strong font-mono text-[10px] text-ink-dim">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-snug text-ink">{a.text}</div>
                <Micro className="mt-1 !text-ink-dimmer">{a.store}</Micro>
              </div>
              <button className="shrink-0 rounded-lg border border-edge-strong px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-white/[0.05]">
                {a.action}
              </button>
            </div>
          ))}
        </Card>

        <Card pad={false}>
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div>
              <Micro>Priority issues</Micro>
              <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Flagged for review</h2>
            </div>
            <Link href="/dashboard/leaks" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
              View all →
            </Link>
          </div>
          {leaks.slice(0, 4).map((l) => (
            <div key={l.rank} className="flex items-center gap-4 border-t border-edge px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-ink">{l.name}</div>
                <Micro className="mt-0.5 !text-ink-dimmer">{l.scope}</Micro>
              </div>
              <span className="shrink-0 font-mono text-[12px] text-ink-dim">{l.metric}</span>
              <Tag tone={sevTone[l.severity]}>{l.severity}</Tag>
            </div>
          ))}
        </Card>
      </section>

      {/* Store performance */}
      <section className="mt-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Micro>By location</Micro>
            <h2 className="mt-1.5 text-[17px] font-medium tracking-[-0.01em]">Store performance</h2>
          </div>
          <Link href="/dashboard/stores" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            Compare →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stores.map((s) => {
            const lag = s.id === "wm";
            const sc = callStats(s.id);
            return (
              <Card key={s.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14.5px] text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{s.tier}</Micro>
                  </div>
                  {lag ? <Tag tone="orange">Review</Tag> : <span className="font-mono text-[12px] text-ink-dim">{s.rating.toFixed(1)}★</span>}
                </div>
                <div className="text-[27px] font-medium leading-none tracking-[-0.02em]">{fmtMoney(s.revenue, true)}</div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Rebook</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(s.rebook)}</span>
                  </div>
                  <Meter value={s.rebook} />
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <Micro>Calls missed</Micro>
                  <span className="font-mono text-[12px]" style={{ color: sc.missedPct > 0.25 ? "#fe5100" : "rgba(255,255,255,0.58)" }}>{pct(sc.missedPct)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, delta, deltaInvert }: { label: string; value: string; delta: number; deltaInvert?: boolean }) {
  return (
    <div className="bg-bg p-4">
      <div className="flex items-center justify-between">
        <Micro>{label}</Micro>
        <Delta value={delta} invert={deltaInvert} />
      </div>
      <div className="mt-2.5 text-[24px] font-medium leading-none tracking-[-0.02em]">{value}</div>
    </div>
  );
}
