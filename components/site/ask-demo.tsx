"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/* Orange 4-point AI sparkle with a soft glow. `spin` is used for the
   "thinking" state. */
export function Sparkle({
  size = 44,
  spin = false,
  className = "",
}: {
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="absolute inset-0 animate-pulse rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(254,81,0,0.5), transparent 64%)",
          filter: "blur(10px)",
        }}
      />
      <svg
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        viewBox="-12 -12 24 24"
        className={cx("relative", spin && "animate-spin-slow")}
        aria-hidden
      >
        <defs>
          <linearGradient id="urso-spark" x1="0" y1="-12" x2="6" y2="12">
            <stop offset="0" stopColor="#ff9259" />
            <stop offset="1" stopColor="#fe5100" />
          </linearGradient>
        </defs>
        <path
          d="M0 -11 C 1.7 -3.4 3.4 -1.7 11 0 C 3.4 1.7 1.7 3.4 0 11 C -1.7 3.4 -3.4 1.7 -11 0 C -3.4 -1.7 -1.7 -3.4 0 -11 Z"
          fill="url(#urso-spark)"
        />
      </svg>
    </span>
  );
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

type Part = { t: string; hl?: boolean };
type Row = { label: string; value: string; pct: number; low?: boolean };
type Item = {
  q: string;
  lead: Part[];
  words: { w: string; hl: boolean }[];
  title: string;
  rows: Row[];
  note: string;
};

function toWords(parts: Part[]) {
  const out: { w: string; hl: boolean }[] = [];
  for (const p of parts)
    for (const w of p.t.split(" ")) if (w) out.push({ w, hl: !!p.hl });
  return out;
}

const RAW: Omit<Item, "words">[] = [
  {
    q: "Where am I leaking revenue this month?",
    lead: [
      { t: "Across all four stores, the biggest recoverable leak this month is" },
      { t: "after-hours calls", hl: true },
      { t: "— phones ringing out while you're closed." },
    ],
    title: "Top recoverable leaks",
    rows: [
      { label: "After-hours missed calls", value: "$1,340/mo", pct: 100 },
      { label: "Empty grooming slots", value: "$980/mo", pct: 73 },
      { label: "Lapsed repeat customers", value: "$610/mo", pct: 46 },
    ],
    note: "Sized from 29 months of POS + call data",
  },
  {
    q: "Which location is underperforming?",
    lead: [
      { t: "Your softest store is" },
      { t: "Winter Park", hl: true },
      { t: "— retail attach is 12 points below the group average." },
    ],
    title: "Retail attach by store",
    rows: [
      { label: "Dr. Phillips", value: "31%", pct: 100 },
      { label: "Lake Nona", value: "27%", pct: 87 },
      { label: "Oviedo", value: "24%", pct: 77 },
      { label: "Winter Park", value: "19%", pct: 61, low: true },
    ],
    note: "Group average 25.3%",
  },
  {
    q: "What should I fix first?",
    lead: [
      { t: "Start with the" },
      { t: "checkout retail prompt", hl: true },
      { t: "— highest dollar impact for the least effort." },
    ],
    title: "Recommended this week",
    rows: [
      { label: "Retail prompt at checkout", value: "+$2.3k/mo", pct: 100 },
      { label: "Text-back missed calls", value: "+$1.3k/mo", pct: 57 },
      { label: "Reply to 12 reviews", value: "+0.2★", pct: 30 },
    ],
    note: "Ranked by impact ÷ effort",
  },
];

const ITEMS: Item[] = RAW.map((r) => ({ ...r, words: toWords(r.lead) }));

type Phase = "type" | "think" | "answer";

