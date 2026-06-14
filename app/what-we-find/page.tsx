import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Section,
  Eyebrow,
  Headline,
  Body,
  PageHero,
  CtaBlock,
  MonoNote,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { WipeLink } from "@/components/site/wipe-link";
import { FindingsLedger } from "@/components/site/ledger";
import { FINDING_GROUPS } from "@/components/site/findings-data";
import { reports } from "@/components/research/data";

export const metadata: Metadata = {
  title: "What we find",
  description:
    "We won't fake a wall of case studies. Here's something better: the actual operational leaks we hunt, where they hide, and the move each one unlocks.",
};

const FIELD_NOTES = reports.slice(0, 3);

export default function WhatWeFindPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        <PageHero
          eyebrow="What we find"
          title="The money is already in the building"
          sub="We're a young firm, and we won't fake a wall of case studies. Here's something better: the actual patterns we hunt, where they hide, and the move each one unlocks."
          primary={{ label: "Find yours", href: "/contact" }}
          proof="Current engagement · 4-location franchise operator · 29 months of POS history · $6.8M validated to the penny"
        />

        {FINDING_GROUPS.map((group, i) => (
          <Section key={group.label} divide={i !== 0}>
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-12">
              <Reveal className="lg:col-span-4">
                <Eyebrow index={`0${i + 1}`}>{group.label}</Eyebrow>
              </Reveal>
              <Reveal delay={60} className="lg:col-span-8">
                <FindingsLedger findings={group.findings} />
              </Reveal>
            </div>
          </Section>
        ))}

        {/* Closing — the real before/after isn't done yet */}
        <Section>
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
            <Reveal className="lg:col-span-5">
              <Eyebrow>The first result</Eyebrow>
              <Headline className="mt-4">
                When the first before/after is done, it goes here
              </Headline>
            </Reveal>
            <Reveal delay={80} className="lg:col-span-6 lg:col-start-7">
              <Body>
                Our current engagement is mid-flight: baseline captured cleanly,
                first fix in implementation, result to be measured against 29
                months of validated history. It will be published the way we run
                it — baseline first, methodology shown. Until then, we&rsquo;d
                rather show you what we&rsquo;d find in your operation than dress
                ours up.
              </Body>
            </Reveal>
          </div>

          {/* Field notes → reports */}
          <div className="mt-14">
            <MonoNote className="text-ink-dim">Field notes</MonoNote>
            <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-edge md:grid-cols-3">
              {FIELD_NOTES.map((r) => (
                <WipeLink
                  key={r.slug}
                  href={`/reports/${r.slug}`}
                  className="group flex h-full flex-col bg-panel p-6 transition-colors duration-200 hover:bg-panel-strong"
                >
                  <h3 className="text-[16px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                    {r.title}
                  </h3>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[13px] text-ink-dim transition-colors group-hover:text-ink">
                    Read
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform group-hover:translate-x-0.5">
                      <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </WipeLink>
              ))}
            </div>
          </div>
        </Section>

        <CtaBlock
          title="Find yours"
          sub="Every operation leaks somewhere. Thirty minutes on how yours runs, and we'll tell you where we'd look first."
          secondary={{ label: "How we work", href: "/how-it-works" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
