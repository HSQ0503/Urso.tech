type IlloProps = { hover: boolean };

const lineColor = (hover: boolean) =>
  hover ? "#FE5100" : "rgba(255,255,255,0.22)";
const lineGlow = (hover: boolean) =>
  hover ? "drop-shadow(0 0 12px rgba(254,81,0,0.35))" : "none";

export function DataLayerIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const sources: Array<{ label: string; glyph: "grid" | "cal" | "pin" | "dollar" }> = [
    { label: "POS", glyph: "grid" },
    { label: "CALENDAR", glyph: "cal" },
    { label: "GOOGLE", glyph: "pin" },
    { label: "FINANCE", glyph: "dollar" },
  ];

  const renderGlyph = (g: typeof sources[number]["glyph"], cx: number, cy: number) => {
    const stroke = hover ? "#FE5100" : "rgba(255,255,255,0.55)";
    switch (g) {
      case "grid":
        return (
          <g stroke={stroke} strokeWidth="1" fill="none" style={{ transition: "stroke .3s" }}>
            <rect x={cx - 5} y={cy - 5} width="4" height="4" rx="0.5" />
            <rect x={cx + 1} y={cy - 5} width="4" height="4" rx="0.5" />
            <rect x={cx - 5} y={cy + 1} width="4" height="4" rx="0.5" />
            <rect x={cx + 1} y={cy + 1} width="4" height="4" rx="0.5" />
          </g>
        );
      case "cal":
        return (
          <g stroke={stroke} strokeWidth="1" fill="none" style={{ transition: "stroke .3s" }}>
            <rect x={cx - 5} y={cy - 4} width="10" height="9" rx="1" />
            <line x1={cx - 5} y1={cy - 1} x2={cx + 5} y2={cy - 1} />
            <line x1={cx - 2.5} y1={cy - 5.5} x2={cx - 2.5} y2={cy - 3} />
            <line x1={cx + 2.5} y1={cy - 5.5} x2={cx + 2.5} y2={cy - 3} />
          </g>
        );
      case "pin":
        return (
          <g stroke={stroke} strokeWidth="1" fill="none" style={{ transition: "stroke .3s" }}>
            <path d={`M${cx} ${cy - 5}c-2 0-3.5 1.5-3.5 3.5 0 2.5 3.5 5.5 3.5 5.5s3.5-3 3.5-5.5c0-2-1.5-3.5-3.5-3.5z`} />
            <circle cx={cx} cy={cy - 1.5} r="1.3" />
          </g>
        );
      case "dollar":
        return (
          <g stroke={stroke} strokeWidth="1" fill="none" strokeLinecap="round" style={{ transition: "stroke .3s" }}>
            <path d={`M${cx + 2.5} ${cy - 3.5}c-1-1-3.5-1.2-4.5 0-1 1.2 0 2.5 1.5 2.8 1.5.3 3 .8 3 2.2 0 1.4-2 2-3.5 1.7-1-.2-1.8-.8-2-1.5`} />
            <line x1={cx} y1={cy - 5.5} x2={cx} y2={cy + 5.5} />
          </g>
        );
    }
  };

  return (
    <svg
      viewBox="0 0 380 200"
      className="w-full max-w-[440px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <defs>
        <linearGradient id="data-layer-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(254,81,0,0)" />
          <stop offset="50%" stopColor="rgba(254,81,0,0.18)" />
          <stop offset="100%" stopColor="rgba(254,81,0,0)" />
        </linearGradient>
        <linearGradient id="data-layer-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="50%" stopColor={hover ? "#FE5100" : "rgba(255,255,255,0.35)"} />
          <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
      </defs>

      {sources.map((s, i) => {
        const x = 40 + i * 80;
        const cx = x + 36;
        return (
          <g key={s.label}>
            <rect
              x={x}
              y={18}
              width="72"
              height="36"
              rx="6"
              stroke={c}
              strokeWidth="1"
              fill="rgba(255,255,255,0.015)"
              style={{ transition: "stroke .3s" }}
            />
            {renderGlyph(s.glyph, x + 14, 36)}
            <text
              x={x + 26}
              y={40}
              fontSize="8.5"
              fontFamily="monospace"
              fill={c}
              opacity="0.85"
              style={{ transition: "fill .3s", letterSpacing: "0.05em" }}
            >
              {s.label}
            </text>

            <line
              x1={cx}
              y1={54}
              x2={cx}
              y2={130}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            {hover && (
              <circle r="2.2" fill="#FE5100">
                <animate
                  attributeName="cy"
                  from="56"
                  to="130"
                  dur="1.4s"
                  begin={`${i * 0.18}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cx"
                  values={`${cx};${cx}`}
                  dur="1.4s"
                  begin={`${i * 0.18}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.1;0.85;1"
                  dur="1.4s"
                  begin={`${i * 0.18}s`}
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </g>
        );
      })}

      <rect
        x="20"
        y="130"
        width="340"
        height="44"
        rx="6"
        fill={hover ? "url(#data-layer-fill)" : "rgba(255,255,255,0.02)"}
        style={{ transition: "fill .4s" }}
      />
      <rect
        x="20"
        y="130"
        width="340"
        height="44"
        rx="6"
        stroke={hover ? "url(#data-layer-edge)" : c}
        strokeWidth="1.2"
        fill="none"
        style={{ transition: "stroke .4s" }}
      />

      {Array.from({ length: 28 }).map((_, i) => {
        const x = 32 + i * 12;
        return (
          <line
            key={i}
            x1={x}
            y1={158}
            x2={x}
            y2={166}
            stroke={hover ? "#FE5100" : "rgba(255,255,255,0.25)"}
            strokeWidth="1"
            opacity={hover ? 0.4 + (i % 4) * 0.15 : 0.3}
            style={{
              transition: `stroke .3s ${i * 0.01}s, opacity .3s ${i * 0.01}s`,
            }}
          />
        );
      })}

      <text
        x="190"
        y="148"
        fontSize="9"
        fontFamily="monospace"
        fill={hover ? "#fff" : c}
        textAnchor="middle"
        opacity="0.9"
        style={{ transition: "fill .3s", letterSpacing: "0.14em" }}
      >
        ONE DATA LAYER · ALL STORES
      </text>
    </svg>
  );
}

export function ReviewsIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  return (
    <svg
      viewBox="0 0 320 200"
      className="w-full max-w-[320px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      {[120, 95, 70, 50].map((r, i) => (
        <rect
          key={r}
          x={160 - r}
          y={100 - r}
          width={r * 2}
          height={r * 2}
          rx={r * 0.45}
          stroke={c}
          strokeWidth="1"
          fill="none"
          opacity={0.3 - i * 0.05}
          style={{
            transition:
              "stroke .3s, transform .6s cubic-bezier(.22,1,.36,1)",
            transform: hover ? `scale(${1 + i * 0.02})` : "scale(1)",
            transformOrigin: "160px 100px",
          }}
        />
      ))}
      <g
        style={{
          transition: "transform .6s cubic-bezier(.22,1,.36,1)",
          transformOrigin: "160px 100px",
          transform: hover ? "rotate(10deg) scale(1.05)" : "rotate(0deg) scale(1)",
        }}
      >
        <path
          d="M160 55 l12 28 30 3 -23 21 7 30 -26 -16 -26 16 7 -30 -23 -21 30 -3z"
          stroke={c}
          strokeWidth="2"
          fill={hover ? "rgba(254,81,0,0.08)" : "none"}
          strokeLinejoin="round"
          style={{ transition: "stroke .3s, fill .3s" }}
        />
      </g>
      {(
        [
          [60, 45, 6, "0s"],
          [260, 55, 5, ".3s"],
          [70, 150, 4, ".6s"],
          [255, 160, 5, ".15s"],
          [200, 35, 4, ".45s"],
        ] as Array<[number, number, number, string]>
      ).map(([x, y, s, d], i) => (
        <g
          key={i}
          style={{
            transformOrigin: `${x}px ${y}px`,
            animation: hover ? "urso-twinkle 1.6s ease-in-out infinite" : "none",
            animationDelay: d,
          }}
        >
          <path
            d={`M${x} ${y - s} l${s * 0.4} ${s * 0.9} ${s * 1.05} 0.1 -${
              s * 0.85
            } ${s * 0.65} ${s * 0.32} ${s} -${s * 0.92} -${s * 0.55} -${
              s * 0.92
            } ${s * 0.55} ${s * 0.32} -${s} -${s * 0.85} -${s * 0.65} ${
              s * 1.05
            } -0.1z`}
            stroke={c}
            strokeWidth="1.2"
            fill="none"
            opacity="0.6"
            style={{ transition: "stroke .3s" }}
          />
        </g>
      ))}
    </svg>
  );
}

