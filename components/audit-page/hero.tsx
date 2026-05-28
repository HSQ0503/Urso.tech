"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import { ArrowRight } from "@/components/ui/arrow-right";
import "./hero.css";

// ---- Timeline ----------------------------------------------------------

type BeatKey =
  | "missed"
  | "search"
  | "reviews"
  | "ads"
  | "ops"
  | "money"
  | "final";

type Beat = {
  key: BeatKey;
  at: number;
  tag: string;
  headline: ReactNode;
  sub: string | null;
};

const BEATS: Beat[] = [
  {
    key: "missed",
    at: 700,
    tag: "01 · Capture",
    headline: (
      <>
        No more missed calls<span className="text-orange">.</span>
      </>
    ),
    sub: "Every after-hours ring answered — by SMS, instantly.",
  },
  {
    key: "search",
    at: 3900,
    tag: "02 · Findability",
    headline: (
      <>
        First on Google. First on AI<span className="text-orange">.</span>
      </>
    ),
    sub: "Engineered to be the answer, not just a result.",
  },
  {
    key: "reviews",
    at: 7100,
    tag: "03 · Reputation",
    headline: (
      <>
        Every review, answered<span className="text-orange">.</span>
      </>
    ),
    sub: "Drafted in your voice. Approved by you. Sent in minutes.",
  },
  {
    key: "ads",
    at: 10300,
    tag: "04 · Growth",
    headline: (
      <>
        Ad spend, run by the numbers<span className="text-orange">.</span>
      </>
    ),
    sub: "Every campaign measured against real revenue — scaled, paused, or rewritten before money is wasted.",
  },
  {
    key: "ops",
    at: 13500,
    tag: "05 · Operations",
    headline: (
      <>
        Operations on autopilot<span className="text-orange">.</span>
      </>
    ),
    sub: "Schedules, inventory, vendors, comms — handled by AI agents, audited by you.",
  },
  {
    key: "money",
    at: 16700,
    tag: "06 · Money",
    headline: (
      <>
        Every dollar, traced<span className="text-orange">.</span>
      </>
    ),
    sub: "Channel-by-channel attribution. Audit-grade numbers.",
  },
  {
    key: "final",
    at: 19900,
    tag: "The audit",
    headline: (
      <>
        Fortune-500 analytics<span className="text-orange">.</span>
        <br />
        For your business.
      </>
    ),
    sub: "Every system aggregated, every signal surfaced — so every decision you make is backed by data.",
  },
];

const TOTAL_MS = BEATS[BEATS.length - 1].at;

// ---- Hero --------------------------------------------------------------

