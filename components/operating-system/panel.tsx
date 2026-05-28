export type TabData = {
  key: string;
  headline: string;
  description: string;
  bullets: string[];
  metric: { label: string; value: string; delta: string; tone: "good" | "bad" };
  legend: string;
  footer: string;
};

export function Panel({ tab }: { tab: TabData }) {
  return (
    <div className="panel-fade-in relative w-full max-w-[560px] overflow-hidden rounded-xl border border-edge bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-edge px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-orange">
            {tab.key}
          </span>
          <span className="font-mono text-[11px] text-ink-dimmer">
            · last 30 days
          </span>
        </div>
        <span className="font-mono text-[11px] text-ink-dim">4 stores ▾</span>
      </div>

      <div className="px-6 pt-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dimmer">
          {tab.metric.label}
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-[36px] font-medium tracking-[-0.02em]">
          <span>{tab.metric.value}</span>
          <span
            className={`font-mono text-[14px] ${
              tab.metric.tone === "bad" ? "text-[#F87171]" : "text-orange"
            }`}
          >
            {tab.metric.delta}
          </span>
        </div>
      </div>

      <div className="px-6 pb-6 pt-5">
        <PanelViz tabKey={tab.key} />
      </div>

      <div className="flex items-center justify-between border-t border-edge bg-orange-wash px-6 py-3.5">
        <div className="text-[13px]">
          <span className="text-orange">● </span>
          {tab.legend}
        </div>
        <span className="font-mono text-[11px]">{tab.footer}</span>
      </div>
    </div>
  );
}

function PanelViz({ tabKey }: { tabKey: string }) {
  switch (tabKey) {
    case "Findability":
      return <FindabilityViz />;
    case "Capture":
      return <CaptureViz />;
    case "Convert":
      return <ConvertViz />;
    case "Retain":
      return <RetainViz />;
    case "Reputation":
      return <ReputationViz />;
    case "Money":
      return <MoneyViz />;
    default:
      return null;
  }
}

