"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sparkle } from "./ask-demo";

/* Film grain — same photographic texture trick used on the offering cards. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const GLASS: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 100%)",
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.2), 0 32px 64px -32px rgba(0,0,0,0.78)",
};

/* Luminous amber mesh — bright bloom kept center/low so the header text up top
   stays over the darker band and readable. */
const BRIGHT_BG =
  "radial-gradient(110% 74% at 50% 72%, rgba(255,150,78,0.64) 0%, transparent 56%), radial-gradient(82% 62% at 84% 96%, rgba(255,96,22,0.62) 0%, transparent 52%), radial-gradient(74% 56% at 15% 60%, rgba(255,188,132,0.42) 0%, transparent 56%), radial-gradient(58% 48% at 52% 52%, rgba(255,208,156,0.24) 0%, transparent 62%), linear-gradient(180deg, #20100a 0%, #1a0c07 36%, #281308 100%)";

const DEEP_BG =
  "radial-gradient(112% 78% at 50% 108%, rgba(255,112,36,0.62) 0%, transparent 55%), radial-gradient(76% 58% at 82% 102%, rgba(255,152,82,0.42) 0%, transparent 54%), radial-gradient(68% 54% at 16% 98%, rgba(255,122,52,0.32) 0%, transparent 56%), linear-gradient(180deg, #190d07 0%, #120805 50%, #0e0604 100%)";

/** Single-element cross-fade: holds, fades out, swaps index, fades in. */
function useCarousel(length: number, holdMs: number, fadeMs: number) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setVisible(false);
      timer = setTimeout(() => {
        if (cancelled) return;
        setIndex((i) => (i + 1) % length);
        setVisible(true);
        timer = setTimeout(tick, holdMs);
      }, fadeMs);
    };
    timer = setTimeout(tick, holdMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [length, holdMs, fadeMs]);

  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "none" : "translateY(8px)",
    transition: "opacity 420ms ease, transform 420ms ease",
  };
  return { index, style };
}

