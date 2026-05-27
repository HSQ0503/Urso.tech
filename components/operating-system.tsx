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
      "Local pack rank, map citations, schema parity — measured per store, compared across the portfolio.",
    bullets: [
      "Local pack rank tracking",
      "Citation audit per store",
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
    chartData: [
      40, 45, 48, 52, 50, 56, 60, 64, 60, 68, 72, 74, 78, 72, 70, 74, 78, 72,
      68, 66, 62, 58, 54, 52,
    ],
    highlight: (i) => i >= 9 && i <= 18,
    xAxis: ["Apr 1", "Apr 8", "Apr 15", "Apr 22", "Apr 29"],
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
    chartData: [
      20, 28, 35, 40, 38, 42, 50, 55, 48, 42, 38, 30, 25, 32, 40, 55, 72, 68,
      55, 40, 28, 22, 18, 14,
    ],
    highlight: (i) => i >= 17 || i < 8,
    xAxis: ["12am", "6am", "12pm", "6pm", "12am"],
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
    chartData: [
      30, 34, 38, 36, 44, 50, 54, 58, 56, 62, 66, 60, 68, 72, 70, 76, 78, 74,
      70, 64, 60, 56, 50, 46,
    ],
    highlight: (i) => i >= 12 && i <= 17,
    xAxis: ["W1", "W2", "W3", "W4", "W5"],
  },
  {
    key: "Retain",
    headline: "Measure repeat — per store, not in aggregate.",
    description:
      "Cohorted by first visit, measured per location. Which stores keep customers and which don't — and why.",
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
    chartData: [
      24, 28, 32, 34, 38, 40, 42, 46, 48, 50, 52, 56, 58, 60, 58, 62, 65, 62,
      60, 58, 55, 52, 48, 44,
    ],
    highlight: (i) => i >= 8 && i <= 17,
    xAxis: ["M1", "M2", "M3", "M4", "M5"],
  },
  {
    key: "Reputation",
    headline: "Reviews you respond to, by store.",
    description:
      "Star averages, response rate, time-to-respond. Where the bad ones cluster — and which stores ignore them.",
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
    chartData: [
      34, 38, 42, 44, 48, 50, 52, 54, 50, 58, 60, 62, 65, 68, 64, 70, 72, 68,
      65, 62, 58, 54, 50, 48,
    ],
    highlight: (i) => i >= 7 && i <= 17,
    xAxis: ["W1", "W2", "W3", "W4", "W5"],
  },
  {
    key: "Money",
    headline: "Revenue tied back to channel and store.",
    description:
      "What every channel actually made you, broken out per store. Attribution that survives audit.",
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
    chartData: [
      44, 48, 54, 50, 58, 60, 64, 68, 70, 72, 74, 70, 78, 80, 74, 82, 84, 80,
      76, 72, 70, 66, 62, 60,
    ],
    highlight: (i) => i >= 10 && i <= 16,
    xAxis: ["Jan", "Feb", "Mar", "Apr", "May"],
  },
];

export function OperatingSystem() {
  const [idx, setIdx] = useState(1);
  const active = tabs[idx];

  return (
    <section className="bg-bg px-14 py-24 text-ink">
      <div className="mb-14 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div className="max-w-[720px]">
          <Pill>The Operating System</Pill>
          <h2 className="mt-5 text-[64px] font-medium leading-none tracking-[-0.03em]">
            Six core panels.
            <br />
            <span className="text-ink-dim">
              One schema across every store.
            </span>
          </h2>
        </div>
        <p className="max-w-[360px] text-[15px] leading-[1.5] text-ink-dim">
          The dashboard&apos;s spine is the customer journey. Each stage is a
          panel, backed by a real source, filterable per store. The six below
          are the default — we build custom panels around whatever your
          business actually measures.
        </p>
      </div>

      <div
        className="relative grid border-y border-edge"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
              className={`group relative cursor-pointer py-[18px] text-center text-[14px] tracking-[-0.005em] transition-colors ${
                isActive ? "text-ink" : "text-ink-dim hover:text-ink"
              }`}
            >
              <span
                aria-hidden
                className={`mr-2 font-mono text-[10px] tracking-[0.12em] transition-colors ${
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

      <div className="grid grid-cols-1 border-b border-edge md:grid-cols-[440px_1fr]">
        <div key={`text-${idx}`} className="panel-fade-in py-12 md:pr-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-edge-strong bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            <span className="size-1.5 rounded-full bg-orange" />
            Panel {String(idx + 1).padStart(2, "0")} / 06
          </div>
          <h3 className="mt-5 text-[36px] font-medium leading-[1.05] tracking-[-0.025em]">
            {active.key}
            <span className="text-orange">.</span>
          </h3>
          <p className="mt-3 text-[17px] leading-[1.4] tracking-[-0.005em] text-ink">
            {active.headline}
          </p>
          <p className="mt-4 text-[14px] leading-[1.55] text-ink-dim">
            {active.description}
          </p>
          <div className="mt-7 grid gap-2.5">
            {active.bullets.map((b) => (
              <div key={b} className="flex items-center gap-2.5 text-[14px]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
          <div className="mt-9">
            <Button variant="ghost" icon={<ArrowRight />}>
              See the {active.key} spec
            </Button>
          </div>
        </div>

        <div className="relative grid place-items-center overflow-hidden border-l border-edge p-10">
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

      <div className="mt-12 grid grid-cols-1 gap-8 rounded-2xl border border-dashed border-edge-strong bg-panel/60 p-8 md:grid-cols-[1fr_auto] md:items-center md:gap-12">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
            <span className="size-1.5 rounded-full bg-orange" />
            Plus · custom
          </div>
          <h3 className="mt-4 text-[28px] font-medium leading-[1.15] tracking-[-0.02em]">
            Whatever your business actually measures.
          </h3>
          <p className="mt-3 max-w-[560px] text-[14px] leading-[1.55] text-ink-dim">
            The six panels above are the default. Every operator runs differently
            — we build the panels for the metrics that move your needle, on the
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
                className={`rounded-md border px-3 py-2 text-[13px] tracking-[-0.005em] ${
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