export function BookingsIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const bookings: Array<{ time: string; name: string; delay: number; accent?: boolean }> = [
    { time: "09:30", name: "M. Chen", delay: 0 },
    { time: "11:00", name: "A. Patel", delay: 0.12 },
    { time: "13:15", name: "J. Rivera", delay: 0.24, accent: true },
    { time: "15:45", name: "S. Kim", delay: 0.36 },
  ];
  return (
    <svg
      viewBox="0 0 320 200"
      className="w-full max-w-[340px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <rect
        x="14"
        y="10"
        width="180"
        height="180"
        rx="10"
        stroke={c}
        strokeWidth="1"
        fill="rgba(255,255,255,0.015)"
        style={{ transition: "stroke .3s" }}
      />
      <text
        x="28"
        y="30"
        fontSize="9"
        fontFamily="monospace"
        fill={c}
        opacity="0.7"
        style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
      >
        APR · WEEK 14
      </text>
      <line x1="14" y1="42" x2="194" y2="42" stroke={c} strokeWidth="1" opacity="0.35" />
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <text
          key={i}
          x={28 + i * 24}
          y={58}
          fontSize="8.5"
          fontFamily="monospace"
          fill={c}
          opacity="0.5"
          textAnchor="middle"
          style={{ transition: "fill .3s" }}
        >
          {d}
        </text>
      ))}
      {Array.from({ length: 28 }).map((_, i) => {
        const col = i % 7;
        const row = Math.floor(i / 7);
        const x = 28 + col * 24;
        const y = 80 + row * 24;
        const booked = [4, 9, 11, 16, 18, 22, 25].includes(i);
        const today = i === 11;
        const filled = hover ? booked : i === 11;
        return (
          <g key={i}>
            <rect
              x={x - 9}
              y={y - 8}
              width="18"
              height="16"
              rx="3"
              fill={
                filled && today
                  ? "#FE5100"
                  : filled
                  ? "rgba(254,81,0,0.18)"
                  : "transparent"
              }
              stroke={today ? "#FE5100" : "rgba(255,255,255,0.08)"}
              strokeWidth="1"
              style={{
                transition: `fill .35s ease ${i * 0.015}s, stroke .3s`,
              }}
            />
            <text
              x={x}
              y={y + 3}
              fontSize="7.5"
              fontFamily="monospace"
              fill={
                filled && today
                  ? "#fff"
                  : filled
                  ? "#FE5100"
                  : "rgba(255,255,255,0.4)"
              }
              textAnchor="middle"
              style={{ transition: "fill .3s" }}
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      <rect
        x="206"
        y="10"
        width="100"
        height="180"
        rx="10"
        stroke={c}
        strokeWidth="1"
        fill="rgba(255,255,255,0.015)"
        style={{ transition: "stroke .3s" }}
      />
      <text
        x="218"
        y="30"
        fontSize="9"
        fontFamily="monospace"
        fill={c}
        opacity="0.7"
        style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
      >
        TODAY
      </text>
      <line x1="206" y1="42" x2="306" y2="42" stroke={c} strokeWidth="1" opacity="0.35" />
      {bookings.map((b, i) => {
        const y = 56 + i * 32;
        return (
          <g
            key={b.time}
            style={{
              opacity: hover ? 1 : 0.35,
              transform: hover ? "translateX(0)" : "translateX(-6px)",
              transition: `opacity .4s ease ${b.delay}s, transform .4s ease ${b.delay}s`,
            }}
          >
            <rect
              x="214"
              y={y}
              width="84"
              height="24"
              rx="4"
              fill={b.accent && hover ? "rgba(254,81,0,0.12)" : "rgba(255,255,255,0.02)"}
              stroke={b.accent && hover ? "#FE5100" : "rgba(255,255,255,0.1)"}
              strokeWidth="1"
              style={{ transition: "stroke .3s, fill .3s" }}
            />
            <text
              x="222"
              y={y + 11}
              fontSize="7.5"
              fontFamily="monospace"
              fill={b.accent && hover ? "#FE5100" : "rgba(255,255,255,0.85)"}
              style={{ transition: "fill .3s", letterSpacing: "0.05em" }}
            >
              {b.time}
            </text>
            <text
              x="222"
              y={y + 20}
              fontSize="7"
              fontFamily="monospace"
              fill="rgba(255,255,255,0.45)"
            >
              {b.name}
            </text>
            <circle
              cx="293"
              cy={y + 12}
              r="2.5"
              fill={b.accent && hover ? "#FE5100" : "rgba(255,255,255,0.3)"}
              style={{ transition: "fill .3s" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function MissedCallIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  return (
    <svg
      viewBox="0 0 320 220"
      className="w-full max-w-[340px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <g
        style={{
          transformOrigin: "70px 110px",
          transition: "transform .4s cubic-bezier(.22,1,.36,1)",
          transform: hover ? "rotate(-4deg) translateY(-2px)" : "rotate(0deg)",
        }}
      >
        <rect
          x="26"
          y="26"
          width="88"
          height="168"
          rx="14"
          stroke={c}
          strokeWidth="1.2"
          fill="#0a0a0a"
          style={{ transition: "stroke .3s" }}
        />
        <rect
          x="32"
          y="34"
          width="76"
          height="152"
          rx="10"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
          fill="none"
        />
        <circle cx="70" cy="46" r="1.6" fill="rgba(255,255,255,0.4)" />
        <rect x="55" y="44" width="14" height="2" rx="1" fill="rgba(255,255,255,0.15)" />

        <text x="40" y="62" fontSize="6.5" fontFamily="monospace" fill="rgba(255,255,255,0.45)" style={{ letterSpacing: "0.05em" }}>
          9:42 PM
        </text>
        <g>
          <rect x="34" y="48" width="2" height="6" rx="0.5" fill="rgba(255,255,255,0.35)" />
          <rect x="38" y="46" width="2" height="8" rx="0.5" fill="rgba(255,255,255,0.35)" />
          <rect x="42" y="44" width="2" height="10" rx="0.5" fill="rgba(255,255,255,0.55)" />
          <rect x="46" y="42" width="2" height="12" rx="0.5" fill="rgba(255,255,255,0.7)" />
        </g>
        <text x="104" y="52" fontSize="5.5" fontFamily="monospace" fill="rgba(255,255,255,0.45)" textAnchor="end">100%</text>

        <line x1="32" y1="76" x2="108" y2="76" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        <g
          style={{
            transformOrigin: "70px 95px",
            animation: hover ? "urso-fade 1.6s ease-in-out infinite" : "none",
          }}
        >
          <circle
            cx="70"
            cy="95"
            r="14"
            fill="rgba(254,81,0,0.1)"
            stroke="#FE5100"
            strokeWidth="1.2"
            style={{ transition: "stroke .3s, fill .3s" }}
          />
          <path
            d="M64 89 l12 12 M76 89 l-12 12"
            stroke="#FE5100"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
        <text
          x="70"
          y="124"
          fontSize="7.5"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.7)"}
          textAnchor="middle"
          style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
        >
          MISSED CALL
        </text>
        <text
          x="70"
          y="135"
          fontSize="6.5"
          fontFamily="monospace"
          fill="rgba(255,255,255,0.4)"
          textAnchor="middle"
        >
          +1 (407) 555-0148
        </text>

        <line x1="32" y1="148" x2="108" y2="148" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        <text
          x="40"
          y="162"
          fontSize="6"
          fontFamily="monospace"
          fill="rgba(255,255,255,0.5)"
          style={{ letterSpacing: "0.08em" }}
        >
          AUTO-SMS · NOW
        </text>
        <rect
          x="36"
          y="168"
          width="68"
          height="18"
          rx="3"
          fill={hover ? "rgba(254,81,0,0.15)" : "rgba(255,255,255,0.04)"}
          stroke={hover ? "#FE5100" : "rgba(255,255,255,0.1)"}
          strokeWidth="0.8"
          style={{ transition: "fill .3s, stroke .3s" }}
        />
        <text
          x="40"
          y="180"
          fontSize="6"
          fontFamily="monospace"
          fill={hover ? "#fff" : "rgba(255,255,255,0.6)"}
          style={{ transition: "fill .3s" }}
        >
          Sorry we missed you…
        </text>
      </g>

      <g
        style={{
          transition: "opacity .5s ease, transform .5s cubic-bezier(.22,1,.36,1)",
          opacity: hover ? 1 : 0.35,
          transform: hover ? "translateX(0)" : "translateX(-8px)",
        }}
      >
        <path
          d="M150 38 h130 a10 10 0 0 1 10 10 v36 a10 10 0 0 1 -10 10 h-110 l-12 14 v-14 a10 10 0 0 1 -10 -10 v-36 a10 10 0 0 1 10 -10z"
          stroke={c}
          strokeWidth="1.2"
          fill="#0a0a0a"
          style={{ transition: "stroke .3s" }}
        />
        <text x="160" y="54" fontSize="6.5" fontFamily="monospace" fill="rgba(255,255,255,0.5)" style={{ letterSpacing: "0.08em" }}>
          URSO · OUTBOUND
        </text>
        <line x1="160" y1="60" x2="280" y2="60" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <text x="160" y="74" fontSize="7" fontFamily="monospace" fill="rgba(255,255,255,0.75)">
          Hi we missed your call.
        </text>
        <text x="160" y="84" fontSize="7" fontFamily="monospace" fill={hover ? "#FE5100" : "rgba(255,255,255,0.6)"} style={{ transition: "fill .3s" }}>
          Want us to book you in?
        </text>
        <g
          style={{
            opacity: hover ? 1 : 0,
            transition: "opacity .4s ease .25s",
          }}
        >
          <circle cx="166" cy="96" r="1.4" fill="rgba(255,255,255,0.5)">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" begin="0s" />
          </circle>
          <circle cx="172" cy="96" r="1.4" fill="rgba(255,255,255,0.5)">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" begin="0.2s" />
          </circle>
          <circle cx="178" cy="96" r="1.4" fill="rgba(255,255,255,0.5)">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" begin="0.4s" />
          </circle>
        </g>
      </g>

      <g
        style={{
          transition: "opacity .5s ease .35s, transform .5s cubic-bezier(.22,1,.36,1) .35s",
          opacity: hover ? 1 : 0,
          transform: hover ? "translateX(0)" : "translateX(-8px)",
        }}
      >
        <path
          d="M180 120 h100 a10 10 0 0 1 10 10 v24 a10 10 0 0 1 -10 10 h-86 l-10 12 v-12 a10 10 0 0 1 -14 -10 v-24 a10 10 0 0 1 10 -10z"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.2"
          fill="rgba(255,255,255,0.03)"
        />
        <text x="190" y="136" fontSize="6.5" fontFamily="monospace" fill="rgba(255,255,255,0.4)" style={{ letterSpacing: "0.08em" }}>
          CUSTOMER · INBOUND
        </text>
        <text x="190" y="152" fontSize="7" fontFamily="monospace" fill="rgba(255,255,255,0.85)">
          Yes Thursday 2pm?
        </text>
        <g transform="translate(280, 158)">
          <circle r="4.5" fill="#FE5100" />
          <path d="M-2 0 l1.5 1.5 3 -3.5" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      <line
        x1="118"
        y1="100"
        x2="148"
        y2="68"
        stroke={hover ? "#FE5100" : c}
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity={hover ? 0.7 : 0.3}
        style={{ transition: "stroke .3s, opacity .3s" }}
      />
    </svg>
  );
}

export function SEOIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const rows = [
    { rank: 1, name: "Your Brand Winter Park", restingPos: 2, delta: "↑ 2" },
    { rank: 2, name: "Petsmart Grooming", restingPos: 0, delta: "↓ 1" },
    { rank: 3, name: "Pampered Pups", restingPos: 1, delta: "↓ 1" },
  ];
  return (
    <svg
      viewBox="0 0 320 260"
      className="w-full max-w-[340px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <rect
        x="14"
        y="10"
        width="292"
        height="28"
        rx="14"
        stroke={c}
        strokeWidth="1.2"
        fill="rgba(255,255,255,0.02)"
        style={{ transition: "stroke .3s" }}
      />
      <circle cx="32" cy="24" r="5" stroke={c} strokeWidth="1.2" fill="none" style={{ transition: "stroke .3s" }} />
      <line x1="36" y1="28" x2="40" y2="32" stroke={c} strokeWidth="1.2" style={{ transition: "stroke .3s" }} />
      <text x="48" y="28" fontSize="9" fontFamily="monospace" fill={c} opacity="0.75" style={{ transition: "fill .3s" }}>
        dog grooming near me
      </text>
      <g transform="translate(258, 18)">
        <rect width="38" height="12" rx="2" fill={hover ? "rgba(254,81,0,0.15)" : "rgba(255,255,255,0.04)"} stroke={hover ? "#FE5100" : "rgba(255,255,255,0.12)"} strokeWidth="0.8" style={{ transition: "fill .3s, stroke .3s" }} />
        <text x="19" y="8.5" fontSize="6.5" fontFamily="monospace" fill={hover ? "#FE5100" : "rgba(255,255,255,0.6)"} textAnchor="middle" style={{ transition: "fill .3s", letterSpacing: "0.08em" }}>
          LOCAL · GBP
        </text>
      </g>

      <g transform="translate(14, 50)">
        <rect width="80" height="96" rx="6" stroke={c} strokeWidth="1" fill="rgba(255,255,255,0.015)" style={{ transition: "stroke .3s" }} />
        <text x="8" y="14" fontSize="6.5" fontFamily="monospace" fill={c} opacity="0.6" style={{ transition: "fill .3s", letterSpacing: "0.06em" }}>
          MAP
        </text>
        {[
          { x: 22, y: 44 },
          { x: 56, y: 38 },
          { x: 62, y: 70 },
        ].map((p, i) => (
          <g key={i}>
            <path
              d={`M${p.x} ${p.y - 4}c-2.5 0-4.5 2-4.5 4.5 0 3 4.5 6.5 4.5 6.5s4.5-3.5 4.5-6.5c0-2.5-2-4.5-4.5-4.5z`}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.8"
              fill="rgba(255,255,255,0.04)"
            />
            <circle cx={p.x} cy={p.y - 0.5} r="1.3" fill="rgba(255,255,255,0.5)" />
          </g>
        ))}
        <g
          style={{
            transformOrigin: "40px 56px",
            transition: "transform .4s cubic-bezier(.22,1,.36,1)",
            transform: hover ? "scale(1.15)" : "scale(1)",
          }}
        >
          <path
            d="M40 48c-3.5 0-6.5 2.8-6.5 6.2 0 4 6.5 9 6.5 9s6.5-5 6.5-9c0-3.4-3-6.2-6.5-6.2z"
            stroke={hover ? "#FE5100" : "rgba(255,255,255,0.6)"}
            strokeWidth="1.2"
            fill={hover ? "rgba(254,81,0,0.25)" : "rgba(255,255,255,0.08)"}
            style={{ transition: "stroke .3s, fill .3s" }}
          />
          <circle cx="40" cy="54.5" r="2" fill={hover ? "#fff" : "rgba(255,255,255,0.7)"} style={{ transition: "fill .3s" }} />
        </g>
      </g>

      <g transform="translate(102, 50)">
        {rows.map((r, i) => {
          const pos = hover ? r.rank - 1 : r.restingPos;
          const isUrso = r.name.includes("Woof");
          const highlighted = hover && isUrso;
          return (
            <g
              key={i}
              style={{
                transition: "transform .6s cubic-bezier(.22,1,.36,1)",
                transform: `translateY(${pos * 32}px)`,
              }}
            >
              <rect
                x="0"
                y="0"
                width="204"
                height="26"
                rx="4"
                stroke={highlighted ? "#FE5100" : "rgba(255,255,255,0.1)"}
                strokeWidth="1"
                fill={highlighted ? "rgba(254,81,0,0.08)" : "rgba(255,255,255,0.015)"}
                opacity={isUrso || hover ? 1 : 0.6}
                style={{ transition: "stroke .3s, fill .3s, opacity .3s" }}
              />
              <text
                x="10"
                y="16"
                fontSize="8"
                fontFamily="monospace"
                fill={highlighted ? "#FE5100" : "rgba(255,255,255,0.5)"}
                style={{ transition: "fill .3s" }}
              >
                #{hover ? r.rank : r.restingPos + 1}
              </text>
              <circle
                cx="34"
                cy="13"
                r="2.5"
                fill={highlighted ? "#FE5100" : isUrso ? "#fff" : "rgba(255,255,255,0.45)"}
                style={{ transition: "fill .3s" }}
              />
              <text
                x="42"
                y="16"
                fontSize="8"
                fontFamily="monospace"
                fill={highlighted ? "#fff" : isUrso ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)"}
                style={{ transition: "fill .3s" }}
              >
                {r.name}
              </text>
              {hover && (
                <text
                  x="194"
                  y="16"
                  fontSize="7"
                  fontFamily="monospace"
                  fill={r.delta.startsWith("↑") ? "#FE5100" : "rgba(255,255,255,0.35)"}
                  textAnchor="end"
                >
                  {r.delta}
                </text>
              )}
            </g>
          );
        })}
      </g>

      <g transform="translate(14, 162)">
        <rect width="292" height="86" rx="6" stroke={c} strokeWidth="1" fill="rgba(255,255,255,0.015)" style={{ transition: "stroke .3s" }} />
        <text x="10" y="16" fontSize="6.5" fontFamily="monospace" fill={c} opacity="0.6" style={{ transition: "fill .3s", letterSpacing: "0.06em" }}>
          AI SEARCH · CITATIONS
        </text>
        {[
          { col: 0, row: 0, label: "ChatGPT", cited: true },
          { col: 1, row: 0, label: "Perplexity", cited: true },
          { col: 0, row: 1, label: "Gemini", cited: false },
          { col: 1, row: 1, label: "Copilot", cited: true },
        ].map((eng, i) => {
          const x = 12 + eng.col * 140;
          const y = 26 + eng.row * 24;
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <rect
                width="132"
                height="20"
                rx="3"
                stroke={hover && eng.cited ? "#FE5100" : "rgba(255,255,255,0.12)"}
                strokeWidth="0.8"
                fill={hover && eng.cited ? "rgba(254,81,0,0.1)" : "rgba(255,255,255,0.02)"}
                style={{ transition: `stroke .3s ${i * 0.05}s, fill .3s ${i * 0.05}s` }}
              />
              <circle
                cx="10"
                cy="10"
                r="2.5"
                fill={hover && eng.cited ? "#FE5100" : "rgba(255,255,255,0.35)"}
                style={{ transition: "fill .3s" }}
              />
              <text
                x="18"
                y="13"
                fontSize="7.5"
                fontFamily="monospace"
                fill={hover && eng.cited ? "#fff" : "rgba(255,255,255,0.65)"}
                style={{ transition: "fill .3s" }}
              >
                {eng.label}
              </text>
              {hover && eng.cited && (
                <text
                  x="124"
                  y="13"
                  fontSize="6.5"
                  fontFamily="monospace"
                  fill="#FE5100"
                  textAnchor="end"
                  style={{ letterSpacing: "0.08em" }}
                >
                  CITED
                </text>
              )}
            </g>
          );
        })}
        <text
          x="10"
          y="78"
          fontSize="6.5"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : c}
          opacity="0.75"
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          {hover ? "→ 3 / 4 ENGINES CITING YOUR BRAND" : "→ MONITORED WEEKLY"}
        </text>
      </g>
    </svg>
  );
}

export function RetentionIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const ringRadius = 64;
  const cx = 160;
  const cy = 100;
  const circumference = 2 * Math.PI * ringRadius;
  const progress = hover ? 0.61 : 0;
  return (
    <svg
      viewBox="0 0 320 240"
      className="w-full max-w-[320px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <defs>
        <radialGradient id="retention-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(254,81,0,0.18)" />
          <stop offset="100%" stopColor="rgba(254,81,0,0)" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r="92" fill="url(#retention-glow)" opacity={hover ? 1 : 0} style={{ transition: "opacity .5s" }} />

      <circle cx={cx} cy={cy} r={ringRadius} stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
      <circle
        cx={cx}
        cy={cy}
        r={ringRadius}
        stroke={hover ? "#FE5100" : "rgba(255,255,255,0.45)"}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{
          transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1), stroke .3s",
        }}
      />

      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
        const x = cx + (ringRadius + 18) * Math.cos(angle);
        const y = cy + (ringRadius + 18) * Math.sin(angle);
        const isRepeat = [0, 1, 2, 3, 4, 5, 6].includes(i);
        const activated = hover && isRepeat;
        return (
          <g key={i}>
            <line
              x1={cx + (ringRadius + 4) * Math.cos(angle)}
              y1={cy + (ringRadius + 4) * Math.sin(angle)}
              x2={cx + (ringRadius + 10) * Math.cos(angle)}
              y2={cy + (ringRadius + 10) * Math.sin(angle)}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
            <circle
              cx={x}
              cy={y}
              r="4"
              fill={activated ? "#FE5100" : isRepeat ? "rgba(255,255,255,0.55)" : "transparent"}
              stroke={activated ? "#FE5100" : "rgba(255,255,255,0.3)"}
              strokeWidth="1"
              style={{
                transition: `fill .4s ease ${i * 0.05}s, stroke .4s ease ${i * 0.05}s`,
              }}
            />
          </g>
        );
      })}

      <text
        x={cx}
        y={cy - 8}
        fontSize="8"
        fontFamily="monospace"
        fill={c}
        textAnchor="middle"
        opacity="0.6"
        style={{ transition: "fill .3s", letterSpacing: "0.14em" }}
      >
        60-DAY REPEAT
      </text>
      <text
        x={cx}
        y={cy + 18}
        fontSize="32"
        fontFamily="sans-serif"
        fontWeight="500"
        fill={hover ? "#FE5100" : "#fff"}
        textAnchor="middle"
        style={{ transition: "fill .4s", letterSpacing: "-0.04em" }}
      >
        {hover ? "61%" : ""}
      </text>
      <g
        style={{
          opacity: hover ? 1 : 0,
          transition: "opacity .4s ease .3s",
        }}
      >
        <text x={cx} y={cy + 34} fontSize="8" fontFamily="monospace" fill="#FE5100" textAnchor="middle" style={{ letterSpacing: "0.08em" }}>
          ↑ 4 PP VS Q1
        </text>
      </g>

      <g transform="translate(20, 222)">
        <circle r="3" fill="#FE5100" />
        <text x="8" y="3" fontSize="7" fontFamily="monospace" fill="rgba(255,255,255,0.55)" style={{ letterSpacing: "0.06em" }}>
          REPEAT
        </text>
        <circle cx="62" r="3" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        <text x="70" y="3" fontSize="7" fontFamily="monospace" fill="rgba(255,255,255,0.55)" style={{ letterSpacing: "0.06em" }}>
          LAPSED
        </text>
      </g>
      <g transform="translate(216, 215)">
        <rect width="84" height="14" rx="3" stroke={hover ? "#FE5100" : "rgba(255,255,255,0.18)"} strokeWidth="0.8" fill={hover ? "rgba(254,81,0,0.1)" : "rgba(255,255,255,0.02)"} style={{ transition: "stroke .3s, fill .3s" }} />
        <text x="42" y="10" fontSize="7" fontFamily="monospace" fill={hover ? "#FE5100" : "rgba(255,255,255,0.55)"} textAnchor="middle" style={{ transition: "fill .3s", letterSpacing: "0.06em" }}>
          1.4× LTV · TOP 25%
        </text>
      </g>
    </svg>
  );
}

