import Image from "next/image";
import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/* Fine film grain over the gradient backgrounds — turns a flat fill into a
   photographic surface (the Origin "texture" trick), in pure CSS. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Frosted-glass widget surface: top-lit gradient, hairline inner highlight,
   and a soft drop shadow so it floats above the luminous card. Brighter than a
   plain dark panel so it picks up the atmosphere behind it, Origin-style. */
const GLASS: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.05) 100%)",
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.26), 0 40px 82px -34px rgba(0,0,0,0.92)",
};

/* The widget grows to fill the space under a tall band of luminous gradient
   (the way the Origin product cards float on their sky/sand photo). Height is
   driven by the card's flex column, so content never clips at any width. */
const widgetClass =
  "flex flex-1 flex-col rounded-[20px] border border-white/[0.14] p-5 backdrop-blur-2xl sm:p-[22px]";

const labelLeft =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-white/55";
const labelRight =
  "font-mono text-[10px] uppercase tracking-[0.14em] text-white/35";

const SOURCES = [
  { name: "QuickBooks", cat: "Accounting", logo: "/assets/quickboojs.png" },
  { name: "Square POS", cat: "Point of sale", logo: "/assets/square.png" },
  { name: "Google Analytics", cat: "Web & traffic", logo: "/assets/googleanalytics.png" },
  { name: "Stripe", cat: "Payments", logo: "/assets/stripe.png" },
];

const UNIFIED = ["Revenue", "Customers", "Calls", "Reviews"];

const TASKS = [
  { label: "Add retail prompt at checkout", tag: "Checkout", impact: "+$2.3k/mo", done: true },
  { label: "Reply to 12 missed reviews", tag: "Reputation", impact: "+0.2★", done: true },
  { label: "Train the team on add-ons", tag: "Training", impact: "+$1.8k/mo", done: false },
  { label: "Set reorder reminders", tag: "Retail", impact: "+$640/mo", done: false },
];

/* Secondary leaks under the headline figure — the breakdown that makes the
   "Find the leaks" widget read like a real finding, not a single stat. */
const SUB_LEAKS = [
  { label: "Empty appointment slots", value: "$980/mo", pct: 73 },
  { label: "Lapsed customers", value: "$610/mo", pct: 46 },
];

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
      "radial-gradient(120% 76% at 50% -8%, rgba(208,222,240,0.18), transparent 52%), radial-gradient(90% 66% at 84% 116%, rgba(254,81,0,0.20), transparent 58%), linear-gradient(162deg, #1c2433 0%, #11151d 52%, #0a0c11 100%)",
    widget: (
      <div className={widgetClass} style={GLASS}>
        <div className="flex items-center justify-between">
          <span className={labelLeft}>Connected</span>
          <span className={labelRight}>4 sources · live</span>
        </div>
        <div className="mt-6 flex flex-col gap-[18px]">
          {SOURCES.map((s) => (
            <div key={s.name} className="flex items-center gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-white/10 bg-white/[0.08]">
                <Image
                  src={s.logo}
                  alt=""
                  width={22}
                  height={22}
                  className="h-[20px] w-[20px] object-contain opacity-90"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] leading-tight text-white/90">
                  {s.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                  {s.cat}
                </span>
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
            </div>
          ))}
        </div>
        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex flex-wrap gap-2">
            {UNIFIED.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-1 text-[11.5px] text-white/70"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              One source of truth
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              synced 2m ago
            </span>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Find the leaks",
    body: "We read your numbers like an operator: where revenue slips, which calls go unanswered, what to fix first — every gap sized in dollars.",
    background:
      "radial-gradient(115% 80% at 50% -8%, rgba(255,150,70,0.42), transparent 56%), radial-gradient(80% 66% at 86% 116%, rgba(190,68,20,0.32), transparent 56%), linear-gradient(160deg, #3c1d0d 0%, #20100a 54%, #0c0705 100%)",
    widget: (
      <div className={widgetClass} style={GLASS}>
        <div className="flex items-center justify-between">
          <span className={labelLeft}>Revenue leak</span>
          <span className="rounded-full border border-orange/40 bg-orange-soft px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.12em] text-orange">
            Recoverable
          </span>
        </div>
        <div className="mt-6 text-[12.5px] text-white/55">
          After-hours calls, unanswered
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[38px] font-semibold tracking-[-0.02em] text-white">
            $1,340
          </span>
          <span className="text-[13px] text-white/45">/ mo</span>
        </div>
        <svg
          viewBox="0 0 260 70"
          preserveAspectRatio="none"
          className="mt-5 h-[68px] w-full"
          aria-hidden
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
        <div className="mt-auto flex flex-col gap-3.5 border-t border-white/10 pt-4">
          {SUB_LEAKS.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-white/65">{r.label}</span>
                <span className="font-mono text-[12.5px] text-white/85">{r.value}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-orange/80"
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Fix it with your team",
    body: "We don't hand you a dashboard and walk away. We implement with your managers — process, training, and AI on the busywork — month after month.",
    background:
      "radial-gradient(120% 76% at 50% -8%, rgba(190,206,222,0.14), transparent 52%), radial-gradient(95% 70% at 50% 118%, rgba(254,81,0,0.20), transparent 58%), linear-gradient(170deg, #18212c 0%, #0e1218 52%, #080a0e 100%)",
    widget: (
      <div className={widgetClass} style={GLASS}>
        <div className="flex items-center justify-between">
          <span className={labelLeft}>This week</span>
          <span className={labelRight}>2 / 4 done</span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-orange" style={{ width: "50%" }} />
        </div>
        <div className="mt-6 flex flex-col gap-[18px]">
          {TASKS.map((t) => (
            <div key={t.label} className="flex items-center gap-3.5">
              {t.done ? (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-orange">
                  <Check />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-[6px] border border-white/25" />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={
                    "block text-[14px] leading-tight " +
                    (t.done ? "text-white/40 line-through" : "text-white/90")
                  }
                >
                  {t.label}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                  {t.tag} · {t.impact}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4">
          <span className="flex items-center gap-2 text-[13px] text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
            On track
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            review friday
          </span>
        </div>
      </div>
    ),
  },
];

export function Offerings() {
  return (
    <div className="mx-auto mt-[clamp(56px,8vw,104px)] grid max-w-[1520px] grid-cols-1 gap-x-7 gap-y-14 md:grid-cols-3">
      {CARDS.map((c, i) => (
        <Reveal key={c.title} delay={i * 80} className="flex flex-col">
          <div
            className="relative flex min-h-[clamp(560px,42vw,710px)] flex-1 flex-col overflow-hidden rounded-[28px] border border-white/[0.08] transition-transform duration-300 will-change-transform hover:-translate-y-1.5"
            style={{
              background: c.background,
              boxShadow: "0 60px 120px -56px rgba(0,0,0,0.95)",
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
                  "linear-gradient(180deg, rgba(255,255,255,0.08), transparent)",
              }}
            />
            {/* widget floats under a tall luminous header band of gradient */}
            <div className="relative flex flex-1 flex-col px-[14px] pt-[clamp(100px,13vw,184px)] pb-[clamp(24px,4vw,44px)]">
              {c.widget}
            </div>
          </div>
          <h3 className="mt-7 text-[21px] font-medium tracking-[-0.01em] text-ink">
            {c.title}
          </h3>
          <p className="mt-2.5 max-w-[42ch] text-[15.5px] leading-[1.55] text-ink-dim">
            {c.body}
          </p>
        </Reveal>
      ))}
    </div>
  );
}
