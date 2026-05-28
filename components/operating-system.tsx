"use client";

import { useState } from "react";
import { Pill } from "./ui/pill";
import { Button } from "./ui/button";
import { ArrowRight } from "./ui/arrow-right";
import { Panel, type TabData } from "./operating-system/panel";

const tabs: TabData[] = [
  {
    key: "Findability",
    headline: "Show up when nearby customers search.",
    description:
      "Local pack rank, map citations, schema parity measured per store, compared across the portfolio.",
    bullets: [
      "Local pack rank tracking",
      "Citation diagnostic per store",
      "Schema / citation parity",
      "Per-store keyword file",
    ],
    metric: {
      label: "Local pack rank (avg)",
      value: "3.4",
      delta: "↑ 1.8 vs Q1",
      tone: "good",
    },
    legend: "Orange = top-3 days",
    footer: "+12 keywords / mo",
  },
  {
    key: "Capture",
    headline: "Stop bleeding leads to a missed phone.",
    description:
      "Track what the phone, the form and the after-hours line never logged. Instrumented data, not after-the-fact guesses.",
    bullets: [
      "Missed-call capture per store",
      "After-hours SMS callback",
      "Form abandons & dead links",
      "Per-store, per-hour breakdown",
    ],
    metric: {
      label: "Calls / day (rolling)",
      value: "142",
      delta: "↓ 38 missed",
      tone: "bad",
    },
    legend: "Orange = after-hours misses",
    footer: "~$4,180 / mo lost",
  },
  {
    key: "Convert",
    headline: "Turn lookers into bookings.",
    description:
      "Where the funnel narrows: form starts, drop-offs, time-to-confirm. Measured on every store's booking flow.",
    bullets: [
      "Funnel step instrumentation",
      "Time-to-confirm per store",
      "Field-level drop-off",
      "Booking conversion deltas",
    ],
    metric: {
      label: "Booking conversion",
      value: "4.8%",
      delta: "↑ 1.2pp last 30d",
      tone: "good",
    },
    legend: "Orange = confirmed bookings",
    footer: "+186 bookings / mo",
  },
  {
    key: "Retain",
    headline: "Measure repeat per store, not in aggregate.",
    description:
      "Cohorted by first visit, measured per location. Which stores keep customers and which don't and why.",
    bullets: [
      "Per-store cohort retention",
      "Repeat-rate by source",
      "Days-to-second-visit",
      "Churn early-warning signals",
    ],
    metric: {
      label: "60-day repeat rate",
      value: "31%",
      delta: "↑ 4pp vs Q1",
      tone: "good",
    },
    legend: "Orange = returning customers",
    footer: "1.4× LTV at top 25%",
  },
  {
    key: "Reputation",
    headline: "Reviews you respond to, by store.",
    description:
      "Star averages, response rate, time-to-respond. Where the bad ones cluster and which stores ignore them.",
    bullets: [
      "Per-store star average",
      "Response rate / SLA",
      "Sentiment clustering",
      "Review-to-revenue link",
    ],
    metric: {
      label: "Avg star rating",
      value: "4.6",
      delta: "↑ 0.3 vs Q1",
      tone: "good",
    },
    legend: "Orange = ★4+ reviews",
    footer: "82% response rate",
  },
  {
    key: "Money",
    headline: "Revenue tied back to channel and store.",
    description:
      "What every channel actually made you, broken out per store. Attribution that survives diagnostic.",
    bullets: [
      "Per-store channel revenue",
      "CAC by acquisition source",
      "Multi-touch attribution",
      "Margin per booking",
    ],
    metric: {
      label: "Monthly recurring revenue",
      value: "$184k",
      delta: "↑ 9% MoM",
      tone: "good",
    },
    legend: "Orange = high-margin channel",
    footer: "+$22k / mo top 25%",
  },
];

