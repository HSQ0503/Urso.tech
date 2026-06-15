import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/* ------------------------------------------------------------------ *
 * Shared card shell — dark panel, centered serif header, widget below *
 * ------------------------------------------------------------------ */
function Card({
  lead,
  rest,
  sub,
  delay,
  children,
}: {
  lead: string;
  rest: string;
  sub: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <Reveal
      delay={delay}
      className="flex flex-col rounded-[24px] border border-edge bg-[#0c0c0d] p-[clamp(24px,3vw,44px)]"
    >
      <div className="text-center">
        <h3 className="font-serif text-[clamp(1.75rem,2.4vw,2.3rem)] font-normal leading-[1.1] tracking-[-0.02em] text-ink">
          <em className="italic">{lead}</em> {rest}
        </h3>
        <p className="mx-auto mt-4 max-w-[42ch] text-[15px] leading-[1.55] text-ink-dim">
          {sub}
        </p>
      </div>
      <div className="mt-auto pt-[clamp(28px,4vw,48px)]">{children}</div>
    </Reveal>
  );
}

const WIDGET = "rounded-2xl border border-edge bg-[#111113] p-5 sm:p-6";
const LABEL = "font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dimmer";

/* ------------------------------------------------------------------ *
 * 1 · Revenue                                                         *
 * ------------------------------------------------------------------ */
