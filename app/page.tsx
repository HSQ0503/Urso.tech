import Image from "next/image";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Section,
  Eyebrow,
  Headline,
  Lede,
  Body,
  SectionHead,
  Cta,
  MonoNote,
  CtaBlock,
  Card,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { HeroAsk } from "@/components/site/hero-ask";
import { Offerings } from "@/components/site/offerings";
import { AskDemo, Sparkle } from "@/components/site/ask-demo";
import { FeatureCards } from "@/components/site/feature-cards";
import { MeasureCards } from "@/components/site/measure-cards";
import { WipeLink } from "@/components/site/wipe-link";
import { ConnectDiagram, PhasePath } from "@/components/site/motifs";
import { DashboardScene } from "@/components/site/product-frame";
import { FindingsLedger } from "@/components/site/ledger";
import { HOME_FINDINGS } from "@/components/site/findings-data";

const OUTCOMES = [
  {
    n: "01",
    title: "Find missed revenue",
    body: "Unanswered calls, empty appointment slots, customers who quietly stopped coming back. The money is already in your operation — it's leaking, not gone. We find it, size it in dollars, and go get it.",
  },
  {
    n: "02",
    title: "Make sharper decisions",
    body: "You shouldn't have to guess which location, service, or schedule is underperforming. One set of numbers everyone trusts, so the next move is obvious instead of debated.",
  },
  {
    n: "03",
    title: "Operate with control",
    body: "Fewer surprises, fewer fires. Your team runs the same playbook at every location, and you can see it working without standing in the room.",
  },
];

const PAINS = [
  "Your reports show what happened. They don't tell your team what to do next.",
  "Data lives everywhere, so decisions still run on instinct.",
  "Revenue leaks hide in scheduling, follow-up, inventory, and inconsistency between locations.",
  "Growth adds locations, people, and noise. Without a stronger operating layer, it adds chaos too.",
];

const PILLARS = [
  {
    n: "01",
    title: "Connect the data",
    body: "POS, books, payroll, phones, booking, reviews — unified into one source of truth and validated against the systems you already run.",
  },
  {
    n: "02",
    title: "Find the opportunities",
    body: "We read your numbers the way an operator would: where revenue leaks, which decisions are overdue, what to fix first — sized in dollars.",
  },
  {
    n: "03",
    title: "Build the system",
    body: "Dashboards, AI analysis, custom tools, automations — built around how your business actually runs, not around a template.",
  },
  {
    n: "04",
    title: "Activate the team",
    body: "Software nobody uses changes nothing. We implement with your managers: process changes, training, and AI handling the busywork.",
  },
  {
    n: "05",
    title: "Improve continuously",
    body: "We keep watching the numbers, keep finding the next opportunity, and keep advising on the move — month after month.",
  },
];

const PHASE_NOTES = [
  ["Review", "We study how the business actually runs: systems, data, workflows, where money leaks and decisions stall."],
  ["Build", "We stand up the intelligence layer — data connections, dashboards, automations, custom tools — on your real numbers."],
  ["Activate", "We put it to work with your team: implementation, training, process changes, AI on the busywork."],
  ["Improve", "We stay on it: tracking performance, surfacing opportunities, advising the next move."],
];

