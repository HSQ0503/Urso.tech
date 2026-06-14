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

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Every Urso engagement runs the same arc — Review, Build, Activate, Improve. Understand the business, build its operating layer, put it to work, keep improving it.",
};

const PHASES = [
  {
    n: "01",
    name: "Review",
    title: "We study the business as it actually runs",
    body: "Not a questionnaire — recon. We look at your operation the way an operator would: the systems you run, the history they hold, what's observable from the outside in. Then we pull the data together and reconcile it until the numbers agree with reality.",
    get: "A unified baseline of your business, and a leak report: where money is getting lost, sized in dollars, ranked by how certain we are.",
    when: "You see the whole business in one place for the first time.",
  },
  {
    n: "02",
    name: "Build",
    title: "We build your operating layer on your real numbers",
    body: "Data connections, dashboards, AI analysis, automations, custom tools where the off-the-shelf option doesn't fit. Built around your workflows and your definitions — defined once, true everywhere. No seats to license, no template to live inside.",
    get: "A private operating system pre-loaded with your own validated data — not an empty tool you have to feed.",
    when: "The Monday numbers arrive without anyone compiling them.",
  },
  {
    n: "03",
    name: "Activate",
    title: "We put it to work with your team",
    body: "Software nobody uses changes nothing. We implement alongside your managers: the process changes, the training, the new rhythms — and AI agents on the busywork, so the system runs without adding headcount to run it. Your people stay on customers; the layer handles the watching.",
    get: "A team actually operating from the system — same playbook, every location.",
    when: "Your managers reach for it without being asked.",
  },
  {
    n: "04",
    name: "Improve",
    title: "We stay on it",
    body: "This is the part that makes the rest worth doing. We keep tracking performance against baseline, keep hunting the next opportunity, and keep advising on the move — a steady cadence of finding, fixing, and measuring. The system gets sharper the longer it runs.",
    get: "An ongoing operating partner: monitoring, analysis, advisory, and execution on a monthly rhythm.",
    when: "The same leak doesn't come back twice.",
  },
];

const FIRST_WEEKS = ["Access & recon", "Baseline captured", "Leak report", "First fix measured"];

export default function HowItWorksPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        <PageHero
          eyebrow="How it works"
          title="Four phases. One direction"
          sub="Every engagement runs the same arc: understand the business, build its operating layer, put it to work, keep improving it. Here's what each phase actually involves."
          primary={{ label: "Start the conversation", href: "/contact" }}
        />

        {PHASES.map((p, i) => (
          <Section key={p.n} divide={i !== 0}>
            <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
              <Reveal className="lg:col-span-5">
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-orange">
                    Phase {p.n}
                  </span>
                </div>
                <div className="mt-3 flex items-start gap-5">
                  <span
                    aria-hidden
                    className="select-none text-[clamp(3rem,6vw,4.5rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-raise-strong"
                  >
                    {p.n}
                  </span>
                  <Headline className="mt-1">{p.title}</Headline>
                </div>
              </Reveal>

              <Reveal delay={80} className="lg:col-span-6 lg:col-start-7">
                <Body className="text-[16px] sm:text-[17px]">{p.body}</Body>
                <div className="mt-7 rounded-xl border border-edge bg-panel p-5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                    What you get
                  </div>
                  <p className="mt-2 text-[15px] leading-[1.5] text-ink">{p.get}</p>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                  <MonoNote className="text-ink-dim">
                    Working when — {p.when}
                  </MonoNote>
                </div>
              </Reveal>
            </div>
          </Section>
        ))}

        {/* The first weeks */}
        <Section>
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
            <Reveal className="lg:col-span-5">
              <Eyebrow>The first weeks</Eyebrow>
              <Headline className="mt-4">We move deliberately at the start</Headline>
            </Reveal>
            <Reveal delay={80} className="lg:col-span-6 lg:col-start-7">
              <Body>
                A clean baseline is what makes every later claim provable.
                You&rsquo;ll know what we found, what we&rsquo;re fixing first,
                and how the result will be measured — before we touch anything.
              </Body>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                {FIRST_WEEKS.map((step, i) => (
                  <div key={step} className="flex items-center gap-2 sm:flex-1">
                    <div
                      className="flex-1 rounded-md border border-edge bg-surface px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim"
                    >
                      {step}
                    </div>
                    {i < FIRST_WEEKS.length - 1 && (
                      <span className="hidden text-ink-dimmer sm:inline">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                          <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </Section>

        <CtaBlock
          title="See what a review would surface"
          sub="The first conversation is a walk through your operation: what you run, where it strains, and what we'd examine first."
          secondary={{ label: "What we find", href: "/what-we-find" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
