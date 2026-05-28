"use client";

import { useState } from "react";
import { Pill } from "./ui/pill";
import { ModuleCard } from "./modules/module-card";
import { ModuleModal, type ModuleDetail } from "./modules/module-modal";
import {
  DataLayerIllo,
  BookingsIllo,
  MissedCallIllo,
  SEOIllo,
  RetentionIllo,
  AgentsIllo,
  GrowthEngineIllo,
  ReviewsReputationIllo,
  FinancePulseIllo,
  OperationsIllo,
} from "./modules/illustrations";

type ModuleEntry = {
  tag: ModuleDetail["tag"];
  title: string;
  body: string;
  bullets?: string[];
  illustration: (props: { hover: boolean }) => React.ReactNode;
  span?: 1 | 2;
  large?: boolean;
  className?: string;
  detail: Omit<ModuleDetail, "tag" | "title" | "tagline">;
};

const modules: ModuleEntry[] = [
  {
    tag: "layers",
    title: "The Data Layer",
    span: 2,
    large: true,
    body: "Every system, one schema the diagnostic behind every fix.",
    bullets: [
      "POS, finance, Google, and call data unified",
      "Per-store views with cross-store comparison",
      "The source of truth for every module",
    ],
    illustration: DataLayerIllo,
    className: "border-b border-edge md:border-r",
    detail: {
      overview:
        "Most operators run on a stack of dashboards that don't talk to each other. The Data Layer pulls every signal POS sales, calendar bookings, Google profile activity, finance into one unified schema, normalized per location. Every module reads from it, so the numbers always match and you stop arguing about whose dashboard is right.",
      included: [
        "Daily ingest from POS, QuickBooks, Google Business, and call logs",
        "Per-store and cross-store schemas with historical backfill",
        "Anomaly detection on revenue, traffic, and bookings",
        "Source of truth for every downstream module",
        "Custom connectors when the off-the-shelf one doesn't exist",
      ],
      worksWith: ["Toast", "Square", "QuickBooks", "Google", "Stripe", "Twilio"],
    },
  },
  {
    tag: "calendar",
    title: "Bookings",
    body: "Three-tap booking. Writes back to your POS.",
    illustration: BookingsIllo,
    className: "border-b border-edge md:border-r",
    detail: {
      overview:
        "A booking flow that feels native to your site, with the friction stripped out. Customers pick a time in three taps; the appointment lands in your POS with the right service, staff member, and notes already filled in.",
      included: [
        "Embedded widget styled to match your brand",
        "Real-time availability synced from your POS",
        "SMS confirmations and reminders",
        "Per-location staff routing rules",
        "No-show flagging with auto-rebook prompts",
      ],
      worksWith: ["Toast", "Square", "Mindbody", "Calendly", "Twilio"],
    },
  },
  {
    tag: "phone",
    title: "Missed Communications",
    body: "Every missed call answered by SMS instantly.",
    illustration: MissedCallIllo,
    className: "border-b border-edge",
    detail: {
      overview:
        "When your line rings out, the lead doesn't have to. Every missed call triggers an instant text that re-opens the conversation, captures intent, and routes high-value leads to the right person on your team.",
      included: [
        "Auto-SMS within seconds of a missed call",
        "AI handles common questions (hours, pricing, directions)",
        "Escalation to a human for complex requests",
        "Voicemail transcription + one-line summary",
        "Per-location call analytics and recovery rate",
      ],
      worksWith: ["Twilio", "RingCentral", "OpenPhone"],
    },
  },
  {
    tag: "pin",
    title: "SEO / GEO",
    body: "Rank in Maps, directions, and LLMs.",
    illustration: SEOIllo,
    className: "border-b border-edge md:border-r",
    detail: {
      overview:
        "Local search is fragmented across Google Maps, Apple Maps, and now LLM answer engines. We optimize every surface Google Business Profiles, citations, schema markup, and the structured data that LLMs cite when customers ask where to go.",
      included: [
        "Google Business Profile diagnostic + optimization per location",
        "Citation cleanup across 50+ directories",
        "Schema.org markup for menu, services, and hours",
        "LLM answer-engine monitoring (ChatGPT, Perplexity, Gemini)",
        "Monthly rank tracking by keyword and location",
      ],
      worksWith: ["Google Business", "Apple Maps", "Bing Places", "Yelp"],
    },
  },
  {
    tag: "repeat",
    title: "Retention",
    body: "Win-backs that fire on real data.",
    illustration: RetentionIllo,
    className: "border-b border-edge md:border-r",
    detail: {
      overview:
        "Most loyalty programs spray discounts at customers who'd come back anyway. We use your transaction data to find the customers who won't return without a nudge, and trigger personalized win-backs at the moment they're most likely to convert.",
      included: [
        "Per-customer return probability scoring",
        "Lapsed-customer win-back campaigns",
        "Birthday, anniversary, and milestone triggers",
        "SMS, email, and push channel routing",
        "Revenue attribution per campaign",
      ],
      worksWith: ["Klaviyo", "Twilio", "Mailchimp"],
    },
  },
  {
    tag: "chart",
    title: "Growth Engine",
    body: "Launch, track, and improve campaigns from one place.",
    bullets: [
      "Meta + Google Ads in one view",
      "Landing page + lead source tracking",
      "Creative tests & weekly reports",
    ],
    illustration: GrowthEngineIllo,
    className: "border-b border-edge md:border-r",
    detail: {
      overview:
        "A single command center for paid acquisition. Meta and Google Ads sit next to landing page performance and lead source tracking, so you can see which dollar produced which booking not just which click.",
      included: [
        "Meta Ads + Google Ads unified dashboard",
        "Landing pages built per campaign",
        "Lead source tracked through to revenue",
        "Weekly creative tests with iteration",
        "Owner-readable reports in your inbox",
      ],
      worksWith: ["Meta Ads", "Google Ads", "GA4", "Stripe"],
    },
  },
  {
    tag: "star",
    title: "Reviews & Reputation",
    body: "Get more reviews without chasing customers.",
    bullets: [
      "Automated review requests",
      "Bad-review alerts + AI replies",
      "Per-location reputation dashboard",
    ],
    illustration: ReviewsReputationIllo,
    className: "border-b border-edge",
    detail: {
      overview:
        "Review volume is the single biggest local-SEO lever, but asking is awkward. We trigger requests at the moment of peak satisfaction, watch for negative reviews across every platform, and draft AI replies your team approves with one tap.",
      included: [
        "Automated review requests after visit (SMS + email)",
        "Instant alerts on 1–3 star reviews",
        "AI-drafted replies, approved by you",
        "Per-location reputation dashboard",
        "Competitor review tracking",
      ],
      worksWith: ["Google", "Yelp", "Facebook", "TripAdvisor"],
    },
  },
  {
    tag: "dollar",
    title: "Finance Pulse",
    body: "Know what is making money and what is not.",
    bullets: [
      "QuickBooks integration, by location",
      "Margin & cash-flow visibility",
      "Monthly owner reports",
    ],
    illustration: FinancePulseIllo,
    className: "border-b border-edge md:border-b-0 md:border-r",
    detail: {
      overview:
        "QuickBooks tells you whether the business made money. Finance Pulse tells you which location, which day, and which service line with cash-flow forecasts your accountant won't give you for free.",
      included: [
        "Live QuickBooks sync, broken out by location",
        "Margin breakdown by service and product",
        "13-week rolling cash flow forecast",
        "Per-location P&L drill-down",
        "One-page owner report monthly",
      ],
      worksWith: ["QuickBooks", "Stripe", "Toast", "Square"],
    },
  },
  {
    tag: "check",
    title: "Operations",
    body: "Make the business easier to run every day.",
    bullets: [
      "Staff tasks, SOP library, checklists",
      "Inventory alerts + request forms",
      "Daily per-location reports",
    ],
    illustration: OperationsIllo,
    className: "border-b border-edge md:border-b-0 md:border-r",
    detail: {
      overview:
        "The boring stuff that eats a GM's day: checklists, inventory orders, staff tasks, SOP lookups. We give every location the same operating cadence and you the visibility to know it's actually happening.",
      included: [
        "Daily and weekly checklists per location",
        "Searchable SOP library",
        "Inventory thresholds with automated reorder requests",
        "Staff task assignments with completion tracking",
        "Daily operations report per location",
      ],
    },
  },
  {
    tag: "bot",
    title: "Custom Software",
    span: 2,
    body: "When the leak is unique, we build the software that fixes it.",
    bullets: [
      "Custom workflows on your stack",
      "Trained on your SOPs",
      "Deployed across every store",
    ],
    illustration: AgentsIllo,
    detail: {
      overview:
        "Sometimes the missing piece doesn't exist as a SaaS product. When that's the case, we build it a custom dashboard, an automation, an internal tool on the same data layer, deployed across every location.",
      included: [
        "Custom workflows scoped in week one",
        "Built on your existing stack (no rip-and-replace)",
        "Trained on your SOPs and historical data",
        "Deployed across every location, monitored centrally",
        "Maintained on retainer, not shipped and forgotten",
      ],
    },
  },
];

