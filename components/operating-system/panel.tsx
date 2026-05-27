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

/* ---------- Findability: live rank ladder ---------- */
function FindabilityViz() {
  const rows = [
    { rank: 1, name: "Your store", you: true, delta: "↑ 2", strength: 1 },
    { rank: 2, name: "Petsmart Grooming", delta: "↓ 1", strength: 0.84 },
    { rank: 3, name: "Pampered Pups", delta: "—", strength: 0.7 },
    { rank: 4, name: "BarkBox Local", delta: "↓ 1", strength: 0.54 },
    { rank: 5, name: "Top Dog Salon", delta: "↑ 1", strength: 0.4 },
  ];
  return (
    <div className="grid gap-1.5">
      {rows.map((r, i) => (
        <div
          key={r.name}
          className="bar-rise relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2"
          style={{
            background: r.you ? "rgba(254,81,0,0.08)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${
              r.you ? "rgba(254,81,0,0.5)" : "rgba(255,255,255,0.06)"
            }`,
            animationDelay: `${i * 70}ms`,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{
              width: `${r.strength * 100}%`,
              background: r.you
                ? "linear-gradient(90deg, rgba(254,81,0,0.18), transparent)"
                : "linear-gradient(90deg, rgba(255,255,255,0.04), transparent)",
            }}
          />
          <span
            className={`relative w-7 font-mono text-[12px] ${
              r.you ? "text-orange" : "text-ink-dimmer"
            }`}
          >
            #{r.rank}
          </span>
          <span
            className="relative size-1.5 rounded-full"
            style={{
              background: r.you ? "#FE5100" : "rgba(255,255,255,0.4)",
              boxShadow: r.you ? "0 0 0 3px rgba(254,81,0,0.18)" : "none",
            }}
          />
          <span
            className={`relative flex-1 text-[13px] tracking-[-0.005em] ${
              r.you ? "text-white" : "text-ink-dim"
            }`}
          >
            {r.name}
          </span>
          <span
            className={`relative font-mono text-[11px] ${
              r.delta.startsWith("↑")
                ? "text-orange"
                : r.delta.startsWith("↓")
                ? "text-[#F87171]"
                : "text-ink-dimmer"
            }`}
          >
            {r.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Capture: live call log ---------- */
function CaptureViz() {
  const calls = [
    { time: "12:42 AM", phone: "+1 (407) 555-0148", missed: true, action: "Booked", booked: true },
    { time: "11:28 PM", phone: "+1 (321) 555-0902", missed: true, action: "SMS reply" },
    { time: "10:15 PM", phone: "+1 (407) 555-2241", missed: true, action: "SMS reply" },
    { time: "9:48 PM", phone: "+1 (407) 555-0166", missed: true, action: "Booked", booked: true },
    { time: "8:22 PM", phone: "+1 (321) 555-7733", missed: false, action: "Connected" },
  ];
  return (
    <div className="grid gap-1.5">
      {calls.map((c, i) => (
        <div
          key={c.time}
          className="bar-rise flex items-center gap-3 rounded-md border border-edge bg-white/[0.015] px-3 py-[7px]"
          style={{ animationDelay: `${i * 65}ms` }}
        >
          <span
            className="size-2 rounded-full"
            style={{
              background: c.missed ? "#FE5100" : "rgba(255,255,255,0.4)",
              boxShadow: c.missed
                ? "0 0 0 3px rgba(254,81,0,0.15)"
                : "0 0 0 3px rgba(255,255,255,0.04)",
            }}
          />
          <span className="w-[68px] font-mono text-[11px] text-ink-dim">
            {c.time}
          </span>
          <span className="flex-1 truncate font-mono text-[11px] text-ink-dimmer">
            {c.phone}
          </span>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
              c.booked
                ? "text-orange"
                : c.missed
                ? "text-ink-dim"
                : "text-ink-dimmer"
            }`}
          >
            {c.action}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Convert: funnel ---------- */
function ConvertViz() {
  const stages = [
    { label: "Visits", value: 4820, w: 1, drop: null as string | null },
    { label: "Form started", value: 1240, w: 0.55, drop: "−74%" },
    { label: "Form complete", value: 720, w: 0.36, drop: "−42%" },
    { label: "Confirmed booking", value: 230, w: 0.18, drop: "−68%", best: true },
  ];
  return (
    <div className="space-y-3">
      {stages.map((s, i) => (
        <div
          key={s.label}
          className="bar-rise"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="mb-1.5 flex items-end justify-between">
            <span
              className={`text-[12.5px] tracking-[-0.005em] ${
                s.best ? "text-orange" : "text-ink-dim"
              }`}
            >
              {s.label}
            </span>
            <div className="flex items-baseline gap-2">
              {s.drop && (
                <span className="font-mono text-[10px] text-ink-dimmer">
                  {s.drop}
                </span>
              )}
              <span className="font-mono text-[13px] tracking-[-0.005em]">
                {s.value.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="relative h-[10px] overflow-hidden rounded-[3px] bg-white/[0.04]">
            <div
              className="absolute inset-y-0 left-0 rounded-[3px]"
              style={{
                width: `${s.w * 100}%`,
                background: s.best
                  ? "linear-gradient(90deg, #FE5100 0%, rgba(254,81,0,0.45) 100%)"
                  : "linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.16) 100%)",
                boxShadow: s.best ? "0 0 14px rgba(254,81,0,0.4)" : "none",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Retain: cohort curves ---------- */
function RetainViz() {
  const cohorts = [
    {
      label: "Mar",
      pts: [100, 78, 64, 52, 44, 38, 33, 30],
      color: "rgba(255,255,255,0.22)",
    },
    {
      label: "Apr",
      pts: [100, 82, 70, 58, 50, 44, 40, 36],
      color: "rgba(255,255,255,0.45)",
    },
    {
      label: "May",
      pts: [100, 86, 74, 64, 56, 50, 46, 42],
      color: "#FE5100",
      best: true,
    },
  ];
  const w = 480;
  const h = 130;
  const stepX = w / 7;
  const yFor = (v: number) => h - ((v - 25) / 75) * h;

  return (
    <svg
      viewBox={`0 0 ${w + 24} ${h + 22}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1="0"
          y1={p * h}
          x2={w}
          y2={p * h}
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray={p === 0 || p === 1 ? "" : "2 4"}
        />
      ))}

      <text x="0" y="-4" fontSize="9" fontFamily="monospace" fill="rgba(255,255,255,0.4)">
        100%
      </text>
      <text x="0" y={h + 12} fontSize="9" fontFamily="monospace" fill="rgba(255,255,255,0.4)">
        25%
      </text>

      {cohorts.map((c, ci) => {
        const points = c.pts
          .map((v, i) => `${i * stepX},${yFor(v)}`)
          .join(" ");
        const lastX = 7 * stepX;
        const lastY = yFor(c.pts[7]);
        return (
          <g key={c.label}>
            <polyline
              points={points}
              fill="none"
              stroke={c.color}
              strokeWidth={c.best ? 2 : 1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter: c.best
                  ? "drop-shadow(0 0 6px rgba(254,81,0,0.45))"
                  : "none",
                strokeDasharray: 600,
                strokeDashoffset: 0,
                animation: `panel-fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${
                  ci * 0.12
                }s backwards`,
              }}
            />
            {c.best && (
              <circle
                cx={lastX}
                cy={lastY}
                r="3.5"
                fill="#FE5100"
                style={{
                  filter: "drop-shadow(0 0 6px rgba(254,81,0,0.6))",
                }}
              />
            )}
            <text
              x={lastX + 8}
              y={lastY + 3}
              fontSize="10"
              fontFamily="monospace"
              fill={c.color}
            >
              {c.label}
            </text>
          </g>
        );
      })}

      <text
        x="0"
        y={h + 18}
        fontSize="9"
        fontFamily="monospace"
        fill="rgba(255,255,255,0.4)"
      >
        D0
      </text>
      <text
        x={3 * stepX}
        y={h + 18}
        fontSize="9"
        fontFamily="monospace"
        fill="rgba(255,255,255,0.4)"
        textAnchor="middle"
      >
        D30
      </text>
      <text
        x={5 * stepX}
        y={h + 18}
        fontSize="9"
        fontFamily="monospace"
        fill="rgba(255,255,255,0.4)"
        textAnchor="middle"
      >
        D60
      </text>
      <text
        x={7 * stepX}
        y={h + 18}
        fontSize="9"
        fontFamily="monospace"
        fill="rgba(255,255,255,0.4)"
        textAnchor="middle"
      >
        D90
      </text>
    </svg>
  );
}

/* ---------- Reputation: star distribution ---------- */
function ReputationViz() {
  const rows = [
    { stars: 5, count: 412, w: 1 },
    { stars: 4, count: 218, w: 0.52 },
    { stars: 3, count: 64, w: 0.16 },
    { stars: 2, count: 22, w: 0.06 },
    { stars: 1, count: 9, w: 0.025 },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div
          key={r.stars}
          className="bar-rise flex items-center gap-3"
          style={{ animationDelay: `${i * 75}ms` }}
        >
          <div className="flex w-[68px] items-center gap-[1px]">
            {Array.from({ length: 5 }).map((_, j) => (
              <span
                key={j}
                className="text-[11px] leading-none"
                style={{
                  color:
                    j < r.stars
                      ? r.stars >= 4
                        ? "#FE5100"
                        : "rgba(255,255,255,0.7)"
                      : "rgba(255,255,255,0.14)",
                }}
              >
                ★
              </span>
            ))}
          </div>
          <div className="relative h-[8px] flex-1 overflow-hidden rounded-[2px] bg-white/[0.04]">
            <div
              className="absolute inset-y-0 left-0 rounded-[2px]"
              style={{
                width: `${r.w * 100}%`,
                background:
                  r.stars >= 4
                    ? "linear-gradient(90deg, #FE5100 0%, rgba(254,81,0,0.5) 100%)"
                    : "linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 100%)",
              }}
            />
          </div>
          <span className="w-10 text-right font-mono text-[12px] text-ink-dim">
            {r.count}
          </span>
        </div>
      ))}
      <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-edge-strong px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
          Response rate
        </span>
        <span className="font-mono text-[12px] text-orange">82% · &lt; 4h SLA</span>
      </div>
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