/* ---------- Findability: SEO + GEO split ---------- */
function FindabilityViz() {
  const keywords = [
    { kw: "dog grooming orlando", rank: 2, delta: "↑3", type: "SEO" as const },
    { kw: "pet spa near me", rank: 1, delta: "↑1", type: "GEO" as const },
    { kw: "puppy bath orlando", rank: 5, delta: "↓1", type: "SEO" as const },
    { kw: "groomer near me", rank: 1, delta: "↑2", type: "GEO" as const },
  ];
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative overflow-hidden rounded-md border border-edge bg-white/[0.02] px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
            <span>SEO · Organic</span>
            <span className="text-orange">↑3</span>
          </div>
          <div className="mt-0.5 font-mono text-[15px] tracking-[-0.01em] text-ink">
            avg <span className="text-orange">#3.4</span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] text-ink-dimmer">
            12 keywords tracked
          </div>
        </div>
        <div className="relative overflow-hidden rounded-md border border-orange/30 bg-orange/[0.05] px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-orange/80">
            <span>GEO · Local pack</span>
            <span className="text-orange">↑1</span>
          </div>
          <div className="mt-0.5 font-mono text-[15px] tracking-[-0.01em] text-ink">
            avg <span className="text-orange">#1.5</span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] text-ink-dimmer">
            4 markets · 3-mi radius
          </div>
        </div>
      </div>

      {keywords.map((k, i) => (
        <div
          key={k.kw}
          className="bar-rise flex items-center gap-2.5 rounded-md border border-edge bg-white/[0.015] px-3 py-1.5"
          style={{ animationDelay: `${100 + i * 60}ms` }}
        >
          <span
            className="flex h-6 w-9 shrink-0 items-center justify-center rounded font-mono text-[12px] font-medium"
            style={{
              background:
                k.type === "GEO"
                  ? "rgba(254,81,0,0.15)"
                  : "rgba(255,255,255,0.04)",
              color: k.type === "GEO" ? "#FE5100" : "rgba(255,255,255,0.85)",
            }}
          >
            #{k.rank}
          </span>
          <span className="flex-1 truncate text-[12px] tracking-[-0.005em] text-ink-dim">
            “{k.kw}”
          </span>
          <span
            className="shrink-0 rounded-sm px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.08em]"
            style={{
              background:
                k.type === "GEO"
                  ? "rgba(254,81,0,0.12)"
                  : "rgba(255,255,255,0.05)",
              color:
                k.type === "GEO" ? "#FE5100" : "rgba(255,255,255,0.45)",
            }}
          >
            {k.type}
          </span>
          <span
            className={`w-7 shrink-0 text-right font-mono text-[10px] ${
              k.delta.startsWith("↑") ? "text-orange" : "text-[#F87171]"
            }`}
          >
            {k.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Capture: iOS-style missed call list ---------- */
function CaptureViz() {
  const calls = [
    { phone: "+1 (407) 555-0148", time: "12:42 AM", count: 2, label: "Mobile" },
    { phone: "+1 (321) 555-0902", time: "11:28 PM", count: 1, label: "Mobile" },
    { phone: "+1 (407) 555-2241", time: "10:15 PM", count: 3, label: "Mobile" },
    { phone: "+1 (407) 555-0166", time: "9:48 PM", count: 1, label: "Mobile" },
  ];
  const RED = "#FF453A";

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-edge bg-black/40">
      <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
          Recents · Missed
        </span>
        <span className="font-mono text-[10px]" style={{ color: RED }}>
          ● 38 unanswered today
        </span>
      </div>
      {calls.map((c, i) => (
        <div
          key={c.phone}
          className="bar-rise flex items-center gap-3 px-3 py-2"
          style={{
            animationDelay: `${i * 75}ms`,
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
          }}
        >
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full"
            style={{
              background: "rgba(255,69,58,0.12)",
              boxShadow: "0 0 0 1px rgba(255,69,58,0.25)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"
                fill={RED}
              />
              <path d="M16 4l4 4M20 4l-4 4" stroke={RED} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-[13px] tracking-[-0.005em] text-ink">
                {c.phone}
              </span>
              {c.count > 1 && (
                <span className="font-mono text-[11px]" style={{ color: RED }}>
                  ({c.count})
                </span>
              )}
            </div>
            <div className="font-mono text-[10px]" style={{ color: RED }}>
              Missed Call <span className="text-ink-dimmer">· {c.label}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="font-mono text-[10px] text-ink-dim">{c.time}</span>
            <span
              className="grid size-4 place-items-center rounded-full border text-[9px]"
              style={{
                borderColor: "rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              i
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Convert: visual funnel ---------- */
function ConvertViz() {
  const stages = [
    { label: "Visits", value: 4820, w: 1, drop: null as string | null },
    { label: "Form started", value: 1240, w: 0.62, drop: "−74%" },
    { label: "Form complete", value: 720, w: 0.42, drop: "−42%" },
    { label: "Confirmed booking", value: 230, w: 0.22, drop: "−68%", best: true },
  ];
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => (
        <div
          key={s.label}
          className="bar-rise"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="flex justify-center">
            <div
              className="relative flex h-9 items-center justify-between gap-3 rounded-md px-3"
              style={{
                width: `${s.w * 100}%`,
                minWidth: 130,
                background: s.best
                  ? "linear-gradient(90deg, rgba(254,81,0,0.18), rgba(254,81,0,0.55), rgba(254,81,0,0.18))"
                  : "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
                border: `1px solid ${
                  s.best ? "rgba(254,81,0,0.6)" : "rgba(255,255,255,0.08)"
                }`,
                boxShadow: s.best ? "0 0 22px rgba(254,81,0,0.35)" : "none",
              }}
            >
              <span
                className={`truncate text-[12px] tracking-[-0.005em] ${
                  s.best ? "text-white" : "text-ink-dim"
                }`}
              >
                {s.label}
              </span>
              <span
                className={`shrink-0 font-mono text-[12px] tracking-[-0.005em] ${
                  s.best ? "text-white" : "text-ink"
                }`}
              >
                {s.value.toLocaleString()}
              </span>
            </div>
          </div>
          {s.drop && (
            <div className="mt-0.5 flex justify-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#F87171]">
                ↓ {s.drop} drop-off
              </span>
            </div>
          )}
        </div>
      ))}
      <div className="!mt-3 flex items-center justify-between rounded-md border border-dashed border-edge-strong px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
          End-to-end conversion
        </span>
        <span className="font-mono text-[12px] text-orange">
          4.8% · ↑1.2pp 30d
        </span>
      </div>
    </div>
  );
}

/* ---------- Retain: cohort heatmap ---------- */
function RetainViz() {
  const cols = ["D0", "D30", "D60", "D90"] as const;
  type Col = (typeof cols)[number];
  const rows: Array<{ label: string; best?: boolean } & Record<Col, number>> = [
    { label: "Feb '26", D0: 100, D30: 74, D60: 48, D90: 28 },
    { label: "Mar '26", D0: 100, D30: 78, D60: 52, D90: 30 },
    { label: "Apr '26", D0: 100, D30: 82, D60: 58, D90: 36 },
    { label: "May '26", D0: 100, D30: 86, D60: 64, D90: 42, best: true },
  ];

  const cellBg = (v: number, best: boolean) => {
    const a = v / 100;
    return best
      ? `rgba(254, 81, 0, ${0.12 + a * 0.6})`
      : `rgba(255, 255, 255, ${0.025 + a * 0.16})`;
  };

  return (
    <div className="overflow-hidden rounded-md border border-edge">
      <div className="grid grid-cols-[78px_1fr_1fr_1fr_1fr] bg-white/[0.02]">
        <span className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
          Cohort
        </span>
        {cols.map((c) => (
          <span
            key={c}
            className="border-l border-edge px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer"
          >
            {c}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={row.label}
          className="bar-rise grid grid-cols-[78px_1fr_1fr_1fr_1fr] border-t border-edge"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span
            className={`flex items-center px-3 py-2 font-mono text-[11px] tracking-[-0.005em] ${
              row.best ? "text-orange" : "text-ink-dim"
            }`}
          >
            {row.label}
          </span>
          {cols.map((c) => {
            const v = row[c];
            return (
              <div
                key={c}
                className="relative border-l border-edge text-center font-mono text-[11px] tracking-[-0.005em]"
                style={{
                  background: cellBg(v, !!row.best),
                  color: row.best
                    ? "#fff"
                    : `rgba(255,255,255,${0.55 + (v / 100) * 0.35})`,
                  padding: "8px 0",
                  boxShadow: row.best && c === "D90"
                    ? "inset 0 0 16px rgba(254,81,0,0.35)"
                    : undefined,
                }}
              >
                {v}%
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- Reputation: rating + recent reviews + SLA ---------- */
function ReputationViz() {
  const reviews = [
    { stars: 5, text: "Best groomers in town. Booked again same day.", resp: "1h" },
    { stars: 5, text: "Took such good care of our Lola — will return.", resp: "22m" },
    { stars: 4, text: "Pricey but worth it. The cut lasted weeks.", resp: "3h" },
    { stars: 2, text: "Long wait time. Staff was apologetic though.", resp: "45m", bad: true },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md border border-edge bg-white/[0.02] px-3 py-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-medium leading-none tracking-[-0.02em]">
              4.7
            </span>
            <span className="flex gap-[1px]">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="text-[13px] leading-none"
                  style={{ color: "#FE5100" }}
                >
                  ★
                </span>
              ))}
            </span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
            721 reviews · ↑0.3 vs Q1
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
            Response rate
          </div>
          <div className="mt-0.5 font-mono text-[14px] text-orange">
            82% <span className="text-ink-dimmer">· &lt; 4h SLA</span>
          </div>
        </div>
      </div>

      {reviews.map((r, i) => (
        <div
          key={i}
          className="bar-rise flex items-center gap-2.5 rounded-md border border-edge px-3 py-1.5"
          style={{
            animationDelay: `${i * 70}ms`,
            background: r.bad
              ? "rgba(248,113,113,0.04)"
              : "rgba(255,255,255,0.015)",
          }}
        >
          <span className="flex w-[56px] shrink-0 gap-[1px]">
            {Array.from({ length: 5 }).map((_, j) => (
              <span
                key={j}
                className="text-[10px] leading-none"
                style={{
                  color:
                    j < r.stars
                      ? r.stars >= 4
                        ? "#FE5100"
                        : "#F87171"
                      : "rgba(255,255,255,0.14)",
                }}
              >
                ★
              </span>
            ))}
          </span>
          <span className="flex-1 truncate text-[11.5px] italic tracking-[-0.005em] text-ink-dim">
            “{r.text}”
          </span>
          <span className="shrink-0 font-mono text-[10px] text-ink-dimmer">
            ↳ {r.resp}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Money: revenue area + channel split ---------- */
function MoneyViz() {
  const revenue = [
    44, 48, 54, 50, 58, 60, 64, 68, 70, 72, 74, 70, 78, 80, 74, 82, 84, 80, 76,
    72, 70, 66, 62, 60,
  ];
  const max = Math.max(...revenue);
  const w = 480;
  const h = 90;
  const stepX = w / (revenue.length - 1);
  const points = revenue.map((v, i) => `${i * stepX},${h - (v / max) * h}`);
  const polyStr = points.map((p) => p).join(" ");
  const lastX = (revenue.length - 1) * stepX;
  const lastY = h - (revenue[revenue.length - 1] / max) * h;

  const channels = [
    { name: "Direct", value: "$78k", w: 0.42 },
    { name: "Google", value: "$54k", w: 0.29 },
    { name: "Referral", value: "$32k", w: 0.17 },
    { name: "Repeat", value: "$22k", w: 0.12, best: true },
  ];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h + 6}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="money-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(254,81,0,0.35)" />
            <stop offset="100%" stopColor="rgba(254,81,0,0)" />
          </linearGradient>
        </defs>
        <line x1="0" y1={h} x2={w} y2={h} stroke="rgba(255,255,255,0.06)" />
        <polyline
          points={`0,${h} ${polyStr} ${w},${h}`}
          fill="url(#money-fill)"
        />
        <polyline
          points={polyStr}
          fill="none"
          stroke="#FE5100"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: "drop-shadow(0 0 5px rgba(254,81,0,0.4))",
          }}
        />
        <circle cx={lastX} cy={lastY} r="3" fill="#FE5100" />
        <circle
          cx={lastX}
          cy={lastY}
          r="7"
          fill="none"
          stroke="rgba(254,81,0,0.4)"
          strokeWidth="1"
        />
      </svg>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {channels.map((c, i) => (
          <div
            key={c.name}
            className="bar-rise rounded-md border bg-white/[0.02] px-2.5 py-2"
            style={{
              borderColor: c.best
                ? "rgba(254,81,0,0.45)"
                : "rgba(255,255,255,0.08)",
              animationDelay: `${180 + i * 70}ms`,
            }}
          >
            <div
              className="font-mono text-[9px] uppercase tracking-[0.06em]"
              style={{ color: c.best ? "#FE5100" : "rgba(255,255,255,0.45)" }}
            >
              {c.name}
            </div>
            <div className="mt-0.5 text-[14px] tracking-[-0.01em]">
              {c.value}
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${c.w * 100}%`,
                  background: c.best ? "#FE5100" : "rgba(255,255,255,0.35)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