export function OperatingSystem() {
  const [idx, setIdx] = useState(1);
  const active = tabs[idx];

  return (
    <section className="bg-bg px-5 py-16 text-ink sm:px-8 sm:py-20 md:px-14 md:py-24">
      <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:mb-14 sm:gap-8 md:flex-row md:items-end">
        <div className="max-w-[720px]">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em]">
            <span className="text-orange">Step 01</span>
            <span className="ml-2 text-ink-dimmer">See</span>
          </div>
          <Pill>The AI Operating System</Pill>
          <h2 className="mt-4 text-[clamp(34px,7.5vw,64px)] font-medium leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:leading-none">
            An operating system<span className="text-orange">.</span>
            <br />
            <span className="text-ink-dim">
              For every store you run.
            </span>
          </h2>
        </div>
        <p className="max-w-[360px] text-[14px] leading-[1.5] text-ink-dim sm:text-[15px]">
          One dashboard, every store. The six panels below are where we
          start we add views for whatever your business measures.
        </p>
      </div>

      <div className="no-scrollbar relative -mx-5 overflow-x-auto border-y border-edge sm:-mx-8 md:mx-0">
        <div
          className="relative grid min-w-max md:min-w-0"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(120px, 1fr))` }}
        >
          <div
            aria-hidden
            className="absolute bottom-[-1px] left-0 h-[2px] bg-orange"
            style={{
              width: `calc(100% / ${tabs.length})`,
              transform: `translateX(${idx * 100}%)`,
              transition: "transform .55s cubic-bezier(0.16,1,0.3,1)",
              boxShadow: "0 0 14px rgba(254,81,0,0.55)",
            }}
          />
          {tabs.map((t, i) => {
            const isActive = i === idx;
            return (
              <button
                key={t.key}
                onClick={() => setIdx(i)}
                className={`group relative cursor-pointer px-3 py-[14px] text-center text-[13px] tracking-[-0.005em] transition-colors sm:py-[18px] sm:text-[14px] ${
                  isActive ? "text-ink" : "text-ink-dim hover:text-ink"
                }`}
              >
                <span
                  aria-hidden
                  className={`mr-1.5 font-mono text-[10px] tracking-[0.12em] transition-colors sm:mr-2 ${
                    isActive ? "text-orange" : "text-ink-dimmer"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {t.key}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 border-b border-edge md:grid-cols-[440px_1fr]">
        <div key={`text-${idx}`} className="panel-fade-in py-8 sm:py-12 md:pr-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-edge-strong bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            <span className="size-1.5 rounded-full bg-orange" />
            Panel {String(idx + 1).padStart(2, "0")} / 06
          </div>
          <h3 className="mt-4 text-[clamp(28px,6vw,36px)] font-medium leading-[1.05] tracking-[-0.025em] sm:mt-5">
            {active.key}
            <span className="text-orange">.</span>
          </h3>
          <p className="mt-3 text-[15px] leading-[1.4] tracking-[-0.005em] text-ink sm:text-[17px]">
            {active.headline}
          </p>
          <p className="mt-4 text-[13.5px] leading-[1.55] text-ink-dim sm:text-[14px]">
            {active.description}
          </p>
          <div className="mt-6 grid gap-2.5 sm:mt-7">
            {active.bullets.map((b) => (
              <div key={b} className="flex items-center gap-2.5 text-[13.5px] sm:text-[14px]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none">
                  <path
                    d="M3 7l3 3 5-6"
                    stroke="#FE5100"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {b}
              </div>
            ))}
          </div>
          <div className="mt-7 sm:mt-9">
            <Button variant="ghost" icon={<ArrowRight />}>
              See the {active.key} spec
            </Button>
          </div>
        </div>

        <div className="relative grid place-items-center overflow-hidden border-t border-edge p-5 sm:p-8 md:border-l md:border-t-0 md:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 55% 70% at 65% 50%, rgba(254,81,0,0.08), transparent 70%)",
            }}
          />
          <Panel key={idx} tab={active} />
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 rounded-2xl border border-dashed border-edge-strong bg-panel/60 p-6 sm:mt-12 sm:gap-8 sm:p-8 md:grid-cols-[1fr_auto] md:items-center md:gap-12">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
            <span className="size-1.5 rounded-full bg-orange" />
            Plus · custom
          </div>
          <h3 className="mt-3 text-[clamp(22px,4.5vw,28px)] font-medium leading-[1.15] tracking-[-0.02em] sm:mt-4">
            Whatever your business actually measures.
          </h3>
          <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.55] text-ink-dim sm:text-[14px]">
            The six panels above are the default. Every operator runs differently
            we build the panels for the metrics that move your needle, on the
            same per-store schema.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:max-w-[420px]">
          {[
            "Inventory turnover",
            "Supplier scorecards",
            "Field-team SLAs",
            "Labor cost / shift",
            "Ticket flow",
            "Your KPI here",
          ].map((label, i) => {
            const last = i === 5;
            return (
              <div
                key={label}
                className={`rounded-md border px-3 py-2 text-[12.5px] tracking-[-0.005em] sm:text-[13px] ${
                  last
                    ? "border-dashed border-orange/50 text-orange"
                    : "border-edge text-ink-dim"
                }`}
              >
                {last ? "+ " : ""}
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