export function AuditHero() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      // Reduced-motion path: snap to final beat. setState-in-effect is the
      // right shape here — we're reading a client-only media query.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(TOTAL_MS);
      return;
    }
    const timers = BEATS.map((b) =>
      window.setTimeout(() => setElapsed(b.at), b.at),
    );
    return () => timers.forEach(window.clearTimeout);
  }, []);

  const activeIndex = (() => {
    let i = 0;
    for (let k = 0; k < BEATS.length; k++) if (elapsed >= BEATS[k].at) i = k;
    return elapsed >= BEATS[0].at ? i : -1;
  })();

  const active = activeIndex >= 0 ? BEATS[activeIndex] : null;
  const isFinal = active?.key === "final";

  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-20 sm:px-8 sm:pb-24 sm:pt-24 md:px-14 md:pb-28 md:pt-28">
      <Link
        href="/"
        className="absolute left-5 top-5 z-10 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dimmer transition-colors hover:text-ink-dim sm:left-8 sm:top-8"
      >
        ← back
      </Link>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(254,81,0,0.08), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-[1080px] grid-cols-1 items-center gap-12 md:grid-cols-[1fr_auto] md:gap-16">
        {/* Left column: rotating headline */}
        <div className="text-center md:text-left">
          <div className="h-[20px]">
            {active && (
              <div
                key={`tag-${active.key}`}
                className="audit-fade-up-sm inline-block"
              >
                <Pill dot dotColor="#FE5100">
                  {active.tag}
                </Pill>
              </div>
            )}
          </div>

          <div className="relative mt-6 min-h-[180px] sm:min-h-[210px] md:min-h-[240px]">
            {active && (
              <h1
                key={`h-${active.key}`}
                className="audit-fade-up text-[clamp(36px,7.5vw,68px)] font-medium leading-[0.98] tracking-[-0.04em]"
              >
                {active.headline}
              </h1>
            )}
          </div>

          <div className="relative mt-5 min-h-[60px] max-w-[460px] sm:mt-6 sm:min-h-[52px] md:max-w-[480px]">
            {active?.sub && (
              <p
                key={`s-${active.key}`}
                className="audit-fade-up text-[15px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[17px]"
              >
                {active.sub}
              </p>
            )}
          </div>

          <div className="mt-8 flex justify-center md:justify-start">
            {isFinal && (
              <a
                href="#request-an-audit"
                data-audit-hero-cta
                className="audit-fade-up group inline-flex items-center gap-2 rounded-lg border border-transparent bg-orange px-[22px] py-[14px] font-sans text-[15px] font-medium tracking-[-0.005em] text-white shadow-[0_8px_28px_rgba(254,81,0,0.35)] transition-[filter,box-shadow] hover:brightness-110"
              >
                Request an audit
                <ArrowRight />
              </a>
            )}
          </div>

          {/* Beat dots — show progress through the reel */}
          <div className="mt-10 flex items-center justify-center gap-1.5 md:justify-start">
            {BEATS.map((b, i) => {
              const seen = activeIndex >= i;
              const current = activeIndex === i;
              return (
                <span
                  key={b.key}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    current
                      ? "w-6 bg-orange"
                      : seen
                        ? "w-1.5 bg-orange/60"
                        : "w-1.5 bg-edge-strong"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Right column: phone */}
        <div className="audit-phone-in flex justify-center md:justify-end">
          <Phone beat={active?.key ?? null} />
        </div>
      </div>
    </section>
  );
}

// ---- Phone shell -------------------------------------------------------

function Phone({ beat }: { beat: BeatKey | null }) {
  const time =
    beat === "missed"
      ? "11:42"
      : beat === "search"
        ? "9:14"
        : beat === "reviews"
          ? "1:30"
          : beat === "ads"
            ? "3:42"
            : beat === "ops"
              ? "5:18"
              : beat === "money"
                ? "7:00"
                : beat === "final"
                  ? "9:00"
                  : "";
  const jitter = beat === "missed";

  return (
    <div
      className={`relative h-[460px] w-[230px] overflow-hidden rounded-[42px] border border-edge bg-[#0a0a0a] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85),inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:h-[520px] sm:w-[260px] ${
        jitter ? "audit-phone-jitter" : ""
      }`}
    >
      {/* Notch */}
      <div className="absolute left-1/2 top-2 z-20 h-[18px] w-[80px] -translate-x-1/2 rounded-full bg-black" />

      {/* Screen */}
      <div className="absolute inset-[5px] overflow-hidden rounded-[38px] bg-gradient-to-b from-[#0f0f0f] to-[#040404]">
        {/* Status bar (only when there's a meaningful time) */}
        <div className="flex items-center justify-between px-5 pt-3 font-mono text-[10px] text-white/65">
          <span>{time}</span>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            <span className="h-1.5 w-2.5 rounded-sm bg-white/40" />
          </div>
        </div>

        {/* Scene */}
        <div className="absolute inset-x-0 bottom-0 top-[34px]">
          {beat === "missed" && <MissedScene key="missed" />}
          {beat === "search" && <SearchScene key="search" />}
          {beat === "reviews" && <ReviewsScene key="reviews" />}
          {beat === "ads" && <AdsScene key="ads" />}
          {beat === "ops" && <OpsScene key="ops" />}
          {beat === "money" && <MoneyScene key="money" />}
          {beat === "final" && <FinalScene key="final" />}
        </div>
      </div>
    </div>
  );
}

// ---- Scene 1: Missed call → auto-replied -------------------------------

function MissedScene() {
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setResolved(true), 1600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col">
      {!resolved && (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
            incoming call
          </div>
          <div className="audit-ring-pulse mt-6 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <PhoneIcon />
          </div>
          <div className="mt-5 font-sans text-[15px] font-medium text-white">
            Unknown
          </div>
          <div className="mt-0.5 font-sans text-[12px] text-white/55">
            (407) 555-0142
          </div>
        </div>
      )}

      {resolved && (
        <div className="audit-screen-in flex flex-1 flex-col px-3 pt-4 pb-4">
          <div className="text-center font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
            messages · 11:43 PM
          </div>

          {/* Outbound SMS bubble */}
          <div className="mt-4 flex justify-end">
            <div className="audit-fade-up-sm max-w-[180px] rounded-[14px] rounded-br-[4px] bg-orange px-3 py-2 text-left font-sans text-[12px] leading-[1.35] text-white">
              Sorry we missed you! Tap to grab a time —
              <br />
              <span className="underline">urso.co/b/9k2</span>
            </div>
          </div>

          {/* Read + status row */}
          <div
            className="audit-fade-up-sm mt-2 flex items-center justify-end gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-400"
            style={{ animationDelay: "180ms" }}
          >
            <CheckIcon />
            sent · read 11:44
          </div>

          {/* Inbound reply preview */}
          <div
            className="audit-fade-up-sm mt-3 flex justify-start"
            style={{ animationDelay: "320ms" }}
          >
            <div className="max-w-[160px] rounded-[14px] rounded-bl-[4px] bg-white/[0.08] px-3 py-2 text-left font-sans text-[12px] leading-[1.35] text-white/90">
              Booked Sat 7pm 🙏
            </div>
          </div>

          <div className="mt-auto text-center font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">
            auto-handled · 12 sec
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Scene 2: AI search / map rank -------------------------------------

function SearchScene() {
  const [typed, setTyped] = useState(0);
  const query = "best near me";
  useEffect(() => {
    const id = window.setInterval(() => {
      setTyped((t) => (t >= query.length ? t : t + 1));
    }, 95);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col px-3 pt-3">
      {/* Search bar */}
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
        <SearchIcon />
        <div className="flex-1 text-left font-sans text-[12px] text-white/85">
          {query.slice(0, typed)}
          {typed < query.length && <span className="audit-caret" />}
        </div>
      </div>

      {/* AI answer card */}
      <div
        className="audit-fade-up-sm mt-3 rounded-xl border border-orange/40 bg-orange/[0.06] p-3 text-left"
        style={{ animationDelay: "750ms" }}
      >
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-orange">
          <SparkleIcon />
          ai recommended
        </div>
        <div className="mt-1.5 font-sans text-[13px] font-medium text-white">
          Stonefire & Co. — Orlando
        </div>
        <p className="mt-1 font-sans text-[10.5px] leading-[1.4] text-white/70">
          Highest-rated in the area for craft service. Open until 10pm.
        </p>
      </div>

      {/* Map result */}
      <div
        className="audit-fade-up-sm mt-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-left"
        style={{ animationDelay: "1050ms" }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
          <PinIcon />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-sans text-[12px] font-medium text-white">
              Stonefire & Co.
            </span>
            <span className="rounded-sm bg-orange/20 px-1 font-mono text-[8px] uppercase tracking-[0.1em] text-orange">
              #1
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 font-sans text-[10px] text-white/55">
            <span className="text-orange">★ 4.8</span>
            <span>· 0.4 mi · Open</span>
          </div>
        </div>
      </div>

      <div
        className="audit-fade-up-sm mt-2 flex items-center gap-2.5 rounded-xl bg-white/[0.02] p-2.5 text-left opacity-60"
        style={{ animationDelay: "1300ms" }}
      >
        <div className="h-8 w-8 shrink-0 rounded-md bg-white/[0.06]" />
        <div className="flex-1">
          <div className="font-sans text-[12px] text-white/65">
            Competitor — 1.2 mi
          </div>
          <div className="mt-0.5 font-sans text-[10px] text-white/40">
            ★ 4.1 · Closed
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Scene 3: Reviews ----------------------------------------------------

function ReviewsScene() {
  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col gap-2 px-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">
          reviews · today
        </div>
        <div className="font-mono text-[9px] text-emerald-400">100%</div>
      </div>

      <ReviewCard
        stars={1}
        body={'"Nobody picked up Sat night."'}
        status="Responded · 4m"
        delay={0}
      />
      <ReviewCard
        stars={5}
        body={'"Best service in town."'}
        status="Thanked · 7m"
        delay={280}
      />
      <ReviewCard
        stars={3}
        body={'"Wait was a little long."'}
        status="Responded · 12m"
        delay={560}
      />
    </div>
  );
}

function ReviewCard({
  stars,
  body,
  status,
  delay,
}: {
  stars: number;
  body: string;
  status: string;
  delay: number;
}) {
  return (
    <div
      className="audit-fade-up-sm rounded-xl border border-white/8 bg-white/[0.03] p-2.5 text-left"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 text-orange">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon key={i} dim={i >= stars} />
          ))}
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-400">
          ✓ {status}
        </span>
      </div>
      <p className="mt-1 font-sans text-[11px] leading-[1.35] text-white/80">
        {body}
      </p>
    </div>
  );
}

// ---- Scene 4: Ads / growth ---------------------------------------------

type Segment = {
  pct: number;
  color: string;
  name: string;
  roas: string;
};

const ADS_INITIAL: Segment[] = [
  { pct: 25, color: "bg-emerald-400", name: "After-hours", roas: "4.8×" },
  { pct: 25, color: "bg-sky-400", name: "Branded", roas: "6.1×" },
  { pct: 25, color: "bg-orange", name: "Local maps", roas: "3.9×" },
  { pct: 25, color: "bg-rose-500/60", name: "Cold lookalike", roas: "1.2×" },
];

const ADS_REBALANCED: Segment[] = [
  { pct: 42, color: "bg-emerald-400", name: "After-hours", roas: "4.8×" },
  { pct: 28, color: "bg-sky-400", name: "Branded", roas: "6.1×" },
  { pct: 22, color: "bg-orange", name: "Local maps", roas: "3.9×" },
  { pct: 8, color: "bg-rose-500/60", name: "Cold lookalike", roas: "1.2×" },
];

function AdsScene() {
  const [allocated, setAllocated] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setAllocated(true), 650);
    const t2 = window.setTimeout(() => setShowDecisions(true), 1700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const segments = allocated ? ADS_REBALANCED : ADS_INITIAL;

  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col px-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">
          ad spend · live
        </div>
        <div className="font-mono text-[9px] text-emerald-400">
          auto-rebalanced
        </div>
      </div>

      {/* Hero KPI */}
      <div className="mt-3 flex items-baseline gap-2 text-left">
        <span className="font-sans text-[26px] font-medium leading-none tabular-nums text-white">
          3.4×
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-400">
          ↑ portfolio ROAS
        </span>
      </div>
      <div className="text-left font-sans text-[10px] text-white/55">
        $4,000 / day across 4 channels
      </div>

      {/* Allocation bar — animates from even split to weighted */}
      <div className="mt-4 flex h-8 w-full overflow-hidden rounded-md border border-white/10 bg-white/[0.03]">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`${s.color} h-full`}
            style={{
              width: `${s.pct}%`,
              transition: "width 1.3s cubic-bezier(0.65, 0, 0.35, 1)",
            }}
          />
        ))}
      </div>

      {/* Channel legend */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-left">
        {segments.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-sm ${s.color}`} />
            <span className="truncate font-sans text-[10px] text-white/75">
              {s.name}
            </span>
            <span className="ml-auto font-mono text-[9px] tabular-nums text-white/40">
              {s.roas}
            </span>
          </div>
        ))}
      </div>

      {/* Decision pills — land after the bar rebalances */}
      <div className="mt-auto flex flex-col gap-1.5 pb-3">
        {showDecisions && (
          <>
            <div className="audit-fade-up-sm flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1.5 text-left">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-rose-500/30 font-mono text-[10px] text-rose-200">
                ✗
              </span>
              <span className="font-sans text-[10.5px] font-medium text-white">
                Paused
              </span>
              <span className="font-sans text-[10px] text-white/55">
                Cold Lookalike
              </span>
              <span className="ml-auto font-mono text-[9.5px] tabular-nums text-rose-300">
                saves $1.1k/wk
              </span>
            </div>
            <div
              className="audit-fade-up-sm flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-left"
              style={{ animationDelay: "180ms" }}
            >
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-emerald-500/30 font-mono text-[10px] text-emerald-200">
                ↑
              </span>
              <span className="font-sans text-[10.5px] font-medium text-white">
                Scaled +40%
              </span>
              <span className="font-sans text-[10px] text-white/55">
                After-hours
              </span>
              <span className="ml-auto font-mono text-[9.5px] tabular-nums text-emerald-300">
                +$3.2k/wk
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Scene 5: Operations -----------------------------------------------

type TaskState = "pending" | "working" | "done" | "flagged";

type OpsTask = {
  icon: ReactNode;
  tint: string;
  title: string;
  doneDetail: string;
  pendingDetail: string;
};

const OPS_TASKS: OpsTask[] = [
  {
    icon: <BoxIcon />,
    tint: "text-emerald-400",
    title: "Reorder · Store 3",
    pendingDetail: "Patties · 12 cases",
    doneDetail: "Sent to Sysco · 11:42",
  },
  {
    icon: <CalendarIcon />,
    tint: "text-sky-400",
    title: "Schedule swap",
    pendingDetail: "Tue 7pm · Maria → Jen",
    doneDetail: "Both notified · synced",
  },
  {
    icon: <DocIcon />,
    tint: "text-violet-400",
    title: "Vendor invoice",
    pendingDetail: "Acme Supply · $1,240",
    doneDetail: "Paid · matched to PO",
  },
  {
    icon: <AlertIcon />,
    tint: "text-orange",
    title: "Cooler · Store 7",
    pendingDetail: "38°F · checking…",
    doneDetail: "Escalated to manager",
  },
];

const OPS_SCHEDULE: { i: number; at: number; state: TaskState }[] = [
  { i: 0, at: 250, state: "working" },
  { i: 1, at: 500, state: "working" },
  { i: 0, at: 850, state: "done" },
  { i: 2, at: 950, state: "working" },
  { i: 1, at: 1200, state: "done" },
  { i: 3, at: 1400, state: "working" },
  { i: 2, at: 1650, state: "done" },
  { i: 3, at: 2100, state: "flagged" },
];

const OPS_COUNTER_TICKS = [
  { at: 850, value: 16 },
  { at: 1200, value: 9 },
  { at: 1650, value: 3 },
  { at: 2100, value: 1 },
];

function OpsScene() {
  const [states, setStates] = useState<TaskState[]>([
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
  const [count, setCount] = useState(23);

  useEffect(() => {
    const stateTimers = OPS_SCHEDULE.map((s) =>
      window.setTimeout(() => {
        setStates((prev) => {
          const next = [...prev];
          next[s.i] = s.state;
          return next;
        });
      }, s.at),
    );
    const countTimers = OPS_COUNTER_TICKS.map((c) =>
      window.setTimeout(() => setCount(c.value), c.at),
    );
    return () => {
      stateTimers.forEach(window.clearTimeout);
      countTimers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col px-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">
          ops queue · today
        </div>
        <div className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
          <span className="audit-spin h-2 w-2 rounded-full border border-white/15 border-t-emerald-400" />
          agent live
        </div>
      </div>

      {/* Big counter */}
      <div className="mt-3 flex items-baseline gap-2 text-left">
        <span className="font-sans text-[26px] font-medium leading-none tabular-nums text-white transition-all duration-300">
          {count}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/40">
          {count === 1 ? "needs your eyes" : "tasks remaining"}
        </span>
      </div>

      {/* Task rows */}
      <div className="mt-3 flex flex-col gap-1.5">
        {OPS_TASKS.map((t, i) => (
          <TaskRow key={i} task={t} state={states[i]} />
        ))}
      </div>

      <div className="mt-auto pb-3 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-white/35">
        1 escalated · 22 auto-handled
      </div>
    </div>
  );
}

function TaskRow({ task, state }: { task: OpsTask; state: TaskState }) {
  const isDone = state === "done";
  const isFlagged = state === "flagged";
  const detail =
    state === "done" || state === "flagged"
      ? task.doneDetail
      : task.pendingDetail;

  return (
    <div
      className={`audit-fade-up-sm flex items-center gap-2.5 rounded-xl border bg-white/[0.03] p-2 text-left transition-all duration-300 ${
        isDone
          ? "border-emerald-500/20 opacity-60"
          : isFlagged
            ? "border-orange/30 bg-orange/[0.05]"
            : "border-white/8"
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] ${task.tint}`}
      >
        {task.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[11px] font-medium text-white">
          {task.title}
        </div>
        <div className="truncate font-sans text-[10px] text-white/55">
          {detail}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center" style={{ width: 20, height: 20 }}>
        {state === "pending" && (
          <span className="h-2 w-2 rounded-full bg-white/20" />
        )}
        {state === "working" && (
          <span className="audit-spin h-4 w-4 rounded-full border-2 border-white/15 border-t-sky-400" />
        )}
        {state === "done" && (
          <span className="audit-check-pop flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <CheckIcon />
          </span>
        )}
        {state === "flagged" && (
          <span className="audit-flag-shake text-orange">
            <AlertIcon />
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Scene 6: Money / revenue ------------------------------------------

function MoneyScene() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const target = 184200;
    const dur = 1800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setTotal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const bars = [40, 62, 55, 78, 70, 92, 100];
  const channels = [
    { name: "Direct", value: "$72,400", color: "bg-orange" },
    { name: "Search · Local", value: "$58,200", color: "bg-emerald-400" },
    { name: "Repeat / SMS", value: "$41,800", color: "bg-sky-400" },
  ];

  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col px-3 pt-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">
        portfolio · this month
      </div>

      <div className="mt-1 font-sans text-[26px] font-medium tracking-tight text-white tabular-nums">
        ${total.toLocaleString()}
      </div>
      <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-400">
        ↑ 9% MoM · all stores
      </div>

      {/* Bar chart */}
      <div className="mt-3 flex h-[60px] items-end gap-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className="audit-bar-grow flex-1 rounded-sm bg-gradient-to-t from-orange/70 to-orange"
            style={{ height: `${h}%`, animationDelay: `${i * 95}ms` }}
          />
        ))}
      </div>

      {/* Channel attribution */}
      <div className="mt-3 flex flex-col gap-1.5">
        {channels.map((c, i) => (
          <div
            key={c.name}
            className="audit-fade-up-sm flex items-center justify-between rounded-md bg-white/[0.03] px-2.5 py-1.5"
            style={{ animationDelay: `${850 + i * 160}ms` }}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-sm ${c.color}`} />
              <span className="font-sans text-[10.5px] text-white/85">
                {c.name}
              </span>
            </div>
            <span className="font-mono text-[10px] text-white tabular-nums">
              {c.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Scene 5: Final — capability grid ----------------------------------

function FinalScene() {
  const tiles = [
    { icon: <PhoneIcon />, label: "Capture", tint: "text-emerald-400" },
    { icon: <SearchIcon />, label: "Findability", tint: "text-sky-400" },
    { icon: <StarIcon />, label: "Reputation", tint: "text-orange" },
    { icon: <BoltIcon />, label: "Growth", tint: "text-amber-400" },
    { icon: <CogIcon />, label: "Operations", tint: "text-violet-400" },
    { icon: <ChartIcon />, label: "Money", tint: "text-rose-400" },
  ];
  return (
    <div className="audit-screen-in absolute inset-0 flex flex-col px-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">
          your operating system
        </div>
        <div className="font-mono text-[9px] text-emerald-400">live</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="audit-fade-up-sm flex flex-col items-start justify-between rounded-xl border border-white/8 bg-white/[0.03] p-2"
            style={{ animationDelay: `${i * 120}ms`, minHeight: "70px" }}
          >
            <div className={`${t.tint}`}>{t.icon}</div>
            <div className="text-left">
              <div className="font-sans text-[10.5px] font-medium leading-tight text-white">
                {t.label}
              </div>
              <div className="mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-400">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                live
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="audit-fade-up-sm mt-3 flex items-center justify-between rounded-lg bg-orange/15 px-3 py-2"
        style={{ animationDelay: "900ms" }}
      >
        <span className="font-sans text-[11px] text-white">
          Audit complete
        </span>
        <span className="font-mono text-[10px] text-orange">→ open</span>
      </div>
    </div>
  );
}

// ---- Icons -------------------------------------------------------------

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M5.5 4.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3.5 6.5a2 2 0 0 1 2-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12.5l5 5L20 6.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="2"
        className="text-white/50"
      />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-white/50"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 22s-7-7.2-7-12a7 7 0 1 1 14 0c0 4.8-7 12-7 12z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="10" r="2.5" fill="currentColor" />
    </svg>
  );
}

function StarIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={dim ? "text-white/15" : ""}
    >
      <path d="M12 2.5l2.95 6.6 7.05.78-5.3 4.84 1.5 7.28L12 18.4l-6.2 3.6 1.5-7.28L2 9.88l7.05-.78L12 2.5z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20V10M10 20V4M16 20v-7M22 20H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3 9h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3h8l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v6h6M9 14h6M9 17h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l10 18H2L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 10v5M12 18v.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