function GradientCard({
  bg,
  headlineLead,
  headlineRest,
  sub,
  children,
}: {
  bg: string;
  headlineLead: string;
  headlineRest: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[560px] flex-col overflow-hidden rounded-[28px] border border-white/[0.08] p-[clamp(26px,3vw,48px)] lg:min-h-[700px]">
      <div aria-hidden className="absolute inset-0" style={{ background: bg }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: GRAIN, backgroundSize: "150px 150px", opacity: 0.07, mixBlendMode: "soft-light" }}
      />
      <div className="relative text-center">
        <h3 className="font-serif text-[clamp(1.9rem,2.7vw,2.6rem)] font-normal leading-[1.08] tracking-[-0.02em] text-white">
          <em className="italic">{headlineLead}</em> {headlineRest}
        </h3>
        <p className="mx-auto mt-4 max-w-[40ch] text-[15px] leading-[1.55] text-white/65 sm:text-[16px]">
          {sub}
        </p>
      </div>
      <div className="relative mt-auto flex flex-1 items-center justify-center pt-10">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Left card — dashboard instant insights (cross-fading stream)        *
 * ------------------------------------------------------------------ */
const INSIGHTS = [
  {
    headline: "Tuesdays keep running half-empty",
    body: "2–4pm sits ~40% below capacity at three of four stores — every week for 11 weeks straight. It's the most consistent gap in your calendar.",
    impact: "≈ $2,100/mo to recover",
  },
  {
    headline: "Rebook rate is climbing",
    body: "More clients book their next visit before they leave — up 6 points this month. Dr. Phillips leads the group at 71%.",
    impact: "≈ $4,400/mo if every store matched it",
  },
  {
    headline: "Retail sells at one store, stalls at another",
    body: "The grooming add-on does 3× the volume at Lake Nona vs Oviedo. Same shelf, same price — the difference is the prompt at checkout.",
    impact: "≈ $1,800/mo on the table",
  },
  {
    headline: "Missed calls are down 22%",
    body: "After-hours calls now get a text back within 90 seconds, and recovered bookings keep climbing week over week.",
    impact: "≈ $1,300/mo recovered",
  },
];

function InsightStream() {
  const { index, style } = useCarousel(INSIGHTS.length, 4200, 420);
  const it = INSIGHTS[index];
  return (
    <div
      className="w-full max-w-[460px] rounded-2xl border border-white/[0.14] p-6 backdrop-blur-2xl sm:p-7"
      style={GLASS}
    >
      <div className="flex min-h-[298px] flex-col" style={style}>
        <Sparkle size={22} />
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          Dashboard · live
        </div>
        <h4 className="mt-4 text-[clamp(1.15rem,1.7vw,1.4rem)] font-medium leading-[1.25] tracking-[-0.01em] text-white">
          {it.headline}
        </h4>
        <p className="mt-3 text-[14px] leading-[1.55] text-white/65 sm:text-[15px]">
          {it.body}
        </p>
        <div className="mt-auto pt-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange/40 bg-orange-soft px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-orange">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" />
            {it.impact}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Right card — AI analyst weekly brief (multi-step, progress dots)    *
 * ------------------------------------------------------------------ */
function BriefSpark() {
  return (
    <svg viewBox="0 0 300 78" preserveAspectRatio="none" className="h-[68px] w-full">
      <defs>
        <linearGradient id="brief-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fe5100" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fe5100" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 60 C 40 56 58 36 100 42 C 142 48 162 20 204 28 C 246 36 272 16 300 22 L 300 78 L 0 78 Z"
        fill="url(#brief-fill)"
      />
      <path
        d="M0 60 C 40 56 58 36 100 42 C 142 48 162 20 204 28 C 246 36 272 16 300 22"
        fill="none"
        stroke="#fe5100"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ACTIONS = [
  { label: "Fill Tue 2–4pm", where: "Dr. Phillips", impact: "+$520/wk" },
  { label: "Push grooming add-on", where: "Oviedo", impact: "+$300/wk" },
  { label: "Win back 14 lapsed clients", where: "all stores", impact: "+$610/wk" },
];

const PANELS: ReactNode[] = [
  <div key="intro" className="flex h-full flex-col items-center justify-center text-center">
    <Sparkle size={34} />
    <div className="mt-5 font-serif text-[22px] tracking-[-0.01em] text-white">
      Your weekly brief
    </div>
    <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
      Jun 9 – 15 · all locations
    </div>
  </div>,
  <div key="finding" className="flex h-full flex-col">
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
      The headline
    </div>
    <h4 className="mt-2 font-serif text-[clamp(1.3rem,1.8vw,1.6rem)] leading-[1.15] tracking-[-0.01em] text-white">
      Revenue climbed 4.1% this week
    </h4>
    <p className="mt-2.5 text-[13.5px] leading-[1.55] text-white/65">
      Driven by a fuller Saturday book and stronger retail attach at Lake Nona.
      Dr. Phillips lagged — those soft Tuesday afternoons again.
    </p>
    <div className="mt-auto">
      <BriefSpark />
    </div>
  </div>,
  <div key="metric" className="flex h-full flex-col">
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
      Net new revenue
    </div>
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-[34px] font-semibold tracking-[-0.02em] text-white">+$3,240</span>
      <span className="font-mono text-[12px] text-good">+4.1%</span>
    </div>
    <p className="mt-2 text-[13.5px] leading-[1.55] text-white/65">
      Best week in seven. Retail attach and Saturday utilization did most of the
      lifting; phones are no longer the leak they were.
    </p>
    <div className="mt-auto">
      <BriefSpark />
    </div>
  </div>,
  <div key="actions" className="flex h-full flex-col">
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
      Do this week
    </div>
    <div className="mt-3 flex flex-col divide-y divide-white/[0.08]">
      {ACTIONS.map((a) => (
        <div key={a.label} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] text-white">{a.label}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
              {a.where}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[12px] text-orange">{a.impact}</span>
        </div>
      ))}
    </div>
  </div>,
];

function WeeklyBrief() {
  const { index, style } = useCarousel(PANELS.length, 3600, 420);
  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border border-white/[0.14] p-5 backdrop-blur-2xl"
      style={GLASS}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {PANELS.map((_, i) => (
            <span
              key={i}
              className="h-1 w-6 rounded-full transition-colors duration-300"
              style={{ background: i === index ? "#fe5100" : "rgba(255,255,255,0.18)" }}
            />
          ))}
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" className="text-white/40" aria-hidden>
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>

      <div className="relative mt-4 h-[270px]">
        <div className="h-full" style={style}>
          {PANELS[index]}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.08] pt-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
          <ThumbUp /> More like this
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
          <ThumbDown /> Less
        </span>
      </div>
    </div>
  );
}

function ThumbUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 7v6H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2Zm0 0 3-4.5A1.5 1.5 0 0 1 11 3.5L10.3 6H13a1.3 1.3 0 0 1 1.27 1.6l-1 4A1.3 1.3 0 0 1 12 12.6H5"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function ThumbDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="rotate-180">
      <path d="M5 7v6H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2Zm0 0 3-4.5A1.5 1.5 0 0 1 11 3.5L10.3 6H13a1.3 1.3 0 0 1 1.27 1.6l-1 4A1.3 1.3 0 0 1 12 12.6H5"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function FeatureCards() {
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-5 lg:grid-cols-2">
      <GradientCard
        bg={BRIGHT_BG}
        headlineLead="See"
        headlineRest="what's moving"
        sub="Your whole operation at a glance — live numbers and the trends that need you, the moment they move."
      >
        <InsightStream />
      </GradientCard>
      <GradientCard
        bg={DEEP_BG}
        headlineLead="Meet"
        headlineRest="your analyst"
        sub="Urso AI reads your week like a data analyst would — a deep brief on what moved, why it matters, and the moves worth making next."
      >
        <WeeklyBrief />
      </GradientCard>
    </div>
  );
}