const AUDIENCE = [
  ["Multi-location operators", "You can't be in every store. The numbers can."],
  ["Franchise owners", "Corporate gives you a brand. We build the operating layer around how your locations actually run."],
  ["Appointment-based businesses", "Your calendar is your inventory. Empty slots are spoilage."],
  ["Repeat-customer businesses", "The second visit is where the margin lives. We make sure it happens."],
  ["Scattered-systems businesses", "Five tools, five logins, no single truth. We end that."],
  ["Scaling past founder instinct", "What got you to three locations won't run ten. Instinct doesn't scale. Systems do."],
];

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        {/* ===== Hero ===== */}
        <section className="relative overflow-hidden px-[clamp(20px,4vw,56px)] pb-[clamp(64px,10vw,120px)] pt-[clamp(132px,20vw,224px)]">
          {/* A soft orange glow stands in for the reference photo — keeps the
              dark field, adds depth and a luminous center. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[680px]"
            style={{
              background:
                "radial-gradient(58% 64% at 50% 0%, rgba(254,81,0,0.10) 0%, rgba(254,81,0,0.03) 34%, transparent 72%)",
            }}
          />
          <div className="relative mx-auto flex max-w-[940px] flex-col items-center text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-edge bg-white/[0.04] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                For businesses that run on people
              </span>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-8 text-balance font-serif text-[clamp(3.25rem,9vw,7rem)] font-normal leading-[0.94] tracking-[-0.02em] text-ink">
                <em className="italic">Own</em> your direction
                <span className="text-orange">.</span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-9 text-[clamp(1.0625rem,1.9vw,1.375rem)] font-medium tracking-[-0.01em] text-ink">
                Urso is the operating system for your business.
              </p>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-3 max-w-[54ch] text-[17px] leading-[1.55] text-ink-dim sm:text-[19px]">
                Connect the data scattered across sales, scheduling, books, phones
                and reviews — then fix what it finds, week after week.
              </p>
            </Reveal>

            <Reveal delay={220} className="mt-11 w-full">
              <HeroAsk />
            </Reveal>

            <Reveal delay={280}>
              <p className="mt-6 text-[15px] text-ink-dimmer">
                See everything. Ask anything.
              </p>
            </Reveal>

            <Reveal delay={340}>
              <p className="mt-10 font-mono text-[11px] uppercase leading-[1.6] tracking-[0.14em] text-ink-dimmer">
                29 months of POS history · 4 locations · $6.8M validated to the penny
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== Product showcase ===== */}
        <section className="relative overflow-hidden px-[clamp(20px,4vw,56px)] pb-[clamp(64px,11vw,160px)] pt-[clamp(24px,5vw,80px)]">
          <Reveal className="mx-auto max-w-[1000px] text-center">
            <h2 className="text-balance font-serif text-[clamp(3rem,7vw,6rem)] font-normal leading-[1.02] tracking-[-0.025em] text-ink">
              <em className="italic">Simplify</em> your operation
              <span className="text-orange">.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="mt-[clamp(28px,4vw,52px)] w-full">
            <div className="relative mx-auto" style={{ maxWidth: 720 }}>
              {/* Soft glow lifting the device off the dark field. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(52% 44% at 50% 46%, rgba(254,81,0,0.1) 0%, transparent 70%)",
                }}
              />
              <Image
                src="/images/macbookmockup.png"
                alt="The Urso dashboard on a MacBook — a performance overview across the whole business."
                width={1080}
                height={1080}
                sizes="(max-width: 768px) 100vw, 720px"
                className="relative h-auto w-full"
              />
            </div>
          </Reveal>
        </section>

        {/* ===== Story / what we offer ===== */}
        <section className="border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,12vw,176px)]">
          <Reveal className="mx-auto max-w-[820px] text-center">
            <h2 className="text-balance font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.025em] text-ink">
              <em className="italic">More</em> than software
              <span className="text-orange">.</span>
            </h2>
            <p className="mt-7 text-[clamp(1.0625rem,1.9vw,1.375rem)] font-medium tracking-[-0.01em] text-ink">
              You don&rsquo;t buy a tool — you hire the team that runs it.
            </p>
            <p className="mx-auto mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              Urso connects the data scattered across your business into one
              operating system, surfaces where you&rsquo;re losing money, and works
              with your team to fix it — week after week. The software is where we
              start; the partnership is what you&rsquo;re paying for.
            </p>
            <div className="mt-9 flex justify-center">
              <WipeLink
                href="/what-we-do"
                className="group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.035) 100%)",
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.07), 0 16px 32px -16px rgba(0,0,0,0.85)",
                }}
              >
                More about what we do
              </WipeLink>
            </div>
          </Reveal>

          <Offerings />
        </section>

        {/* ===== Ask anything (AI layer) ===== */}
        <section className="relative overflow-hidden border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,12vw,176px)]">
          <Reveal className="relative mx-auto max-w-[760px] text-center">
            <div className="flex justify-center">
              <Sparkle size={52} />
            </div>
            <h2 className="mt-8 text-balance font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.025em] text-ink">
              <em className="italic">Ask</em> anything
              <span className="text-orange">.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              Urso AI turns your numbers into answers you can trust — grounded in
              your real data, sized in dollars, and ready to act on.
            </p>
          </Reveal>
          <Reveal delay={120} className="relative mt-[clamp(40px,6vw,72px)]">
            <AskDemo />
          </Reveal>
        </section>

        {/* ===== Feature cards: dashboard + AI analyst ===== */}
        <section className="border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,11vw,160px)]">
          <Reveal>
            <FeatureCards />
          </Reveal>
        </section>

        {/* ===== Measure what matters (dashboard metrics) ===== */}
        <section className="border-t border-edge px-[clamp(20px,4vw,56px)] py-[clamp(72px,12vw,176px)]">
          <Reveal className="mx-auto max-w-[820px] text-center">
            <h2 className="text-balance font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.025em] text-ink">
              <em className="italic">Measure</em> what matters
              <span className="text-orange">.</span>
            </h2>
            <p className="mt-7 text-[clamp(1.0625rem,1.9vw,1.375rem)] font-medium tracking-[-0.01em] text-ink">
              Every number, defined once.
            </p>
            <p className="mx-auto mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-dim sm:text-[18px]">
              Revenue, capacity, retention, reputation — the metrics that actually
              move your business, live on one screen and true at every location.
            </p>
            <div className="mt-9 flex justify-center">
              <WipeLink
                href="/capabilities"
                className="group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.035) 100%)",
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.07), 0 16px 32px -16px rgba(0,0,0,0.85)",
                }}
              >
                More about the dashboard
              </WipeLink>
            </div>
          </Reveal>
          <div className="mt-[clamp(48px,7vw,88px)]">
            <MeasureCards />
          </div>
        </section>

        {/* ===== 01 Outcomes ===== */}
        <Section id="outcomes">
          <SectionHead
            index="01"
            eyebrow="Outcomes"
            title="More revenue. Better margins. Less chaos"
            lede="Every engagement is judged the way you judge your business: did the number move."
          />
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {OUTCOMES.map((o, i) => (
              <Reveal key={o.n} delay={i * 80}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
                      {o.n}
                    </span>
                    <span className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-raise-strong">
                      {o.n}
                    </span>
                  </div>
                  <h3 className="mt-8 text-[21px] font-medium tracking-[-0.02em] text-ink">
                    {o.title}
                  </h3>
                  <Body className="mt-3">{o.body}</Body>
                </Card>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ===== 02 The problem ===== */}
        <Section id="problem">
          <div className="grid grid-cols-1 items-start gap-x-10 gap-y-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal>
                <Eyebrow index="02">The problem</Eyebrow>
                <Headline className="mt-4">You don&rsquo;t need another dashboard</Headline>
                <Lede className="mt-5">
                  Your business already produces the data. It&rsquo;s just trapped —
                  in the POS, the books, the booking system, the phones, the
                  review pages, and your head.
                </Lede>
              </Reveal>
              <Reveal delay={80} className="mt-8">
                <ul>
                  {PAINS.map((p, i) => (
                    <li
                      key={i}
                      className="flex gap-4 border-t border-edge py-4 last:border-b"
                    >
                      <span className="mt-0.5 font-mono text-[11px] text-ink-dimmer">
                        {`0${i + 1}`}
                      </span>
                      <span className="text-[16px] leading-[1.5] text-ink-dim">
                        {p}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div className="lg:col-span-7">
              <ConnectDiagram />
            </div>
          </div>
        </Section>

        {/* ===== 03 The system (bone contrast) ===== */}
        <Section id="system" bone>
          <SectionHead
            index="03"
            eyebrow="What Urso does"
            title="One partner. Five jobs"
            lede="Urso is not a software vendor, and not a slide-deck consultancy. We build the intelligence layer behind your business — then stay to run it with you."
          />
          <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-px overflow-hidden rounded-xl border border-edge sm:grid-cols-2 sm:gap-y-0 lg:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.n} delay={(i % 3) * 70}>
                <div className="h-full border-edge bg-panel p-6 sm:p-7">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dimmer">
                    {p.n}
                  </span>
                  <h3 className="mt-5 text-[19px] font-medium tracking-[-0.02em] text-ink">
                    {p.title}
                  </h3>
                  <Body className="mt-2.5">{p.body}</Body>
                </div>
              </Reveal>
            ))}
            <div className="hidden h-full bg-panel lg:block" />
          </div>
          <Reveal delay={120}>
            <p className="mt-10 max-w-[40ch] text-[clamp(1.25rem,2.2vw,1.625rem)] font-medium leading-[1.25] tracking-[-0.02em] text-ink">
              You&rsquo;re not buying software. You&rsquo;re hiring the team that
              runs it<span className="text-orange">.</span>
            </p>
          </Reveal>
        </Section>

        {/* ===== 04 What we find ===== */}
        <Section id="findings">
          <SectionHead
            index="04"
            eyebrow="What we find"
            title="Proof looks like this"
            lede="We won't show you a wall of borrowed logos. What we have is a repeatable way of finding money — these are the patterns we hunt first."
            right={
              <Cta href="/what-we-find" variant="text">
                See the full list
              </Cta>
            }
          />
          <Reveal className="mt-10">
            <FindingsLedger findings={HOME_FINDINGS} />
          </Reveal>
        </Section>

        {/* ===== 05 How we work ===== */}
        <Section id="process">
          <SectionHead
            index="05"
            eyebrow="How we work"
            title="Review. Build. Activate. Improve"
            lede="Every engagement runs the same arc. No mystery, no black box."
            right={
              <Cta href="/how-it-works" variant="text">
                How an engagement runs
              </Cta>
            }
          />
          <div className="mt-14">
            <PhasePath />
          </div>
          <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {PHASE_NOTES.map(([title, body], i) => (
              <Reveal key={title} delay={i * 70}>
                <div className="border-t border-edge pt-5">
                  <div className="text-[16px] font-medium tracking-[-0.02em] text-ink">
                    {title}
                  </div>
                  <Body className="mt-2 text-[15px]">{body}</Body>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ===== 06 The operating layer ===== */}
        <Section id="operating-layer">
          <SectionHead
            index="06"
            eyebrow="The operating layer"
            title="The software stays in the background. The results don't"
            lede="Every client runs on a private operating system we build and maintain — every location, every number, and the next move, on one screen."
          />
          <div className="mt-12">
            <DashboardScene />
          </div>
          <Reveal delay={80}>
            <div className="mt-6">
              <MonoNote>
                Every location · Every number · Defined once, true everywhere
              </MonoNote>
            </div>
          </Reveal>
        </Section>

        {/* ===== 07 Who it's for ===== */}
        <Section id="who">
          <SectionHead
            index="07"
            eyebrow="Who it's for"
            title="Built for businesses that run on people"
            lede="If revenue depends on customers showing up, teams executing, and schedules staying full, Urso fits."
          />
          <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-px overflow-hidden rounded-xl border border-edge sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCE.map(([label, body], i) => (
              <Reveal key={label} delay={(i % 3) * 70}>
                <div className="h-full bg-panel p-6 transition-colors duration-200 hover:bg-panel-strong sm:p-7">
                  <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">
                    {label}
                  </h3>
                  <Body className="mt-2.5 text-[15px]">{body}</Body>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <div className="mt-8">
              <MonoNote className="text-ink-dimmer">
                Pet care · Clinics · Med spas · Education · Home services ·
                Wellness · Childcare · Fitness · Franchise groups
              </MonoNote>
            </div>
          </Reveal>
        </Section>

        {/* ===== 08 Final CTA ===== */}
        <CtaBlock
          title="Own your direction"
          sub="Tell us how your business runs and what's getting harder. We'll come back with what we'd look at first — specific to your operation, not a pitch."
          note="Every engagement is shaped around the business, the systems involved, and the level of execution required."
        />
      </main>
      <SiteFooter />
    </>
  );
}