export function GrowthEngineIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const series = [22, 28, 26, 34, 32, 40, 38, 46, 44, 52, 58, 64, 70, 78, 86];
  const max = 90;
  const w = 200;
  const h = 86;
  const step = w / (series.length - 1);
  const points = series
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(" ");
  const lastIdx = series.length - 1;
  const lastX = lastIdx * step;
  const lastY = h - (series[lastIdx] / max) * h;
  return (
    <svg
      viewBox="0 0 360 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <defs>
        <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(254,81,0,0.32)" />
          <stop offset="100%" stopColor="rgba(254,81,0,0)" />
        </linearGradient>
      </defs>

      <g transform="translate(14, 12)">
        {[
          { label: "META · ADS", live: true, x: 0 },
          { label: "GOOGLE · ADS", live: true, x: 96 },
          { label: "LANDING · TRK", live: false, x: 192 },
        ].map((p, i) => (
          <g key={p.label} transform={`translate(${p.x}, 0)`}>
            <rect
              width="88"
              height="22"
              rx="11"
              stroke={hover && p.live ? "#FE5100" : "rgba(255,255,255,0.14)"}
              strokeWidth="1"
              fill={hover && p.live ? "rgba(254,81,0,0.10)" : "rgba(255,255,255,0.02)"}
              style={{
                transition: `stroke .3s ${i * 0.06}s, fill .3s ${i * 0.06}s`,
              }}
            />
            <circle
              cx="10"
              cy="11"
              r="2.5"
              fill={hover && p.live ? "#FE5100" : "rgba(255,255,255,0.35)"}
              style={{ transition: `fill .3s ${i * 0.06}s` }}
            >
              {hover && p.live && (
                <animate
                  attributeName="opacity"
                  values="0.4;1;0.4"
                  dur="1.4s"
                  repeatCount="indefinite"
                  begin={`${i * 0.2}s`}
                />
              )}
            </circle>
            <text
              x="18"
              y="14"
              fontSize="7.5"
              fontFamily="monospace"
              fill={hover && p.live ? "#fff" : "rgba(255,255,255,0.65)"}
              style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
            >
              {p.label}
            </text>
          </g>
        ))}
      </g>

      <g transform="translate(14, 46)">
        <rect
          width="288"
          height={h + 22}
          rx="6"
          stroke={c}
          strokeWidth="1"
          fill="rgba(255,255,255,0.015)"
          style={{ transition: "stroke .3s" }}
        />
        <text
          x="10"
          y="14"
          fontSize="7"
          fontFamily="monospace"
          fill={c}
          opacity="0.65"
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          LEADS · 30D
        </text>
        <text
          x="278"
          y="14"
          fontSize="7"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.55)"}
          textAnchor="end"
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          {hover ? "↑ 3.9× ROAS" : "MONITORING"}
        </text>

        <g transform="translate(40, 18)">
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <line
              key={p}
              x1="0"
              y1={p * h}
              x2={w}
              y2={p * h}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
              strokeDasharray={p === 0 || p === 1 ? "" : "2 4"}
            />
          ))}

          <polyline
            points={`0,${h} ${points} ${w},${h}`}
            fill="url(#growth-fill)"
            opacity={hover ? 1 : 0}
            style={{ transition: "opacity .5s" }}
          />

          <polyline
            points={points}
            fill="none"
            stroke={hover ? "#FE5100" : "rgba(255,255,255,0.5)"}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: "stroke .3s",
              strokeDasharray: 600,
              strokeDashoffset: hover ? 0 : 0,
            }}
          />

          {hover && (
            <g>
              <circle cx={lastX} cy={lastY} r="8" fill="rgba(254,81,0,0.18)">
                <animate
                  attributeName="r"
                  values="4;12;4"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.6;0;0.6"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx={lastX} cy={lastY} r="3" fill="#FE5100" />
            </g>
          )}

          <text
            x="-6"
            y="4"
            fontSize="6.5"
            fontFamily="monospace"
            fill="rgba(255,255,255,0.35)"
            textAnchor="end"
          >
            86
          </text>
          <text
            x="-6"
            y={h}
            fontSize="6.5"
            fontFamily="monospace"
            fill="rgba(255,255,255,0.35)"
            textAnchor="end"
          >
            0
          </text>
        </g>

        <g transform={`translate(40, ${h + 24})`}>
          {["W1", "W2", "W3", "W4"].map((w, i) => (
            <text
              key={w}
              x={(i / 3) * 200}
              y="0"
              fontSize="6.5"
              fontFamily="monospace"
              fill="rgba(255,255,255,0.35)"
              textAnchor="middle"
            >
              {w}
            </text>
          ))}
        </g>
      </g>

      <g transform="translate(312, 46)">
        {[
          { label: "CTR", value: "3.2%", on: true },
          { label: "CPL", value: "$11", on: true },
          { label: "ROAS", value: "3.9×", on: true },
        ].map((m, i) => (
          <g
            key={m.label}
            transform={`translate(0, ${i * 34})`}
            style={{
              opacity: hover ? 1 : 0.45,
              transform: hover
                ? `translate(0, ${i * 34}px)`
                : `translate(8px, ${i * 34}px)`,
              transition: `opacity .4s ease ${i * 0.1}s, transform .4s ease ${
                i * 0.1
              }s`,
            }}
          >
            <rect
              width="36"
              height="28"
              rx="4"
              stroke={hover && m.on ? "#FE5100" : "rgba(255,255,255,0.12)"}
              strokeWidth="0.8"
              fill={hover && m.on ? "rgba(254,81,0,0.08)" : "rgba(255,255,255,0.02)"}
              style={{ transition: "stroke .3s, fill .3s" }}
            />
            <text
              x="18"
              y="11"
              fontSize="6"
              fontFamily="monospace"
              fill={hover && m.on ? "#FE5100" : "rgba(255,255,255,0.45)"}
              textAnchor="middle"
              style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
            >
              {m.label}
            </text>
            <text
              x="18"
              y="23"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="500"
              fill={hover && m.on ? "#fff" : "rgba(255,255,255,0.8)"}
              textAnchor="middle"
              style={{ transition: "fill .3s" }}
            >
              {m.value}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function ReviewsReputationIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  return (
    <svg
      viewBox="0 0 360 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <g
        style={{
          transformOrigin: "92px 110px",
          transition: "transform .5s cubic-bezier(.22,1,.36,1)",
          transform: hover ? "scale(1.04)" : "scale(1)",
        }}
      >
        <circle
          cx="92"
          cy="110"
          r="58"
          stroke={c}
          strokeWidth="1"
          fill="none"
          strokeDasharray="2 4"
          opacity="0.5"
        />
        <circle cx="92" cy="110" r="40" stroke={c} strokeWidth="1" fill="none" opacity="0.4" />
        <g style={{ transformOrigin: "92px 110px", transform: hover ? "rotate(8deg)" : "rotate(0deg)", transition: "transform .5s cubic-bezier(.22,1,.36,1)" }}>
          <path
            d="M92 78 l10 22 24 2 -19 17 6 24 -21 -13 -21 13 6 -24 -19 -17 24 -2z"
            stroke={hover ? "#FE5100" : "rgba(255,255,255,0.5)"}
            strokeWidth="1.5"
            fill={hover ? "rgba(254,81,0,0.12)" : "none"}
            strokeLinejoin="round"
            style={{ transition: "stroke .3s, fill .3s" }}
          />
        </g>
        {[
          { x: 40, y: 60, d: "0s" },
          { x: 150, y: 70, d: ".25s" },
          { x: 38, y: 158, d: ".5s" },
          { x: 150, y: 156, d: ".1s" },
          { x: 92, y: 38, d: ".4s" },
          { x: 92, y: 178, d: ".55s" },
        ].map((s, i) => (
          <g
            key={i}
            style={{
              transformOrigin: `${s.x}px ${s.y}px`,
              animation: hover ? `urso-twinkle 1.8s ease-in-out infinite ${s.d}` : "none",
            }}
          >
            <path
              d={`M${s.x} ${s.y - 5} l1.8 4 4.2 .4 -3.2 2.8 1 4.2 -3.8 -2.3 -3.8 2.3 1 -4.2 -3.2 -2.8 4.2 -.4z`}
              fill={hover ? "#FE5100" : "rgba(255,255,255,0.45)"}
              opacity={hover ? 0.85 : 0.4}
              style={{ transition: "fill .3s" }}
            />
          </g>
        ))}
      </g>

      <g transform="translate(192, 18)">
        <text
          x="0"
          y="8"
          fontSize="7"
          fontFamily="monospace"
          fill={c}
          opacity="0.7"
          style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
        >
          GOOGLE · RATING
        </text>
        <text
          x="0"
          y="36"
          fontSize="28"
          fontFamily="sans-serif"
          fontWeight="500"
          fill={hover ? "#FE5100" : "#fff"}
          style={{ transition: "fill .4s", letterSpacing: "-0.03em" }}
        >
          4.8
        </text>
        <g transform="translate(58, 18)">
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${i * 12} 0 l2 4.5 5 .4 -3.8 3.3 1.2 5 -4.4 -2.7 -4.4 2.7 1.2 -5 -3.8 -3.3 5 -.4z`}
              fill={hover ? "#FE5100" : "rgba(255,255,255,0.55)"}
              transform={`translate(0, -10)`}
              style={{
                transition: `fill .3s ${i * 0.05}s, transform .3s ${i * 0.05}s`,
              }}
            />
          ))}
        </g>

        {[
          { label: "Orlando", value: 4.9, pct: 0.98 },
          { label: "Winter Park", value: 4.8, pct: 0.96 },
          { label: "Maitland", value: 4.5, pct: 0.9 },
          { label: "Altamonte", value: 4.1, pct: 0.82, low: true },
        ].map((loc, i) => {
          const y = 56 + i * 24;
          return (
            <g key={loc.label} transform={`translate(0, ${y})`}>
              <text
                x="0"
                y="0"
                fontSize="7"
                fontFamily="monospace"
                fill={loc.low && hover ? "#FE5100" : "rgba(255,255,255,0.75)"}
                style={{ transition: "fill .3s" }}
              >
                {loc.label}
              </text>
              <rect
                x="0"
                y="6"
                width="100"
                height="3"
                rx="1.5"
                fill="rgba(255,255,255,0.05)"
              />
              <rect
                x="0"
                y="6"
                width={hover ? 100 * loc.pct : 100 * loc.pct * 0.4}
                height="3"
                rx="1.5"
                fill={loc.low ? (hover ? "#FE5100" : "rgba(255,255,255,0.4)") : (hover ? "rgba(254,81,0,0.6)" : "rgba(255,255,255,0.4)")}
                style={{
                  transition: `width .7s cubic-bezier(.22,1,.36,1) ${i * 0.08}s, fill .3s`,
                }}
              />
              <text
                x="148"
                y="3"
                fontSize="7"
                fontFamily="monospace"
                fill={loc.low && hover ? "#FE5100" : "rgba(255,255,255,0.55)"}
                textAnchor="end"
                style={{ transition: "fill .3s" }}
              >
                {loc.value.toFixed(1)}
              </text>
              {loc.low && hover && (
                <text
                  x="154"
                  y="3"
                  fontSize="6.5"
                  fontFamily="monospace"
                  fill="#FE5100"
                  style={{ letterSpacing: "0.08em" }}
                >
                  ALERT
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function FinancePulseIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  return (
    <svg
      viewBox="0 0 360 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <defs>
        <linearGradient id="finance-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(254,81,0,0.28)" />
          <stop offset="100%" stopColor="rgba(254,81,0,0)" />
        </linearGradient>
      </defs>

      <g transform="translate(14, 14)">
        <text
          x="0"
          y="10"
          fontSize="7"
          fontFamily="monospace"
          fill={c}
          opacity="0.7"
          style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
        >
          MRR · LIVE
        </text>
        <text
          x="0"
          y="42"
          fontSize="28"
          fontFamily="sans-serif"
          fontWeight="500"
          fill={hover ? "#fff" : "rgba(255,255,255,0.92)"}
          style={{ transition: "fill .3s", letterSpacing: "-0.03em" }}
        >
          $184<tspan fontSize="18" fill="rgba(255,255,255,0.5)">k</tspan>
        </text>
        <text
          x="0"
          y="58"
          fontSize="7.5"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.55)"}
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          ↑ 9% MoM
        </text>
      </g>

      <g transform="translate(120, 14)">
        <rect
          width="226"
          height="80"
          rx="6"
          stroke={c}
          strokeWidth="1"
          fill="rgba(255,255,255,0.015)"
          style={{ transition: "stroke .3s" }}
        />
        <text
          x="10"
          y="12"
          fontSize="6.5"
          fontFamily="monospace"
          fill={c}
          opacity="0.6"
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          CASH PULSE · 14D
        </text>
        {(() => {
          const pts: Array<[number, number]> = [];
          const w = 206;
          const cx = 10;
          const cy = 44;
          const amp = 16;
          const steps = 60;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = cx + t * w;
            let y = cy;
            if (t > 0.18 && t < 0.32) {
              const lt = (t - 0.18) / 0.14;
              const phase = lt * Math.PI * 2;
              y = cy - Math.sin(phase) * amp * (1 - Math.abs(lt - 0.5) * 1.2);
              if (lt > 0.55) y = cy + Math.sin((lt - 0.55) * Math.PI * 2) * amp * 0.6;
            }
            if (t > 0.55 && t < 0.72) {
              const lt = (t - 0.55) / 0.17;
              y = cy - Math.sin(lt * Math.PI * 2) * amp * 1.1 * (1 - Math.abs(lt - 0.5) * 0.8);
              if (lt > 0.5) y = cy + Math.sin((lt - 0.5) * Math.PI * 2) * amp * 0.7;
            }
            pts.push([x, y]);
          }
          const d = pts
            .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`)
            .join(" ");
          const fillD = `${d} L${pts[pts.length - 1][0]},78 L10,78 Z`;
          return (
            <>
              <line
                x1="10"
                y1="44"
                x2="216"
                y2="44"
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="2 3"
              />
              <path d={fillD} fill="url(#finance-fill)" opacity={hover ? 1 : 0} style={{ transition: "opacity .4s" }} />
              <path
                d={d}
                fill="none"
                stroke={hover ? "#FE5100" : "rgba(255,255,255,0.55)"}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke .3s" }}
              />
              {hover && (
                <circle r="2.2" fill="#FE5100">
                  <animate
                    attributeName="cx"
                    values="10;216;10"
                    dur="3.6s"
                    repeatCount="indefinite"
                  />
                  <animateMotion dur="3.6s" repeatCount="indefinite" path={d} />
                </circle>
              )}
            </>
          );
        })()}
      </g>

      <g transform="translate(14, 110)">
        <text
          x="0"
          y="8"
          fontSize="6.5"
          fontFamily="monospace"
          fill={c}
          opacity="0.6"
          style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
        >
          REVENUE · PER LOCATION
        </text>
        {[
          { label: "Orlando", v: 0.92 },
          { label: "Winter Park", v: 0.74 },
          { label: "Maitland", v: 0.58 },
          { label: "Altamonte", v: 0.41 },
        ].map((loc, i) => {
          const barW = 332;
          return (
            <g key={loc.label} transform={`translate(0, ${18 + i * 22})`}>
              <text
                x="0"
                y="8"
                fontSize="7"
                fontFamily="monospace"
                fill="rgba(255,255,255,0.7)"
              >
                {loc.label}
              </text>
              <rect x="76" y="2" width={barW - 86} height="10" rx="2" fill="rgba(255,255,255,0.04)" />
              <rect
                x="76"
                y="2"
                width={hover ? (barW - 86) * loc.v : (barW - 86) * loc.v * 0.4}
                height="10"
                rx="2"
                fill={hover ? "url(#finance-fill)" : "rgba(255,255,255,0.18)"}
                style={{
                  transition: `width .8s cubic-bezier(.22,1,.36,1) ${i * 0.08}s, fill .3s`,
                }}
              />
              <rect
                x="76"
                y="2"
                width={hover ? (barW - 86) * loc.v : (barW - 86) * loc.v * 0.4}
                height="10"
                rx="2"
                fill="none"
                stroke={hover ? "#FE5100" : "rgba(255,255,255,0.25)"}
                strokeWidth="0.8"
                style={{
                  transition: `width .8s cubic-bezier(.22,1,.36,1) ${i * 0.08}s, stroke .3s`,
                }}
              />
              <text
                x={barW}
                y="10"
                fontSize="6.5"
                fontFamily="monospace"
                fill={hover ? "#fff" : "rgba(255,255,255,0.55)"}
                textAnchor="end"
                style={{ transition: "fill .3s" }}
              >
                ${Math.round(loc.v * 92)}k
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function OperationsIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const tasks = [
    { label: "Open + prep stations", done: true, delay: 0 },
    { label: "Stock count + reorder", done: true, delay: 0.1 },
    { label: "Cash drop + safe log", done: true, delay: 0.2 },
    { label: "End-of-day reconciliation", done: false, delay: 0.3 },
    { label: "Manager sign-off", done: false, delay: 0.4 },
  ];
  return (
    <svg
      viewBox="0 0 360 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <g transform="translate(14, 12)">
        <rect
          width="218"
          height="196"
          rx="8"
          stroke={c}
          strokeWidth="1"
          fill="rgba(255,255,255,0.015)"
          style={{ transition: "stroke .3s" }}
        />
        <text
          x="12"
          y="18"
          fontSize="7"
          fontFamily="monospace"
          fill={c}
          opacity="0.7"
          style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
        >
          DAILY · WINTER PARK
        </text>
        <text
          x="206"
          y="18"
          fontSize="6.5"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.45)"}
          textAnchor="end"
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          {hover ? "3 / 5" : ""}
        </text>
        <line x1="12" y1="26" x2="206" y2="26" stroke="rgba(255,255,255,0.06)" />

        {tasks.map((t, i) => {
          const y = 38 + i * 30;
          const checked = hover && t.done;
          return (
            <g
              key={t.label}
              transform={`translate(12, ${y})`}
              style={{
                opacity: hover ? 1 : 0.5,
                transform: hover ? `translate(12px, ${y}px)` : `translate(4px, ${y}px)`,
                transition: `opacity .4s ease ${t.delay}s, transform .4s ease ${t.delay}s`,
              }}
            >
              <rect
                width="14"
                height="14"
                rx="3"
                stroke={checked ? "#FE5100" : "rgba(255,255,255,0.25)"}
                strokeWidth="1"
                fill={checked ? "#FE5100" : "transparent"}
                style={{ transition: `stroke .3s ${t.delay}s, fill .3s ${t.delay}s` }}
              />
              {checked && (
                <path
                  d="M3.5 7 l2.5 2.5 5-5"
                  stroke="#fff"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 12,
                    strokeDashoffset: 0,
                    animation: `panel-fade-in .35s ease ${t.delay + 0.15}s backwards`,
                  }}
                />
              )}
              <text
                x="24"
                y="11"
                fontSize="8.5"
                fontFamily="monospace"
                fill={checked ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.85)"}
                style={{
                  transition: "fill .3s",
                  textDecoration: checked ? "line-through" : "none",
                }}
              >
                {t.label}
              </text>
            </g>
          );
        })}
      </g>

      <g transform="translate(248, 12)">
        <rect
          width="98"
          height="196"
          rx="8"
          stroke={c}
          strokeWidth="1"
          fill="rgba(255,255,255,0.015)"
          style={{ transition: "stroke .3s" }}
        />
        <text
          x="10"
          y="18"
          fontSize="7"
          fontFamily="monospace"
          fill={c}
          opacity="0.7"
          style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
        >
          LOCATIONS
        </text>
        <line x1="10" y1="26" x2="88" y2="26" stroke="rgba(255,255,255,0.06)" />
        {[
          { name: "Orlando", state: "ok" },
          { name: "Winter Park", state: "ok" },
          { name: "Maitland", state: "warn" },
          { name: "Altamonte", state: "ok" },
          { name: "Doctor Phillips", state: "warn" },
        ].map((loc, i) => {
          const y = 36 + i * 28;
          const warn = loc.state === "warn";
          return (
            <g
              key={loc.name}
              transform={`translate(10, ${y})`}
              style={{
                opacity: hover ? 1 : 0.5,
                transition: `opacity .35s ease ${i * 0.08}s`,
              }}
            >
              <circle
                cx="4"
                cy="6"
                r="3"
                fill={
                  warn && hover
                    ? "#FE5100"
                    : !warn
                    ? "rgba(255,255,255,0.55)"
                    : "rgba(255,255,255,0.25)"
                }
                style={{ transition: `fill .3s ${i * 0.08}s` }}
              >
                {warn && hover && (
                  <animate
                    attributeName="opacity"
                    values="0.4;1;0.4"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              <text
                x="12"
                y="9"
                fontSize="7.5"
                fontFamily="monospace"
                fill={warn && hover ? "#FE5100" : "rgba(255,255,255,0.7)"}
                style={{ transition: `fill .3s ${i * 0.08}s` }}
              >
                {loc.name}
              </text>
              {warn && hover && (
                <text
                  x="86"
                  y="9"
                  fontSize="6.5"
                  fontFamily="monospace"
                  fill="#FE5100"
                  textAnchor="end"
                  style={{ letterSpacing: "0.08em" }}
                >
                  !
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function AgentsIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const lines = [
    { prefix: "$", text: " urso build winter-park-callback", accent: true },
    { prefix: "→", text: " parsing ops manual (47 pages)" },
    { prefix: "→", text: " wiring missed-call → sms → booking" },
    { prefix: "✓", text: " deployed across 4 stores", accent: true },
  ];
  const stores = ["Winter Park", "Orlando", "Maitland", "Altamonte"];
  return (
    <div
      className="w-full max-w-[480px] rounded-lg border bg-black/95 font-mono text-[11.5px]"
      style={{
        borderColor: hover ? "#FE5100" : c,
        transition: "border-color .3s, box-shadow .3s",
        boxShadow: hover ? "0 0 32px rgba(254,81,0,0.18)" : "none",
      }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-white/20" />
          <span className="size-1.5 rounded-full bg-white/20" />
          <span
            className="size-1.5 rounded-full"
            style={{
              background: hover ? "#FE5100" : "rgba(255,255,255,0.2)",
              transition: "background .3s",
            }}
          />
        </div>
        <span className="text-[9px] tracking-[0.14em] text-white/35">
          URSO · AGENT BUILD
        </span>
        <span
          className="rounded-sm border px-1.5 py-[1px] text-[8px] tracking-[0.1em]"
          style={{
            borderColor: hover ? "#FE5100" : "rgba(255,255,255,0.15)",
            color: hover ? "#FE5100" : "rgba(255,255,255,0.5)",
            transition: "border-color .3s, color .3s",
          }}
        >
          {hover ? "LIVE" : "READY"}
        </span>
      </div>

      <div className="space-y-1 px-3 py-3">
        {lines.map((ln, i) => (
          <div
            key={i}
            className="flex items-center"
            style={{
              opacity: hover ? 1 : i === 0 ? 0.85 : 0.45,
              transform: hover ? "translateX(0)" : "translateX(-4px)",
              transition: `opacity .4s ease ${i * 0.12}s, transform .4s ease ${i * 0.12}s`,
              color: ln.accent
                ? hover
                  ? "#FE5100"
                  : "rgba(255,255,255,0.55)"
                : "rgba(255,255,255,0.6)",
            }}
          >
            <span className="w-3">{ln.prefix}</span>
            <span>{ln.text}</span>
            {i === lines.length - 1 && hover && (
              <span
                className="ml-1 inline-block"
                style={{ animation: "urso-blink 1s steps(2) infinite" }}
              >
                _
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[8.5px] tracking-[0.1em] text-white/40">
          <span>DEPLOY · 4 / 4</span>
          <span style={{ color: hover ? "#FE5100" : "rgba(255,255,255,0.4)", transition: "color .3s" }}>
            {hover ? "100%" : ""}
          </span>
        </div>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.05]">
          <div
            style={{
              width: hover ? "100%" : "0%",
              height: "100%",
              background:
                "linear-gradient(90deg, rgba(254,81,0,0.4), #FE5100)",
              transition: "width 1.2s cubic-bezier(.22,1,.36,1)",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 border-t border-white/[0.06] px-3 py-2.5">
        {stores.map((store, i) => (
          <div
            key={store}
            className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[8.5px]"
            style={{
              borderColor: hover ? "rgba(254,81,0,0.4)" : "rgba(255,255,255,0.08)",
              background: hover ? "rgba(254,81,0,0.06)" : "rgba(255,255,255,0.015)",
              color: hover ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)",
              transition: `border-color .3s ${i * 0.08}s, background .3s ${
                i * 0.08
              }s, color .3s ${i * 0.08}s`,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{
                background: hover ? "#FE5100" : "rgba(255,255,255,0.3)",
                transition: `background .3s ${i * 0.08}s`,
              }}
            />
            <span className="truncate">{store}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
