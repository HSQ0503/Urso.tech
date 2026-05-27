"use client";

import { useState } from "react";
import Image from "next/image";

type Tool = { name: string; logo: string };

const tools: Tool[] = [
  { name: "Shopify", logo: "/assets/shopify.png" },
  { name: "Stripe", logo: "/assets/stripe.png" },
  { name: "Square", logo: "/assets/square.png" },
  { name: "QuickBooks", logo: "/assets/quickboojs.png" },
  { name: "HubSpot", logo: "/assets/hubspot.png" },
  { name: "Mailchimp", logo: "/assets/mailchimp.png" },
  { name: "Google Analytics", logo: "/assets/googleanalytics.png" },
  { name: "Meta Ads", logo: "/assets/metaads.png" },
  { name: "Calendly", logo: "/assets/calendy.png" },
  { name: "Google Calendar", logo: "/assets/googlecalender.png" },
  { name: "Slack", logo: "/assets/slack.png" },
];

const DEFAULT_LABEL = "your stack";
const wheel = [DEFAULT_LABEL, ...tools.map((t) => t.name)];
const ROW_H = 56;

export function IntegrationStrip() {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wheelIdx = hoverIdx === null ? 0 : hoverIdx + 1;
  const anyActive = hoverIdx !== null;

  return (
    <div className="flex items-center justify-center gap-10">
      <div className="flex flex-col">
        <span className="text-[26px] leading-tight tracking-[-0.015em] text-ink-dim">
          Use Urso Systems with
        </span>
        <div className="overflow-hidden" style={{ height: ROW_H }}>
          <div
            className="transition-transform duration-[500ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `translateY(-${wheelIdx * ROW_H}px)` }}
            aria-live="polite"
          >
            {wheel.map((label) => (
              <div
                key={label}
                className="flex items-center text-[44px] font-medium leading-none tracking-[-0.035em] text-ink"
                style={{ height: ROW_H }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-2"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {tools.map((t, i) => {
          const active = i === hoverIdx;
          return (
            <button
              key={t.name}
              type="button"
              onMouseEnter={() => setHoverIdx(i)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              aria-label={t.name}
              aria-pressed={active}
              className={`relative flex size-[68px] items-center justify-center rounded-[12px] border transition-[border-color] duration-200 ${
                active ? "border-edge-strong" : "border-transparent"
              }`}
            >
              <Image
                src={t.logo}
                alt={t.name}
                width={40}
                height={40}
                className="size-9 object-contain transition-opacity duration-200"
                style={{
                  opacity: active ? 1 : anyActive ? 0.28 : 0.62,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
