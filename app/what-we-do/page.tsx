import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Section,
  Eyebrow,
  Headline,
  Body,
  PageHero,
  CtaBlock,
  cx,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { FlowLine } from "@/components/site/motifs";

export const metadata: Metadata = {
  title: "What we do",
  description:
    "Urso is the intelligence layer behind your business — plus the team that acts on it. We unify your data, build the systems that make it usable, and stay to execute alongside your team.",
};

const IS = [
  "A long-term operating partner that holds your data layer and fixes what it finds",
  "Strategy grounded in your real numbers, implemented hands-on",
  "Built for businesses that run on people, service, and execution",
];
const IS_NOT = [
  "A software vendor selling dashboard seats",
  "A consultancy that leaves a deck and walks away",
  "An AI agency selling automations for their own sake",
];

const EXPECT = [
  ["Revenue", "Recovered leaks, fuller schedules, customers brought back."],
  ["Margin", "Labor, inventory, and spend matched to what the numbers support."],
  ["Decisions", "Weeks of debate become a number and a move."],
  ["Control", "The same playbook at every location — visible without standing in the room."],
  ["Visibility", "One screen that tells you what's actually happening, every morning."],
  ["Direction", "Growth that follows a plan instead of momentum."],
];

function Prose({
  index,
  eyebrow,
  title,
  children,
  period = true,
}: {
  index: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  period?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-12">
      <Reveal className="lg:col-span-5">
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <Headline period={period} className="mt-4">
          {title}
        </Headline>
      </Reveal>
      <Reveal delay={80} className="space-y-4 lg:col-span-6 lg:col-start-7">
        {children}
      </Reveal>
    </div>
  );
}

export default function WhatWeDoPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        <PageHero
          eyebrow="What we do"
          title="An operating partner, not another tool"
          sub={
            <>
              Urso exists for the gap between &ldquo;we have the data
              somewhere&rdquo; and &ldquo;we know what to do — and it&rsquo;s
              getting done.&rdquo;
            </>
          }
          primary={{ label: "Start the conversation", href: "/contact" }}
          secondary={{ label: "See how we work", href: "/how-it-works" }}
        />

        {/* 01 What Urso is + is/is-not */}
        <Section>
          <Prose
            index="01"
            eyebrow="What Urso is"
            title="The intelligence layer behind your business — plus the team that acts on it"
          >
            <Body>
              Urso is a data and AI partner for people-based businesses:
              companies where revenue depends on customers, teams, appointments,
              and repeat visits. We unify the data your business already
              produces, build the systems that make it usable, and then stay —
              implementing, advising, and executing alongside your team.
            </Body>
            <Body>
              That last part is the difference. Plenty of firms will sell you
              software or a strategy deck. We hold the data layer, find
              what&rsquo;s leaking, and stay until the fixes hold.
            </Body>
          </Prose>

          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-edge md:grid-cols-2">
            <Reveal className="bg-panel p-6 sm:p-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
                Urso is
              </div>
              <ul className="mt-5 space-y-4">
                {IS.map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                    <span className="text-[15px] leading-[1.5] text-ink">{t}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={80} className="bg-panel p-6 sm:p-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                Urso is not
              </div>
              <ul className="mt-5 space-y-4">
                {IS_NOT.map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 text-ink-dimmer">
                      <svg viewBox="0 0 8 8" fill="none" aria-hidden>
                        <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="text-[15px] leading-[1.5] text-ink-dim">{t}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Section>

        {/* 02 Why it exists */}
        <Section>
          <Prose
            index="02"
            eyebrow="Why it exists"
            title="Scattered data is expensive. You're already paying for it"
          >
            <Body>
              Every system in your business keeps its own version of the truth.
              The POS knows sales. The books know costs. The booking system knows
              gaps. The phones know who never got through. Nobody sees all of it
              at once — so the owner becomes the integration layer, and decisions
              wait until someone has a free weekend.
            </Body>
            <Body>
              That delay has a price: leaks that run for months, strong locations
              subsidizing weak ones unnoticed, marketing spend disconnected from
              what actually books. The data to stop it already exists. It&rsquo;s
              just not assembled.
            </Body>
          </Prose>
        </Section>

        {/* 03 Where data and AI fit */}
        <Section>
          <Prose
            index="03"
            eyebrow="Where data and AI fit"
            title="Data is the raw material. AI is leverage. Neither is the point"
          >
            <Body>
              We start by making your numbers trustworthy — unified, reconciled,
              validated against the systems you already run. Then AI earns its
              place: reading the whole operation continuously, flagging what
              changed, drafting the weekly brief, handling follow-up busywork a
              manager shouldn&rsquo;t burn hours on.
            </Body>
            <Body>
              What we don&rsquo;t do is bolt automations onto a chaotic operation
              and call it transformation. If a piece of AI doesn&rsquo;t move
              revenue, margin, or control, it doesn&rsquo;t ship.
            </Body>
          </Prose>
        </Section>

        {/* 04 Why dashboards aren't enough */}
        <Section>
          <Prose
            index="04"
            eyebrow="Why dashboards aren't enough"
            title="A dashboard is a mirror. It doesn't change anything"
          >
            <Body>
              Dashboards show the business; they don&rsquo;t run it. A chart of
              missed calls doesn&rsquo;t call anyone back. A retention report
              doesn&rsquo;t rebook a customer. Most businesses don&rsquo;t suffer
              from missing information — they suffer from information that never
              becomes action.
            </Body>
            <Body>
              So we wire every number to a move: an action, an owner, and a date.
              The dashboard is where the work is visible — not where it stops.
            </Body>
          </Prose>
          <div className="mt-12">
            <FlowLine
              steps={["Signal", "Sized in $", "The move", "An owner", "Result"]}
              accentIndex={2}
            />
          </div>
        </Section>

        {/* 05 What to expect */}
        <Section>
          <Reveal>
            <Eyebrow index="05">What to expect</Eyebrow>
            <Headline className="mt-4 max-w-[20ch]">
              The outcomes we&rsquo;re hired for
            </Headline>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-edge sm:grid-cols-2 lg:grid-cols-3">
            {EXPECT.map(([label, body], i) => (
              <Reveal key={label} delay={(i % 3) * 70}>
                <div
                  className={cx(
                    "h-full bg-panel p-6 transition-colors duration-200 hover:bg-panel-strong sm:p-7",
                  )}
                >
                  <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">
                    {label}
                  </h3>
                  <Body className="mt-2.5 text-[15px]">{body}</Body>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        <CtaBlock
          title="Start with the decisions you're already trying to make"
          sub="Bring the question you keep circling — staffing, a second location, why Tuesdays die. That's exactly where an engagement starts."
          secondary={{ label: "See what we find", href: "/what-we-find" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
