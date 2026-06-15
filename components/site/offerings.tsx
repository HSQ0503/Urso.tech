import Image from "next/image";
import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/* Fine film grain over the gradient backgrounds — turns a flat fill into a
   photographic surface (the Origin "texture" trick), in pure CSS. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Frosted-glass widget surface: top-lit gradient, hairline inner highlight,
   and a soft drop shadow so it floats above the textured card. */
const GLASS: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.035) 100%)",
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.20), 0 28px 56px -28px rgba(0,0,0,0.9)",
};

const widgetClass =
  "absolute inset-x-5 top-1/2 flex -translate-y-1/2 flex-col rounded-2xl border border-white/[0.12] p-4 backdrop-blur-2xl";

const SOURCES = [
  { name: "QuickBooks", logo: "/assets/quickboojs.png" },
  { name: "Square POS", logo: "/assets/square.png" },
  { name: "Google Analytics", logo: "/assets/googleanalytics.png" },
  { name: "Stripe", logo: "/assets/stripe.png" },
];

const TASKS = [
  { label: "Add retail prompt at checkout", done: true },
  { label: "Reply to 12 missed reviews", done: true },
  { label: "Train groomers on upsell", done: false },
  { label: "Set reorder reminders", done: false },
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

type Card = {
  title: string;
  body: string;
  background: string;
  widget: ReactNode;
};

const CARDS: Card[] = [
  {
    title: "Connect your data",
    body: "POS, books, phones, booking, reviews — every system you run, unified into one source of truth you can act on.",
    background:
      "radial-gradient(100% 70% at 85% 116%, rgba(254,81,0,0.20), transparent 58%), radial-gradient(80% 60% at 4% -12%, rgba(150,170,200,0.10), transparent 55%), linear-gradient(155deg, #161a23 0%, #0c0e13 55%, #08090c 100%)",
    widget: (
      <div className={widgetClass} style={GLASS}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            Connected
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            4 sources · live
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {SOURCES.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-white/10 bg-white/[0.07]">
                <Image
                  src={s.logo}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[17px] w-[17px] object-contain opacity-90"
                />
              </span>
              <span className="flex-1 text-[13px] text-white/85">{s.name}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Find the leaks",
    body: "We read your numbers like an operator: where revenue slips, which calls go unanswered, what to fix first — every gap sized in dollars.",
    background:
      "radial-gradient(95% 78% at 50% -12%, rgba(254,81,0,0.30), transparent 60%), radial-gradient(70% 60% at 86% 112%, rgba(176,62,18,0.22), transparent 58%), linear-gradient(160deg, #2c1409 0%, #170c06 52%, #0a0705 100%)",
    widget: (
      <div className={widgetClass} style={GLASS}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            Revenue leak
          </span>
          <span className="rounded-full border border-orange/40 bg-orange-soft px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.12em] text-orange">
            Recoverable
          </span>
        </div>
        <div className="mt-4 text-[12px] text-white/55">
          After-hours calls, unanswered
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold tracking-[-0.02em] text-white">
            $1,340
          </span>
          <span className="text-[13px] text-white/45">/ mo</span>
        </div>
        <svg
          viewBox="0 0 260 70"
          preserveAspectRatio="none"
          className="mt-3 h-[56px] w-full"
        >
          <defs>
            <linearGradient id="leakfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fe5100" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#fe5100" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 54 C 34 50 50 28 82 34 C 118 41 138 16 174 24 C 210 32 236 48 260 38 L 260 70 L 0 70 Z"
            fill="url(#leakfill)"
          />
          <path
            d="M0 54 C 34 50 50 28 82 34 C 118 41 138 16 174 24 C 210 32 236 48 260 38"
            fill="none"
            stroke="#fe5100"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="82" cy="34" r="3.5" fill="#fe5100" />
        </svg>
      </div>
    ),
  },
  {
    title: "Fix it with your team",
    body: "We don't hand you a dashboard and walk away. We implement with your managers — process, training, and AI on the busywork — month after month.",
    background:
      "radial-gradient(90% 70% at 50% 114%, rgba(254,81,0,0.16), transparent 58%), radial-gradient(75% 60% at 16% -10%, rgba(64,128,138,0.13), transparent 55%), linear-gradient(165deg, #101618 0%, #0a0e10 55%, #07090a 100%)",
    widget: (
      <div className={widgetClass} style={GLASS}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            This week
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            2 / 4 done
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {TASKS.map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              {t.done ? (
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-orange">
                  <Check />
                </span>
              ) : (
                <span className="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-white/25" />
              )}
              <span
                className={
                  "text-[13px] " +
                  (t.done ? "text-white/40 line-through" : "text-white/85")
                }
              >
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export function Offerings() {
  return (
    <div className="mx-auto mt-[clamp(48px,7vw,96px)] grid max-w-[1200px] grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-3">
      {CARDS.map((c, i) => (
        <Reveal key={c.title} delay={i * 80} className="flex flex-col">
          <div
            className="relative overflow-hidden rounded-[22px] border border-white/[0.08] transition-transform duration-300 will-change-transform hover:-translate-y-1.5"
            style={{
              aspectRatio: "4 / 5",
              background: c.background,
              boxShadow: "0 44px 90px -52px rgba(0,0,0,0.95)",
            }}
          >
            {/* film grain */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: GRAIN,
                backgroundSize: "140px 140px",
                opacity: 0.1,
                mixBlendMode: "overlay",
              }}
            />
            {/* top sheen */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/4"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.06), transparent)",
              }}
            />
            {c.widget}
          </div>
          <h3 className="mt-6 text-[19px] font-medium tracking-[-0.01em] text-ink">
            {c.title}
          </h3>
          <p className="mt-2 text-[15px] leading-[1.55] text-ink-dim">{c.body}</p>
        </Reveal>
      ))}
    </div>
  );
}
