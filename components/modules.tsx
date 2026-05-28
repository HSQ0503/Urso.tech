"use client";

import { Pill } from "./ui/pill";
import { ModuleCard } from "./modules/module-card";
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

export function Modules() {
  return (
    <section className="border-t border-edge bg-bg px-5 py-16 text-ink sm:px-8 sm:py-20 md:px-14 md:py-24">
      <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:mb-14 sm:gap-8 md:flex-row md:items-end">
        <div>
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em]">
            <span className="text-orange">Step 03</span>
            <span className="ml-2 text-ink-dimmer">— Fix</span>
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
          what our system can do — not a fixed menu. We build the pieces your
          business actually needs, all on one data layer, with custom AI models
          trained on your business that turn the numbers into decisions.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-edge bg-[#0b0b0b]">
        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-[420px_400px_400px]">
          <ModuleCard
            tag="layers"
            title="The Data Layer"
            span={2}
            large
            body="Every system, one schema — the diagnostic behind every fix."
            bullets={[
              "POS, finance, Google, and call data unified",
              "Per-store views with cross-store comparison",
              "The source of truth for every module",
            ]}
            illustration={DataLayerIllo}
            className="border-b border-edge md:border-r"
          />
          <ModuleCard
            tag="calendar"
            title="Bookings"
            body="Three-tap booking. Writes back to your POS."
            illustration={BookingsIllo}
            className="border-b border-edge md:border-r"
          />
          <ModuleCard
            tag="phone"
            title="Missed Communications"
            body="Every missed call answered by SMS — instantly."
            illustration={MissedCallIllo}
            className="border-b border-edge"
          />

          <ModuleCard
            tag="pin"
            title="SEO / GEO"
            body="Rank in Maps, directions, and LLMs."
            illustration={SEOIllo}
            className="border-b border-edge md:border-r"
          />
          <ModuleCard
            tag="repeat"
            title="Retention"
            body="Win-backs that fire on real data."
            illustration={RetentionIllo}
            className="border-b border-edge md:border-r"
          />
          <ModuleCard
            tag="chart"
            title="Growth Engine"
            body="Launch, track, and improve campaigns from one place."
            bullets={[
              "Meta + Google Ads in one view",
              "Landing page + lead source tracking",
              "Creative tests & weekly reports",
            ]}
            illustration={GrowthEngineIllo}
            className="border-b border-edge md:border-r"
          />
          <ModuleCard
            tag="star"
            title="Reviews & Reputation"
            body="Get more reviews without chasing customers."
            bullets={[
              "Automated review requests",
              "Bad-review alerts + AI replies",
              "Per-location reputation dashboard",
            ]}
            illustration={ReviewsReputationIllo}
            className="border-b border-edge"
          />

          <ModuleCard
            tag="dollar"
            title="Finance Pulse"
            body="Know what is making money — and what is not."
            bullets={[
              "QuickBooks integration, by location",
              "Margin & cash-flow visibility",
              "Monthly owner reports",
            ]}
            illustration={FinancePulseIllo}
            className="border-b border-edge md:border-b-0 md:border-r"
          />
          <ModuleCard
            tag="check"
            title="Operations"
            body="Make the business easier to run every day."
            bullets={[
              "Staff tasks, SOP library, checklists",
              "Inventory alerts + request forms",
              "Daily per-location reports",
            ]}
            illustration={OperationsIllo}
            className="border-b border-edge md:border-b-0 md:border-r"
          />
          <ModuleCard
            tag="bot"
            title="Custom Software"
            span={2}
            body="When the leak is unique, we build the software that fixes it."
            bullets={[
              "Custom workflows on your stack",
              "Trained on your SOPs",
              "Deployed across every store",
            ]}
            illustration={AgentsIllo}
          />
        </div>
      </div>
    </section>
  );
}
