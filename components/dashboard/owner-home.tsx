"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  stores,
  metrics,
  getSeries,
  callStats,
  webStats,
  seriesLabels,
  timeMeta,
  parseScope,
  parseMonth,
  scopeLabel,
  monthLabel,
  type Scope,
  type MonthValue,
  type Granularity,
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

const granOptions: { value: Granularity; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

// The single most important fix — what an AI layer will eventually generate
// from the live data. Deterministic here: the highest-scoring leak in scope.
function topAction(scope: Scope, month: MonthValue) {
  const cs = callStats(scope, month);
  const ws = webStats(scope, month);
  const m = metrics(scope, month);
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;
  const candidates = [
    {
      score: cs.missedPct,
      title: "Unanswered inbound calls are the largest capture leak",
      detail: `${pct(cs.missedPct)} of inbound calls went unanswered ${here}. Each unanswered call is a prospective booking that most often goes to a competitor instead.`,
      metric: `${pct(cs.missedPct)} of calls missed`,
      cta: "Review call capture",
      href: "/dashboard/performance",
      pending: true,
    },
    {
      score: 1 - m.rebook,
      title: "Rebooking is below the level where recurring revenue holds",
      detail: `Only ${pct(m.rebook)} of grooming customers ${here} rebook before leaving. Grooming is recurring revenue, so this is the most durable lever on long-term performance.`,
      metric: `${pct(m.rebook)} rebook rate`,
      cta: "See retention",
      href: "/dashboard/customers",
      pending: false,
    },
    {
      score: 1 - ws.convRate * 3.5,
      title: "Online booking abandonment is suppressing new bookings",
      detail: `${pct(1 - ws.convRate, 0)} of website visitors ${here} leave without booking. The drop is concentrated in the booking form — a shorter, mobile-first form recovers most of it.`,
      metric: `${pct(ws.convRate, 1)} book online`,
      cta: "Open the funnel",
      href: "/dashboard/performance",
      pending: true,
    },
  ];
  return candidates.sort((a, b) => b.score - a.score)[0];
}

export function OwnerHome({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = use(searchParams);
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const monthScoped = month !== "all";

  const [gran, setGran] = useState<Granularity>("monthly");
  const effGran: Granularity = monthScoped ? "daily" : gran;

  const m = metrics(scope, month);
  const cs = callStats(scope, month);
  const ws = webStats(scope, month);
  const series = getSeries(scope, month);
  const labels = seriesLabels(month, effGran);
  const action = topAction(scope, month);
  const periodLabel = monthScoped ? monthLabel(month) : "Last 12 months";

  return (
    <div className="animate-stage-in">
      <header className="mb-7">
        <Micro>Overview · {scopeLabel(scope)} · {periodLabel}</Micro>
        <h1 className="mt-2.5 text-[clamp(26px,3.6vw,34px)] font-medium tracking-[-0.02em]">Performance overview</h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-ink-dim">
          Revenue, demand and conversion {scope === "all" ? "across all four locations" : `for ${scopeLabel(scope)}`}. Use the store and month filters in the top bar to change this view.
        </p>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue" value={fmtMoney(m.revenue, true)} delta={0.06} />
        <Kpi label="Bookings" value={m.bookings.toLocaleString()} delta={0.03} />
        <Kpi label="Avg ticket" value={fmtMoney(m.avgTicket)} delta={0.02} />
        <Kpi label="Calls answered" value={pct(cs.answeredPct)} delta={0.04} />
        <Kpi label="Rebook rate" value={pct(m.rebook)} delta={0.05} />
        <Kpi label="No-show rate" value={pct(m.noShow)} delta={-0.02} deltaInvert />
      </section>

      {/* One action item + revenue */}
      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.25fr]">
        <Card className="relative flex flex-col overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(254,81,0,0.18), transparent 70%)" }}
          />
          <div className="relative flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange" />
            <Micro className="!text-orange">Action item · what to fix first</Micro>
          </div>
          <h2 className="relative mt-3 text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">{action.title}</h2>
          <p className="relative mt-2.5 text-[13.5px] leading-[1.6] text-ink-dim">{action.detail}</p>
          <div className="relative mt-auto flex items-center justify-between gap-3 pt-5">
            <div className="flex items-center gap-2">
              <Tag tone="orange">{action.metric}</Tag>
              {action.pending && <Tag tone="muted">Pending data</Tag>}
            </div>
            <Link
              href={action.href}
              className="shrink-0 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110"
            >
              {action.cta} →
            </Link>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Micro>Revenue</Micro>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="text-[22px] font-medium tracking-[-0.01em]">{fmtMoney(m.revenue, true)}</span>
                <Delta value={0.06} />
                <span className="text-[12px] text-ink-dim">{monthScoped ? monthLabel(month) : timeMeta[effGran].caption}</span>
              </div>
            </div>
            {!monthScoped && <Segmented options={granOptions} value={gran} onChange={setGran} />}
          </div>
          <AreaChart data={series.revenue[effGran]} labels={labels} valueFmt={(n) => `$${Math.round(n / 1000)}k`} height={224} />
        </Card>
      </section>

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
          <CallsBars labels={labels} total={series.callsTotal} missed={series.callsMissed} />
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
          <TrafficChart labels={labels} visits={series.webVisits} bookings={series.webBookings} />
          <div className="mt-3 flex items-center justify-between">
            <Legend items={[{ label: "Visits", color: "rgba(255,255,255,0.3)" }, { label: "New bookings", color: "#fe5100" }]} />
            <Tag tone="orange">Analytics pending</Tag>
          </div>
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
            const sm = metrics(s.id, month);
            const sc = callStats(s.id, month);
            const lag = s.id === "wm";
            return (
              <Card key={s.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14.5px] text-ink">{s.name}</div>
                    <Micro className="mt-0.5">{s.tier}</Micro>
                  </div>
                  {lag ? <Tag tone="orange">Review</Tag> : <span className="font-mono text-[12px] text-ink-dim">{s.rating.toFixed(1)}★</span>}
                </div>
                <div className="text-[27px] font-medium leading-none tracking-[-0.02em]">{fmtMoney(sm.revenue, true)}</div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Micro>Rebook</Micro>
                    <span className="font-mono text-[11px] text-ink-dim">{pct(sm.rebook)}</span>
                  </div>
                  <Meter value={sm.rebook} />
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
