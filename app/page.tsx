import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Section,
  Container,
  Eyebrow,
  Headline,
  Lede,
  Body,
  SectionHead,
  Cta,
  MonoNote,
  CtaBlock,
  BackdropGrid,
  Card,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import {
  InstrumentStrip,
  ConnectDiagram,
  PhasePath,
} from "@/components/site/motifs";
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
        <section className="relative overflow-hidden pb-[clamp(56px,9vw,112px)] pt-[clamp(118px,17vw,200px)]">
          <BackdropGrid />
          <Container className="relative">
            <Reveal>
              <Eyebrow>For businesses that run on people</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <Headline as="h1" size="display" className="mt-6 max-w-[17ch]">
                See everything. Fix the leaks. Grow with control
              </Headline>
            </Reveal>
            <Reveal delay={120}>
              <Lede className="mt-7 max-w-[62ch]">
                Urso connects the data scattered across your business — sales,
                scheduling, books, phones, reviews — into one operating system.
                Then we work with your team to fix what it finds, week after week.
              </Lede>
            </Reveal>
            <Reveal delay={180}>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Cta href="/contact" size="lg">
                  Start the conversation
                </Cta>
                <Cta href="/what-we-find" variant="text" size="lg">
                  See what you&rsquo;re missing
                </Cta>
              </div>
            </Reveal>
          </Container>

          <Container className="relative mt-[clamp(48px,7vw,88px)]">
            <InstrumentStrip />
            <Reveal delay={120}>
              <div className="mt-6 border-t border-edge pt-5">
                <MonoNote>
                  29 months of client POS history · 4 locations · $6.8M validated
                  to the penny
                </MonoNote>
              </div>
            </Reveal>
          </Container>
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