export function AskDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("type");
  const [shown, setShown] = useState(0);
  const [breakdown, setBreakdown] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function run() {
      await sleep(200);
      if (cancelled) return;
      if (reduced) {
        const it = ITEMS[0];
        setIdx(0);
        setTyped(it.q);
        setShown(it.words.length);
        setBreakdown(true);
        setPhase("answer");
        setVisible(true);
        return;
      }
      let i = 0;
      while (!cancelled) {
        const it = ITEMS[i];
        setIdx(i);
        setPhase("type");
        setTyped("");
        setShown(0);
        setBreakdown(false);
        setVisible(false);
        await sleep(450);
        if (cancelled) return;
        for (let c = 1; c <= it.q.length; c++) {
          if (cancelled) return;
          setTyped(it.q.slice(0, c));
          await sleep(33);
        }
        await sleep(520);
        if (cancelled) return;
        setPhase("think");
        await sleep(1300);
        if (cancelled) return;
        setPhase("answer");
        setVisible(true);
        for (let w = 1; w <= it.words.length; w++) {
          if (cancelled) return;
          setShown(w);
          await sleep(52);
        }
        await sleep(260);
        if (cancelled) return;
        setBreakdown(true);
        await sleep(4400);
        if (cancelled) return;
        setVisible(false);
        await sleep(560);
        if (cancelled) return;
        i = (i + 1) % ITEMS.length;
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const it = ITEMS[idx];

  return (
    <div ref={ref} className="mx-auto w-full max-w-[640px]">
      <div className="relative flex items-center gap-2 rounded-2xl border border-edge bg-white/[0.04] py-3.5 pl-5 pr-3 backdrop-blur-xl">
        <span className="flex-1 truncate text-left text-[16px] text-ink">
          {typed || <span className="text-ink-dimmer">Ask Urso anything…</span>}
          {phase === "type" && (
            <span className="ml-px inline-block h-[1.05em] w-px translate-y-[2px] animate-blink bg-ink align-middle" />
          )}
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange text-[#070707]">
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
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

      <div className="relative mt-4 min-h-[clamp(320px,42vw,392px)]">
        {phase === "think" && (
          <div className="flex items-center gap-2.5 px-1 pt-2 text-ink-dim">
            <Sparkle size={20} spin />
            <span className="text-[15px]">
              Thinking
              <Dots />
            </span>
          </div>
        )}
        {phase === "answer" && (
          <div
            className="rounded-2xl border border-edge bg-white/[0.04] p-5 backdrop-blur-xl transition-all duration-500"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(8px)",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 30px 60px -30px rgba(0,0,0,0.8)",
            }}
          >
            <p className="text-[15px] leading-[1.6] text-ink sm:text-[16px]">
              {it.words.slice(0, shown).map((x, i) => (
                <span key={i} className={x.hl ? "font-medium text-orange" : ""}>
                  {x.w}{" "}
                </span>
              ))}
              {shown < it.words.length && (
                <span className="inline-block h-[1.05em] w-px translate-y-[2px] animate-blink bg-ink-dim align-middle" />
              )}
            </p>

            <div
              className="mt-5 rounded-xl border border-edge bg-white/[0.03] p-4 transition-all duration-500"
              style={{
                opacity: breakdown ? 1 : 0,
                transform: breakdown ? "translateY(0)" : "translateY(6px)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
                  {it.title}
                </span>
                <Sparkle size={15} />
              </div>
              <div className="mt-3.5 flex flex-col gap-3">
                {it.rows.map((r, i) => (
                  <div key={r.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={cx(
                          "text-[13px]",
                          r.low ? "text-orange" : "text-ink-dim",
                        )}
                      >
                        {r.label}
                      </span>
                      <span
                        className={cx(
                          "font-mono text-[12px] tracking-[-0.01em]",
                          r.low ? "text-orange" : "text-ink",
                        )}
                      >
                        {r.value}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-orange transition-[width] duration-700 ease-out"
                        style={{
                          width: breakdown ? `${r.pct}%` : "0%",
                          transitionDelay: `${i * 90}ms`,
                          opacity: r.low ? 0.85 : 1,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-edge pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                {it.note}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex">
      <span className="animate-fade-blink">.</span>
      <span className="animate-fade-blink [animation-delay:200ms]">.</span>
      <span className="animate-fade-blink [animation-delay:400ms]">.</span>
    </span>
  );
}