export function Modules() {
  const [selected, setSelected] = useState<number | null>(null);

  const activeDetail: ModuleDetail | null =
    selected === null
      ? null
      : {
          tag: modules[selected].tag,
          title: modules[selected].title,
          tagline: modules[selected].body,
          ...modules[selected].detail,
        };

  return (
    <section className="border-t border-edge bg-bg px-5 py-16 text-ink sm:px-8 sm:py-20 md:px-14 md:py-24">
      <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:mb-14 sm:gap-8 md:flex-row md:items-end">
        <div>
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em]">
            <span className="text-orange">Step 03</span>
            <span className="ml-2 text-ink-dimmer">Fix</span>
          </div>
          <Pill>Capability modules</Pill>
          <h2 className="mt-4 text-[clamp(34px,7.5vw,64px)] font-medium leading-[1.02] tracking-[-0.03em] sm:mt-5 sm:leading-none">
            Custom Built for your Business.
            <br />
            <span className="text-ink-dim">No two systems are the same.</span>
          </h2>
        </div>
        <p className="max-w-[360px] text-[14px] leading-[1.5] text-ink-dim sm:text-[15px]">
          The modules below are <span className="text-ink">examples</span> of
          what our system can do not a fixed menu. We build the pieces your
          business actually needs, all on one data layer, with custom AI models
          trained on your business that turn the numbers into decisions.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-edge bg-[#0b0b0b]">
        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-[420px_400px_400px]">
          {modules.map((m, i) => (
            <ModuleCard
              key={m.title}
              tag={m.tag}
              title={m.title}
              body={m.body}
              bullets={m.bullets}
              illustration={m.illustration}
              span={m.span}
              large={m.large}
              className={m.className}
              onClick={() => setSelected(i)}
            />
          ))}
        </div>
      </div>

      <ModuleModal
        key={selected ?? "closed"}
        detail={activeDetail}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