function RevenueWidget() {
  return (
    <div className={WIDGET}>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Revenue · trailing 12</span>
        <span className={LABEL}>4 locations</span>
      </div>
      <div className="mt-5 text-[13px] text-ink-dim">Total revenue</div>
      <div className="mt-1 flex items-baseline gap-2.5">
        <span className="text-[clamp(1.7rem,2.4vw,2rem)] font-semibold tracking-[-0.02em] text-ink">
          $2,614,961
        </span>
        <span className="font-mono text-[13px] text-good">+4.1%</span>
      </div>
      <svg
        viewBox="0 0 300 120"
        preserveAspectRatio="none"
        className="mt-5 h-[120px] w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fe5100" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#fe5100" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 96 C 32 90 46 80 72 84 C 102 89 116 58 146 62 C 176 66 190 42 216 40 C 246 38 266 30 300 20 L 300 120 L 0 120 Z"
          fill="url(#rev-fill)"
        />
        <path
          d="M0 96 C 32 90 46 80 72 84 C 102 89 116 58 146 62 C 176 66 190 42 216 40 C 246 38 266 30 300 20"
          fill="none"
          stroke="#fe5100"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="300" cy="20" r="4" fill="#fe5100" />
      </svg>
      <div className="mt-5 flex items-center gap-1">
        {["1M", "3M", "YTD", "1Y", "ALL"].map((t) => (
          <span
            key={t}
            className={
              "rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] " +
              (t === "YTD" ? "bg-white/[0.07] text-ink" : "text-ink-dimmer")
            }
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 2 · By store (current vs target bars)                               *
 * ------------------------------------------------------------------ */
const STORES = [
  { name: "Dr. Phillips", current: 31, target: 25 },
  { name: "Lake Nona", current: 27, target: 25 },
  { name: "Oviedo", current: 24, target: 25 },
  { name: "Winter Park", current: 19, target: 25 },
];

function StoreBarsWidget() {
  return (
    <div className={WIDGET}>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Retail attach by store</span>
        <span className={LABEL}>vs target</span>
      </div>
      <div className="mt-5 flex flex-col gap-4">
        {STORES.map((s) => (
          <div key={s.name}>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] text-ink">{s.name}</span>
              <span className="font-mono text-[12px] text-ink">{s.current}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-orange"
                style={{ width: `${(s.current / 40) * 100}%` }}
              />
            </div>
            <div
              className="mt-1.5 h-1.5 rounded-full"
              style={{
                width: `${(s.target / 40) * 100}%`,
                backgroundImage:
                  "repeating-linear-gradient(90deg, rgba(254,81,0,0.6) 0 5px, transparent 5px 10px)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 border-t border-edge pt-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          <span className="h-1.5 w-4 rounded-full bg-orange" /> Current
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
          <span
            className="h-1.5 w-4 rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(254,81,0,0.6) 0 4px, transparent 4px 8px)",
            }}
          />
          Target
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 3 · Capture & retention (rows)                                      *
 * ------------------------------------------------------------------ */
const ROWS: Array<{ label: string; value: string; delta: string; tone: "good" | "orange" }> = [
  { label: "Calls handled", value: "1,284", delta: "+6%", tone: "good" },
  { label: "Missed → recovered", value: "41", delta: "$1,340", tone: "orange" },
  { label: "Rebook rate", value: "64%", delta: "+6 pts", tone: "good" },
  { label: "No-show rate", value: "7.2%", delta: "−1.1 pts", tone: "good" },
  { label: "Win-back pipeline", value: "$4,400", delta: "23 clients", tone: "orange" },
];

function CaptureWidget() {
  return (
    <div className={WIDGET}>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Capture &amp; retention</span>
        <span className={LABEL}>this week</span>
      </div>
      <div className="mt-2 flex flex-col divide-y divide-edge">
        {ROWS.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-[14px]">
            <span className="text-[14px] text-ink-dim">{r.label}</span>
            <span className="flex items-baseline gap-2.5">
              <span className="text-[15px] font-medium text-ink">{r.value}</span>
              <span
                className={
                  "font-mono text-[11px] " + (r.tone === "good" ? "text-good" : "text-orange")
                }
              >
                {r.delta}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 4 · Reputation (2×2 store grid)                                     *
 * ------------------------------------------------------------------ */
const REVIEWS = [
  { name: "Dr. Phillips", rating: "4.8", delta: "+12", up: true },
  { name: "Lake Nona", rating: "4.7", delta: "+9", up: true },
  { name: "Oviedo", rating: "4.6", delta: "+5", up: true },
  { name: "Winter Park", rating: "4.4", delta: "−2", up: false },
];

function MiniSpark({ up }: { up: boolean }) {
  const color = up ? "#fe5100" : "#e5654a";
  const d = up
    ? "M0 22 C 14 20 20 12 34 14 C 50 16 56 7 72 6 C 88 5 96 9 110 4"
    : "M0 7 C 14 8 22 6 36 9 C 52 12 58 16 74 15 C 90 14 98 20 110 22";
  return (
    <svg viewBox="0 0 110 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ReputationWidget() {
  return (
    <div className={WIDGET}>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Reviews</span>
        <span className={LABEL}>last 30 days</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {REVIEWS.map((s) => (
          <div key={s.name} className="rounded-xl border border-edge bg-[#0c0c0d] p-3.5">
            <div className="text-[13px] text-ink">{s.name}</div>
            <div className="mt-2">
              <MiniSpark up={s.up} />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="flex items-baseline gap-0.5">
                <span className="text-[19px] font-semibold tracking-[-0.01em] text-ink">
                  {s.rating}
                </span>
                <span className="text-[12px] text-orange">★</span>
              </span>
              <span
                className={
                  "font-mono text-[11px] " + (s.up ? "text-good" : "text-[#e5654a]")
                }
              >
                {s.delta}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MeasureCards() {
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-5 lg:grid-cols-2">
      <Card
        lead="Track"
        rest="every dollar"
        sub="From every store and service line — revenue, margin, and average ticket, validated to the penny."
        delay={0}
      >
        <RevenueWidget />
      </Card>
      <Card
        lead="Compare"
        rest="every location"
        sub="One metric, every store, side by side — see who's leading and who needs you, current against target."
        delay={80}
      >
        <StoreBarsWidget />
      </Card>
      <Card
        lead="Catch"
        rest="what slips"
        sub="Missed calls, empty slots, customers drifting away — the leaks, surfaced and sized in dollars."
        delay={0}
      >
        <CaptureWidget />
      </Card>
      <Card
        lead="Watch"
        rest="your reputation"
        sub="Ratings, review volume, and response time across every location — before a quiet week becomes a quiet month."
        delay={80}
      >
        <ReputationWidget />
      </Card>
    </div>
  );
}
