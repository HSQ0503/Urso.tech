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
} from "./modules/illustrations";

export function Modules() {
  return (
    <section className="border-t border-edge bg-bg px-14 py-24 text-ink">
      <div className="mb-14 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div>
          <Pill>Capability modules</Pill>
          <h2 className="mt-5 text-[64px] font-medium leading-none tracking-[-0.03em]">
            Built for your business.
            <br />
            <span className="text-ink-dim">Modules that ship the fix.</span>
          </h2>
        </div>
        <p className="max-w-[340px] text-[15px] leading-[1.5] text-ink-dim">
          Productized fixes. One data layer. Every store, in your voice.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-edge bg-[#0b0b0b]">
        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-[420px_400px]">
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
            className="border-b border-edge md:border-b"
          />

          <ModuleCard
            tag="pin"
            title="SEO / GEO"
            body="Rank in Maps, directions, and LLMs."
            illustration={SEOIllo}
            className="border-b border-edge md:border-b-0 md:border-r"
          />
          <ModuleCard
            tag="repeat"
            title="Retention"
            body="Win-backs that fire on real data."
            illustration={RetentionIllo}
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
