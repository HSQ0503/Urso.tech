import type { ReactNode } from "react";
import { Reveal } from "./reveal";
import { Sparkle } from "./ask-demo";
import { cx } from "./ui";

/* Film grain over the gradient backgrounds — the photographic-texture trick
   reused across the offerings and feature cards. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Frosted widget surface — top-lit glass that floats over the textured card. */
const GLASS: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 100%)",
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.2), 0 32px 64px -32px rgba(0,0,0,0.8)",
};

const WIDGET = "w-full rounded-2xl border border-white/[0.12] p-5 backdrop-blur-2xl sm:p-6";

/* ------------------------------------------------------------------ *
 * 1 · Review — the leak report                                        *
 * ------------------------------------------------------------------ */
const LEAKS = [
  { label: "After-hours missed calls", value: "$1,340/mo", level: "High" },
  { label: "Lapsed repeat customers", value: "$980/mo", level: "Medium" },
  { label: "Empty Tuesday slots", value: "$610/mo", level: "Medium" },
  { label: "Slow online booking", value: "$420/mo", level: "Low" },
];

function LeakReport() {
  return (
    <div className={WIDGET} style={GLASS}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          Leak report
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          4 locations
        </span>
      </div>
      <div className="mt-5 flex flex-col gap-[18px]">
        {LEAKS.map((l) => (
          <div key={l.label} className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] text-white/85">{l.label}</span>
            <span className="flex shrink-0 items-center gap-2.5">
              <span className="font-mono text-[12.5px] tracking-[-0.01em] text-white">
                {l.value}
              </span>
              <span
                className={cx(
                  "rounded-full border px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.1em]",
                  l.level === "High"
                    ? "border-orange/40 bg-orange-soft text-orange"
                    : "border-white/15 text-white/45",
                )}
              >
                {l.level}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-white/10 pt-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
        Sized from 29 months of POS data
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 2 · Build / Activate — the weekly action plan                       *
 * ------------------------------------------------------------------ */
const ACTIONS = [
  { label: "Turn on missed-call text-back", impact: "+$1.3k/mo", done: true },
  { label: "Add a retail prompt at checkout", impact: "+$2.3k/mo", done: true },
  { label: "Win back 14 lapsed clients", impact: "+$2.4k/mo", done: false },
  { label: "Follow up on 9 no-shows", impact: "+$1.1k/mo", done: false },
];

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.2 5 8.5 9.5 3.5"
        stroke="#070707"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActionPlan() {
  return (
    <div className={WIDGET} style={GLASS}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          This week
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          2 of 4 done
        </span>
      </div>
      <div className="mt-5 flex flex-col gap-[18px]">
        {ACTIONS.map((a) => (
          <div key={a.label} className="flex items-center gap-3">
            {a.done ? (
              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-orange">
                <Check />
              </span>
            ) : (
              <span className="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-white/25" />
            )}
            <span
              className={cx(
                "flex-1 text-[13.5px]",
                a.done ? "text-white/40 line-through" : "text-white/85",
              )}
            >
              {a.label}
            </span>
            <span className="shrink-0 font-mono text-[12px] text-orange">
              {a.impact}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 3 · Improve — track everything, ask anything                        *
 * ------------------------------------------------------------------ */
function AskCard() {
  return (
    <div className={cx(WIDGET, "flex flex-col")} style={GLASS}>
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-white/[0.1] px-4 py-2.5 text-[13.5px] leading-[1.45] text-white">
          Which store is leaking the most this month?
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <Sparkle size={22} className="shrink-0" />
        <p className="text-[13.5px] leading-[1.55] text-white/85">
          <span className="font-medium text-orange">Charlotte.</span> After-hours
          calls are up 18%, and retail attach sits 12 points below the group. The
          biggest single lever is missed-call text-back, worth about{" "}
          <span className="text-white">$1.3k/mo</span>.
        </p>
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
        <span className="flex-1 truncate text-[13px] text-white/40">
          Ask a follow up...
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange text-[#070707]">
          <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M9 14.5v-11M4.5 8 9 3.5 13.5 8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Card = {
  background: string;
  headline: string;
  sub: string;
  widget: ReactNode;
};

const CARDS: Card[] = [
  {
    headline: "We find the money first",
    sub: "Before we touch anything, we pull your data together and reconcile it until the numbers agree with reality. You get a baseline and a leak report, every gap sized in dollars.",
    background:
      "radial-gradient(96% 62% at 50% 24%, rgba(255,150,78,0.46) 0%, transparent 58%)," +
      "radial-gradient(64% 44% at 84% 6%, rgba(255,108,38,0.30) 0%, transparent 54%)," +
      "linear-gradient(180deg, #1c0e07 0%, #150b06 52%, #0b0705 100%)",
    widget: <LeakReport />,
  },
  {
    headline: "You get a plan, not a dashboard",
    sub: "Every fix is ranked by dollar impact and effort, assigned to an owner, and tracked to done. Not a report that gets exported once and quietly ignored.",
    background:
      "radial-gradient(98% 60% at 50% 20%, rgba(255,120,46,0.50) 0%, transparent 56%)," +
      "radial-gradient(60% 44% at 16% 8%, rgba(255,156,90,0.30) 0%, transparent 54%)," +
      "linear-gradient(180deg, #21110a 0%, #160b06 52%, #0c0705 100%)",
    widget: <ActionPlan />,
  },
  {
    headline: "Track everything. Ask anything",
    sub: "Your whole operation lives on one screen. An analyst answers in plain language, grounded in your real numbers, any time you ask.",
    background:
      "radial-gradient(94% 60% at 50% 18%, rgba(255,166,100,0.44) 0%, transparent 58%)," +
      "radial-gradient(58% 42% at 86% 90%, rgba(255,110,40,0.22) 0%, transparent 55%)," +
      "linear-gradient(180deg, #1a0d07 0%, #140a05 54%, #0b0705 100%)",
    widget: <AskCard />,
  },
];

/** The "how it works" showcase — three tall cards, each a cinematic gradient
 *  with a frosted product widget floating above the heading. */
export function ProcessCards() {
  return (
    <div className="mx-auto grid max-w-[1520px] grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
      {CARDS.map((c, i) => (
        <Reveal key={c.headline} delay={i * 90} className="flex">
          <div
            className="relative flex min-h-[560px] flex-col overflow-hidden rounded-[24px] border border-white/[0.08] transition-transform duration-300 will-change-transform hover:-translate-y-1.5 lg:min-h-[720px] xl:min-h-[800px]"
            style={{ boxShadow: "0 44px 90px -52px rgba(0,0,0,0.95)" }}
          >
            <div aria-hidden className="absolute inset-0" style={{ background: c.background }} />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: GRAIN,
                backgroundSize: "150px 150px",
                opacity: 0.08,
                mixBlendMode: "overlay",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/4"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06), transparent)" }}
            />

            <div className="relative flex flex-1 items-start justify-center p-[clamp(20px,2.2vw,30px)]">
              {c.widget}
            </div>
            <div className="relative px-[clamp(24px,2.6vw,38px)] pb-[clamp(26px,2.8vw,40px)]">
              <h3 className="font-serif text-[clamp(1.4rem,1.9vw,1.85rem)] font-normal leading-[1.15] tracking-[-0.01em] text-white">
                {c.headline}
              </h3>
              <p className="mt-3 max-w-[42ch] text-[14px] leading-[1.55] text-white/65 sm:text-[15px]">
                {c.sub}
              </p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
