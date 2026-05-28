"use client";

import { useState, type ReactNode } from "react";
import { Pill } from "./ui/pill";

type IlloProps = { hover: boolean };

const lineColor = (hover: boolean) =>
  hover ? "#FE5100" : "rgba(255,255,255,0.22)";
const lineGlow = (hover: boolean) =>
  hover ? "drop-shadow(0 0 12px rgba(254,81,0,0.35))" : "none";

function SeeIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const sources = [
    { label: "POS", cx: 40 },
    { label: "CALLS", cx: 124 },
    { label: "ADS", cx: 208 },
    { label: "FINANCE", cx: 292 },
  ];
  const ingestX = 170;
  const ingestY = 110;
  const stores = Array.from({ length: 6 }, (_, i) => ({
    x: 26 + i * 48,
    y: 158,
  }));

  return (
    <svg
      viewBox="0 0 340 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      {sources.map((s, i) => (
        <g key={s.label}>
          <rect
            x={s.cx - 22}
            y={14}
            width="44"
            height="22"
            rx="4"
            stroke={c}
            strokeWidth="1"
            fill="rgba(255,255,255,0.015)"
            style={{ transition: "stroke .3s" }}
          />
          <text
            x={s.cx}
            y={28}
            fontSize="7.5"
            fontFamily="monospace"
            fill={c}
            textAnchor="middle"
            style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
          >
            {s.label}
          </text>
          <line
            x1={s.cx}
            y1={36}
            x2={ingestX}
            y2={ingestY}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          {hover && (
            <circle r="2.2" fill="#FE5100">
              <animate
                attributeName="cx"
                from={s.cx}
                to={ingestX}
                dur="1.6s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                from="36"
                to={ingestY}
                dur="1.6s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.1;0.85;1"
                dur="1.6s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      ))}

      <circle
        cx={ingestX}
        cy={ingestY}
        r={hover ? 4 : 2.5}
        fill={hover ? "#FE5100" : "rgba(255,255,255,0.45)"}
        style={{ transition: "fill .3s, r .3s" }}
      />
      {hover && (
        <circle cx={ingestX} cy={ingestY} r="3" fill="rgba(254,81,0,0.4)">
          <animate
            attributeName="r"
            values="3;12;3"
            dur="1.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.55;0;0.55"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      <rect
        x={14}
        y={124}
        width={312}
        height={78}
        rx={8}
        stroke={c}
        strokeWidth="1.2"
        fill="rgba(255,255,255,0.02)"
        style={{ transition: "stroke .3s" }}
      />
      <text
        x={24}
        y={142}
        fontSize="7"
        fontFamily="monospace"
        fill={c}
        opacity="0.7"
        style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
      >
        ONE DASHBOARD · EVERY STORE
      </text>

      {stores.map((s, i) => (
        <g key={i}>
          <rect
            x={s.x}
            y={s.y - 12}
            width={40}
            height={28}
            rx={3}
            fill={hover ? "rgba(254,81,0,0.14)" : "rgba(255,255,255,0.025)"}
            stroke={hover ? "#FE5100" : "rgba(255,255,255,0.14)"}
            strokeWidth="0.8"
            style={{
              transition: `fill .4s ease ${i * 0.07}s, stroke .4s ease ${i * 0.07}s`,
            }}
          />
          <text
            x={s.x + 20}
            y={s.y - 1}
            fontSize="6"
            fontFamily="monospace"
            fill={hover ? "#FE5100" : "rgba(255,255,255,0.5)"}
            textAnchor="middle"
            style={{ transition: "fill .3s", letterSpacing: "0.05em" }}
          >
            STORE {String(i + 1).padStart(2, "0")}
          </text>
          {[0, 1, 2].map((b) => (
            <rect
              key={b}
              x={s.x + 6 + b * 10}
              y={s.y + 4}
              width="6"
              height={4 + b * 2}
              rx="1"
              fill={hover ? "rgba(254,81,0,0.55)" : "rgba(255,255,255,0.25)"}
              style={{
                transition: `fill .3s ${i * 0.06 + b * 0.04}s`,
              }}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function FindIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const rows: Array<{
    name: string;
    metric: string;
    leak: boolean;
    dollars?: string;
  }> = [
    { name: "WINTER PARK", metric: "calls/day 142", leak: false },
    {
      name: "MAITLAND",
      metric: "missed 38",
      leak: true,
      dollars: "$4,180 / mo",
    },
    { name: "ORLANDO", metric: "repeat 31%", leak: false },
    {
      name: "ALTAMONTE",
      metric: "rating 4.1★",
      leak: true,
      dollars: "$3,740 / mo",
    },
  ];

  return (
    <svg
      viewBox="0 0 340 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <text
        x={20}
        y={20}
        fontSize="7"
        fontFamily="monospace"
        fill={c}
        opacity="0.7"
        style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
      >
        AI · SCANNING
      </text>
      <g transform="translate(278, 10)">
        <rect
          width="48"
          height="14"
          rx="3"
          fill={hover ? "rgba(254,81,0,0.15)" : "rgba(255,255,255,0.04)"}
          stroke={hover ? "#FE5100" : "rgba(255,255,255,0.14)"}
          strokeWidth="0.8"
          style={{ transition: "fill .3s, stroke .3s" }}
        />
        <circle
          cx={8}
          cy={7}
          r="2"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.4)"}
          style={{ transition: "fill .3s" }}
        >
          {hover && (
            <animate
              attributeName="opacity"
              values="0.4;1;0.4"
              dur="1.2s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <text
          x={16}
          y={10}
          fontSize="6.5"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.55)"}
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          {hover ? "LIVE" : "IDLE"}
        </text>
      </g>

      {hover && (
        <line
          x1={14}
          x2={326}
          y1={34}
          y2={34}
          stroke="#FE5100"
          strokeWidth="1"
          opacity="0.55"
          style={{ filter: "drop-shadow(0 0 4px #FE5100)" }}
        >
          <animate
            attributeName="y1"
            values="34;200;34"
            dur="2.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y2"
            values="34;200;34"
            dur="2.6s"
            repeatCount="indefinite"
          />
        </line>
      )}

      {rows.map((r, i) => {
        const y = 38 + i * 36;
        const revealDelay = i * 0.18;
        return (
          <g key={r.name} transform={`translate(14, ${y})`}>
            <rect
              width="312"
              height="28"
              rx="4"
              stroke={hover && r.leak ? "#FE5100" : "rgba(255,255,255,0.1)"}
              strokeWidth="1"
              fill={
                hover && r.leak
                  ? "rgba(254,81,0,0.10)"
                  : "rgba(255,255,255,0.015)"
              }
              style={{
                transition: `stroke .4s ease ${revealDelay}s, fill .4s ease ${revealDelay}s`,
              }}
            />
            <circle
              cx={14}
              cy={14}
              r="3"
              fill={
                hover
                  ? r.leak
                    ? "#FE5100"
                    : "rgba(255,255,255,0.5)"
                  : "rgba(255,255,255,0.2)"
              }
              style={{ transition: `fill .4s ease ${revealDelay}s` }}
            />
            <text
              x={28}
              y={18}
              fontSize="8.5"
              fontFamily="monospace"
              fill={
                hover
                  ? r.leak
                    ? "#fff"
                    : "rgba(255,255,255,0.85)"
                  : "rgba(255,255,255,0.55)"
              }
              style={{
                transition: `fill .4s ease ${revealDelay}s`,
                letterSpacing: "0.05em",
              }}
            >
              {r.name}
            </text>
            <text
              x={140}
              y={18}
              fontSize="7.5"
              fontFamily="monospace"
              fill={
                hover
                  ? "rgba(255,255,255,0.65)"
                  : "rgba(255,255,255,0.4)"
              }
              style={{ transition: `fill .4s ease ${revealDelay}s` }}
            >
              {r.metric}
            </text>
            {r.leak ? (
              <g
                style={{
                  opacity: hover ? 1 : 0,
                  transition: `opacity .4s ease ${revealDelay + 0.1}s`,
                }}
              >
                <text
                  x={236}
                  y={18}
                  fontSize="6.5"
                  fontFamily="monospace"
                  fill="#FE5100"
                  textAnchor="end"
                  style={{ letterSpacing: "0.08em" }}
                >
                  LEAK
                </text>
                <text
                  x={300}
                  y={18}
                  fontSize="8"
                  fontFamily="monospace"
                  fill="#FE5100"
                  textAnchor="end"
                  style={{ letterSpacing: "0.05em" }}
                >
                  {r.dollars}
                </text>
              </g>
            ) : (
              <g
                style={{
                  opacity: hover ? 0.6 : 0,
                  transition: `opacity .4s ease ${revealDelay + 0.1}s`,
                }}
              >
                <path
                  d="M291 14 l3 3 6 -7"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </g>
        );
      })}

      <text
        x={14}
        y={206}
        fontSize="7"
        fontFamily="monospace"
        fill={hover ? "#FE5100" : c}
        opacity="0.9"
        style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
      >
        {hover ? "→ 2 LEAKS · $7,920 / MO" : "→ READY TO SCAN"}
      </text>
    </svg>
  );
}

function FixIllo({ hover }: IlloProps) {
  const c = lineColor(hover);
  const stores = Array.from({ length: 5 }, (_, i) => ({
    cx: 50 + i * 60,
  }));

  return (
    <svg
      viewBox="0 0 340 220"
      className="w-full max-w-[360px] transition-[filter] duration-300"
      style={{ filter: lineGlow(hover) }}
    >
      <g transform="translate(80, 14)">
        <rect
          width="180"
          height="38"
          rx="6"
          stroke={hover ? "#FE5100" : c}
          strokeWidth="1.2"
          fill={hover ? "rgba(254,81,0,0.10)" : "rgba(255,255,255,0.02)"}
          style={{ transition: "stroke .3s, fill .3s" }}
        />
        <g
          transform="translate(18, 19)"
          stroke={hover ? "#FE5100" : "rgba(255,255,255,0.6)"}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          style={{ transition: "stroke .3s" }}
        >
          <circle r="4.5" />
          <circle r="1.2" fill={hover ? "#FE5100" : "rgba(255,255,255,0.6)"} stroke="none" />
          <line x1="0" y1="-7" x2="0" y2="-9" />
          <line x1="0" y1="7" x2="0" y2="9" />
          <line x1="-7" y1="0" x2="-9" y2="0" />
          <line x1="7" y1="0" x2="9" y2="0" />
          <line x1="-5" y1="-5" x2="-6.5" y2="-6.5" />
          <line x1="5" y1="5" x2="6.5" y2="6.5" />
          <line x1="-5" y1="5" x2="-6.5" y2="6.5" />
          <line x1="5" y1="-5" x2="6.5" y2="-6.5" />
        </g>
        <text
          x={34}
          y={17}
          fontSize="8"
          fontFamily="monospace"
          fill={hover ? "#fff" : "rgba(255,255,255,0.78)"}
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          MISSED-CALL · AUTO-SMS
        </text>
        <text
          x={34}
          y={30}
          fontSize="6.5"
          fontFamily="monospace"
          fill={hover ? "#FE5100" : "rgba(255,255,255,0.42)"}
          style={{ transition: "fill .3s", letterSpacing: "0.08em" }}
        >
          DEPLOY · ALL STORES
        </text>
      </g>

      {stores.map((s, i) => (
        <g key={`line-${i}`}>
          <line
            x1={170}
            y1={52}
            x2={s.cx}
            y2={152}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          {hover && (
            <circle r="2.2" fill="#FE5100">
              <animate
                attributeName="cx"
                from={170}
                to={s.cx}
                dur="1.4s"
                begin={`${i * 0.15}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                from={52}
                to={152}
                dur="1.4s"
                begin={`${i * 0.15}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.1;0.85;1"
                dur="1.4s"
                begin={`${i * 0.15}s`}
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      ))}

      {stores.map((s, i) => {
        const revealDelay = 0.35 + i * 0.12;
        return (
          <g key={`store-${i}`} transform={`translate(${s.cx}, 168)`}>
            <rect
              x={-18}
              y={-6}
              width={36}
              height={34}
              rx={3}
              fill={
                hover ? "rgba(254,81,0,0.10)" : "rgba(255,255,255,0.025)"
              }
              stroke={hover ? "#FE5100" : "rgba(255,255,255,0.18)"}
              strokeWidth="1"
              style={{
                transition: `fill .4s ease ${revealDelay}s, stroke .4s ease ${revealDelay}s`,
              }}
            />
            <path
              d="M-20 -6 l20 -10 l20 10"
              stroke={hover ? "#FE5100" : "rgba(255,255,255,0.35)"}
              strokeWidth="1"
              fill="none"
              strokeLinejoin="round"
              style={{ transition: `stroke .4s ease ${revealDelay}s` }}
            />
            <g
              style={{
                opacity: hover ? 0 : 0.75,
                transition: `opacity .4s ease ${revealDelay}s`,
              }}
            >
              <circle
                cx={0}
                cy={10}
                r="5"
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1"
              />
              <path
                d="M-2.5 7.5 l5 5 M2.5 7.5 l-5 5"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </g>
            <g
              style={{
                opacity: hover ? 1 : 0,
                transition: `opacity .4s ease ${revealDelay}s`,
              }}
            >
              <circle cx={0} cy={10} r="5.5" fill="#FE5100" />
              <path
                d="M-2.5 10 l1.8 1.8 4.2 -3.8"
                stroke="#fff"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        );
      })}

      <text
        x={14}
        y={212}
        fontSize="7"
        fontFamily="monospace"
        fill={hover ? "#FE5100" : c}
        opacity="0.9"
        style={{ transition: "fill .3s", letterSpacing: "0.1em" }}
      >
        {hover
          ? "→ 5 / 5 STORES · DEPLOYED & MEASURED"
          : "→ READY TO DEPLOY"}
      </text>
    </svg>
  );
}

type Step = {
  num: string;
  verb: string;
  headline: string;
  body: string;
  illustration: (props: IlloProps) => ReactNode;
};

const steps: Step[] = [
  {
    num: "01",
    verb: "SEE",
    headline: "We unify your data into one dashboard",
    body: "POS, calls, ads, finance — every system in one view. Because real decisions need real data, not gut feel.",
    illustration: SeeIllo,
  },
  {
    num: "02",
    verb: "FIND",
    headline: "Our AI scans it. Surfaces what to fix",
    body: "Trained on your business, it watches every store, finds the leaks, and suggests where the biggest dollar wins are.",
    illustration: FindIllo,
  },
  {
    num: "03",
    verb: "FIX",
    headline: "You sit down with us. We build the plan",
    body: "Custom technical plans — software, automations, advisory — built with you to fix the leaks your data exposed.",
    illustration: FixIllo,
  },
];

function StepCard({ step, hasBorder }: { step: Step; hasBorder: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      className={`group relative flex h-full flex-col px-6 py-8 md:px-8 md:py-10 ${
        hasBorder
          ? "border-t border-edge md:border-l md:border-t-0"
          : ""
      }`}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.18em]">
        <span className="text-orange">{step.num}</span>
        <span className="ml-2 text-ink">— {step.verb}</span>
      </div>
      <h3 className="mt-4 text-[clamp(24px,3.4vw,28px)] font-medium leading-[1.08] tracking-[-0.02em]">
        {step.headline}
        <span className="text-orange">.</span>
      </h3>
      <p className="mt-3 max-w-[360px] text-[14px] leading-[1.55] text-ink-dim">
        {step.body}
      </p>
      <div className="mt-6 flex flex-1 items-end justify-center pt-2">
        {step.illustration({ hover })}
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="border-t border-edge bg-bg px-5 py-16 text-ink sm:px-8 sm:py-20 md:px-14 md:py-24">
      <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:mb-14 sm:gap-8 md:flex-row md:items-end">
        <div>
          <Pill>How Urso works</Pill>
          <h2 className="mt-4 text-[clamp(34px,7.5vw,64px)] font-medium leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:leading-none">
            Three steps<span className="text-orange">.</span>
            <br />
            <span className="text-ink-dim">Built with you.</span>
          </h2>
        </div>
        <p className="max-w-[360px] text-[14px] leading-[1.5] text-ink-dim sm:text-[15px]">
          More agency than software. We unify your data, AI surfaces the
          leaks, then our team builds the fixes — with you.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-edge bg-[#0b0b0b]">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {steps.map((s, i) => (
            <StepCard key={s.num} step={s} hasBorder={i > 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
