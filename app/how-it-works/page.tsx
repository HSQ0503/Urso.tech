import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Section,
  Eyebrow,
  Headline,
  Body,
  Cta,
  CtaBlock,
  MonoNote,
  BackdropGrid,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { FORECAST_GRAIN } from "@/components/site/forecast";
import { ProcessCards } from "@/components/site/process-cards";
import { WhoWeServe } from "@/components/site/who-we-serve";

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

/* Real proof in place of Origin's award laurels — Urso shows validated numbers,
   not borrowed badges. */
const PROOF = [
  { value: "29 months", label: "of validated POS history" },
  { value: "4 locations", label: "reconciled to one truth" },
  { value: "$6.8M", label: "tracked to the penny" },
];

export default function HowItWorksPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        {/* ===== Hero ===== */}
        <section className="relative overflow-hidden border-b border-edge px-[clamp(20px,4vw,56px)] pb-[clamp(64px,9vw,112px)] pt-[clamp(120px,18vw,208px)]">
          {/* Same layered backdrop as the homepage hero — OS grid, multi-bloom
              orange glow, and fine grain. */}
          <BackdropGrid />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(62% 44% at 50% -2%, rgba(254,81,0,0.17) 0%, rgba(254,81,0,0.045) 40%, transparent 68%)," +
                "radial-gradient(38% 30% at 82% 5%, rgba(255,120,42,0.08) 0%, transparent 55%)," +
                "radial-gradient(50% 28% at 50% 78%, rgba(254,81,0,0.05) 0%, transparent 72%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: FORECAST_GRAIN,
              backgroundSize: "150px 150px",
              opacity: 0.05,
              mixBlendMode: "soft-light",
            }}
          />

          <div className="relative mx-auto flex max-w-[940px] flex-col items-center text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-edge bg-white/[0.04] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                How it works
              </span>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-8 max-w-[18ch] text-balance font-serif text-[clamp(2.75rem,6.6vw,5.5rem)] font-normal leading-[1.0] tracking-[-0.025em] text-ink">
                We build the system, then{" "}
                <em className="italic">stay to run it</em>
                <span className="text-orange">.</span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-8 max-w-[54ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[19px]">
                Every engagement runs the same arc: review, build, activate,
                improve. We connect your data, find the money, fix it with your
                team, and keep it fixed.
              </p>
            </Reveal>

            <Reveal delay={180} className="mt-10">
              <Cta href="/contact" size="lg">
                Start the conversation
              </Cta>
            </Reveal>

            {/* Real proof — validated numbers, not borrowed award badges. */}
            <Reveal delay={240} className="mt-14 w-full">
              <div className="mx-auto flex max-w-[620px] flex-col items-center justify-center divide-y divide-edge sm:flex-row sm:divide-x sm:divide-y-0">
                {PROOF.map((s) => (
                  <div key={s.label} className="px-7 py-3 text-center sm:py-1">
                    <div className="font-serif text-[clamp(1.4rem,2.1vw,1.8rem)] leading-none tracking-[-0.02em] text-ink">
                      {s.value}
                    </div>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== How it works — the engagement in three moves ===== */}
        <section className="px-[clamp(20px,4vw,56px)] py-[clamp(64px,10vw,128px)]">
          <Reveal className="mx-auto mb-[clamp(44px,6vw,80px)] max-w-[760px] text-center">
            <h2 className="text-balance font-serif text-[clamp(2.5rem,5vw,4.25rem)] font-normal leading-[1.05] tracking-[-0.025em] text-ink">
              <em className="italic">How</em> it works<span className="text-orange">.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              What working with us actually looks like, from the first baseline to
              the weekly fix.
            </p>
          </Reveal>
          <ProcessCards />
        </section>

        {/* ===== Who we serve — the verticals, on the amber field ===== */}
        <WhoWeServe />

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
