import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { Reveal } from "@/components/site/reveal";
import { Approach } from "./_components/approach";
import { Arrow, BUTTON, BuildConnectOperate, CONTAINER, Check, Label, TONE_BG, type Tone } from "./_components/brand";
import { MarkHero } from "./_components/mark-hero";
import { Inquiry } from "./_components/inquiry";
import { SiteHeader } from "./_components/site-header";
import { BuildArt, ConnectArt, DispatchBoard, OperateArt, PracticeTest, StoresView } from "./_components/visuals";

export const metadata: Metadata = {
  title: { absolute: "Pontian | Software that fits the business" },
  description:
    "Pontian builds custom software, connects business data, and develops AI tools for day-to-day operations, then stays to keep it running.",
  icons: { icon: "/pontian/favicon.png", apple: "/pontian/apple-touch-icon.png" },
};

const PROOF: { value: string; tone: Tone; text: string }[] = [
  { value: "$6.8M", tone: "blue", text: "in sales across four stores, reconciled to the penny against the point of sale." },
  { value: "Twice a day", tone: "yellow", text: "each store's numbers refresh on their own, so nobody exports a report on Monday." },
  { value: "One system", tone: "red", text: "for a field-service team: leads, estimates, dispatch, invoices, and a crew app on iOS." },
];

const SERVICES: { tone: Tone; title: string; line: string; items: string[]; art: ReactNode; field: string }[] = [
  {
    tone: "blue",
    title: "Custom software",
    line: "Apps and internal tools shaped around the steps your team already takes.",
    items: ["Scheduling and dispatch", "Estimates with e-signature", "Crew apps on iOS"],
    art: <BuildArt />,
    field: "bg-pt-blue",
  },
  {
    tone: "yellow",
    title: "Connected data",
    line: "The tools you already pay for, reporting to one place you can check against the source.",
    items: ["Point of sale and bookkeeping", "Owner and manager dashboards", "Figures that match the original system"],
    art: <ConnectArt />,
    field: "bg-pt-yellow",
  },
  {
    tone: "red",
    title: "AI for operations",
    line: "Automation for the handoffs that currently depend on someone remembering.",
    items: ["Missed calls texted back", "Follow-ups and reminders", "A weekly brief written for the owner"],
    art: <OperateArt />,
    field: "bg-pt-red",
  },
];

type CaseStudy = {
  id: string;
  tag: string;
  title: string;
  field: string;
  visual: ReactNode;
  status?: string;
  rows: [string, string][];
};

const CASES: CaseStudy[] = [
  {
    id: "work-field",
    tag: "Field services, Palm Beach County",
    title: "The owner was dispatching every job from his truck.",
    field: "bg-pt-yellow",
    visual: <DispatchBoard />,
    rows: [
      ["Before", "Each job lived in its own Google Doc. Leads arrived by text, by phone, and through a website form that fed a system nobody checked."],
      ["What we built", "One platform for leads, estimates with e-signature, a dispatch calendar, crew checklists, and invoicing, on the web and in an iOS app."],
      ["Now", "Approving an estimate creates the job and the crew's checklist in one step. Finishing the job sends the invoice."],
    ],
  },
  {
    id: "work-stores",
    tag: "Multi-location retail, four stores",
    title: "Four stores, and every number lived in a different tool.",
    field: "bg-pt-blue",
    visual: <StoresView />,
    rows: [
      ["Before", "Comparing stores meant pulling reports by hand from the point of sale, one location at a time."],
      ["What we built", "A connection to the point of sale, one view for the owner, and a view scoped to each manager's own store."],
      ["Now", "29 months of sales, $6.8M in total, reconciled to the penny and refreshed twice a day without anyone touching it."],
    ],
  },
  {
    id: "work-education",
    tag: "Education, SAT prep",
    title: "A well-known SAT tutor was renting his own platform.",
    field: "bg-pt-red",
    visual: <PracticeTest />,
    status: "In build",
    rows: [
      ["Before", "His students practiced on software that an outside developer owned and charged him for."],
      ["What we're building", "A platform he owns outright, starting with practice tests that behave like the real digital SAT."],
      ["So far", "Test content imports straight from the documents he already writes in."],
    ],
  },
];

export default function PontianPage() {
  return (
    <>
      <a
        href="#content"
        className="sr-only z-50 rounded-[12px] bg-pt-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SiteHeader />

      <main id="content">
        <MarkHero>
              <p className="inline-flex items-center gap-2.5 rounded-full border border-pt-line bg-white py-1.5 pl-2 pr-3.5 text-[14px] font-medium">
                <span aria-hidden className="flex gap-1">
                  <span className="size-2.5 rounded-[3px] bg-pt-blue" />
                  <span className="size-2.5 rounded-[3px] bg-pt-yellow" />
                  <span className="size-2.5 rounded-[3px] bg-pt-red" />
                </span>
                Custom software, connected data, and AI tools
              </p>
              <h1 className="mt-6 text-[44px] font-bold leading-[48px] tracking-[-0.04em] sm:text-[56px] sm:leading-[60px] xl:text-[68px] xl:leading-[72px]">
                Software that{" "}
                <span className="relative inline-block">
                  <span aria-hidden className="absolute inset-x-[-0.06em] bottom-[0.1em] h-[0.3em] rounded-full bg-pt-yellow" />
                  <span className="relative">fits</span>
                </span>{" "}
                the business, not the other way around.
              </h1>
              <p className="mt-6 max-w-[34em] text-[18px] leading-[28px] text-pt-muted lg:text-[20px] lg:leading-[31px]">
                We spend time with your team until we can see how the work moves. Then we build the software around it, connect the tools you already
                pay for, and stay on to keep all of it running.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#start" className={BUTTON.primary}>
                  Start a project
                </a>
                <a href="#work" className={BUTTON.secondary}>
                  See the work
                </a>
              </div>
        </MarkHero>

        <section aria-label="Running in production" className="border-y border-pt-line">
          <div className={`${CONTAINER} py-12 lg:py-14`}>
            <Label tone="ink">Running in production today</Label>
            <ul className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
              {PROOF.map((item, index) => (
                <li key={item.value}>
                  <Reveal delay={index * 70}>
                    <p className="flex items-center gap-3 text-[36px] font-bold leading-[40px] tracking-[-0.035em] lg:text-[44px] lg:leading-[48px]">
                      <span aria-hidden className={`size-4 shrink-0 rounded-[5px] ${TONE_BG[item.tone]}`} />
                      {item.value}
                    </p>
                    <p className="mt-3 max-w-[34ch] text-[16px] leading-[26px] text-pt-muted">{item.text}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="services" className="scroll-mt-20 bg-pt-paper py-20 lg:py-28">
          <div className={CONTAINER}>
            <Reveal className="max-w-[44rem]">
              <Label tone="blue">What we do</Label>
              <h2 className="mt-5 text-[36px] font-bold leading-[42px] tracking-[-0.03em] lg:text-[48px] lg:leading-[54px]">
                Three kinds of work, one team that owns all of it.
              </h2>
              <p className="mt-5 text-[18px] leading-[28px] text-pt-muted lg:text-[20px] lg:leading-[31px]">
                Most projects start with one of these and grow into the other two. The people who design the system are the ones who build it and
                answer the phone when it needs a change.
              </p>
            </Reveal>

            <ul className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-3">
              {SERVICES.map((service, index) => (
                <li key={service.title}>
                  <Reveal delay={index * 80} className="h-full">
                    <a
                      href="#work"
                      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border border-pt-line bg-white transition-colors duration-200 hover:border-pt-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pt-action"
                    >
                      <div aria-hidden className={`relative m-2 grid h-[220px] place-items-center overflow-hidden rounded-[16px] ${service.field}`}>
                        <div className="transition-transform duration-300 ease-out group-hover:-translate-y-1.5 motion-reduce:transition-none">{service.art}</div>
                      </div>
                      <div className="flex flex-1 flex-col p-6 pt-5">
                        <Label tone={service.tone} className="text-pt-muted">
                          {["Build", "Connect", "Operate"][index]}
                        </Label>
                        <h3 className="mt-3 text-[26px] font-semibold leading-[32px] tracking-[-0.02em]">{service.title}</h3>
                        <p className="mt-2 text-[16px] leading-[26px] text-pt-muted">{service.line}</p>
                        <ul className="mt-5 space-y-2.5 border-t border-pt-line pt-5">
                          {service.items.map((item) => (
                            <li key={item} className="flex items-center gap-2.5 text-[15px] font-medium">
                              <Check className="size-4 shrink-0 text-pt-action" />
                              {item}
                            </li>
                          ))}
                        </ul>
                        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[15px] font-semibold text-pt-action group-hover:underline group-hover:underline-offset-4">
                          See it in the work
                          <Arrow className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </a>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="work" className="scroll-mt-20 py-20 lg:py-28">
          <div className={CONTAINER}>
            <Reveal className="max-w-[44rem]">
              <Label tone="yellow">Work</Label>
              <h2 className="mt-5 text-[36px] font-bold leading-[42px] tracking-[-0.03em] lg:text-[48px] lg:leading-[54px]">
                Three businesses, each starting from a different mess.
              </h2>
              <p className="mt-5 text-[18px] leading-[28px] text-pt-muted lg:text-[20px] lg:leading-[31px]">
                We keep client names private. The problems, the systems, and the numbers below are real.
              </p>
            </Reveal>

            <div className="mt-14 space-y-20 lg:mt-20 lg:space-y-28">
              {CASES.map((study, index) => (
                <article id={study.id} key={study.id} className="grid scroll-mt-28 items-center gap-10 lg:grid-cols-12 lg:gap-14">
                  <Reveal className={`lg:col-span-7 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                    <div className={`rounded-[32px] p-5 sm:p-10 lg:p-12 ${study.field}`}>{study.visual}</div>
                  </Reveal>
                  <Reveal delay={80} className="lg:col-span-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-pt-paper px-3 py-1 text-[13px] font-semibold">{study.tag}</span>
                      {study.status && (
                        <span className="rounded-full bg-pt-ink px-3 py-1 text-[13px] font-semibold text-white">{study.status}</span>
                      )}
                    </div>
                    <h3 className="mt-5 text-[28px] font-bold leading-[34px] tracking-[-0.025em] lg:text-[34px] lg:leading-[40px]">{study.title}</h3>
                    <dl className="mt-7 space-y-5">
                      {study.rows.map(([term, detail]) => (
                        <div key={term} className="border-t border-pt-line pt-4">
                          <dt className="text-[13px] font-semibold uppercase tracking-[0.06em] text-pt-muted">{term}</dt>
                          <dd className="mt-1.5 text-[17px] leading-[27px]">{detail}</dd>
                        </div>
                      ))}
                    </dl>
                  </Reveal>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="approach" className="scroll-mt-20 bg-pt-paper py-20 lg:py-28">
          <div className={CONTAINER}>
            <Reveal className="max-w-[44rem]">
              <Label tone="red">How we work</Label>
              <h2 className="mt-5 text-[36px] font-bold leading-[42px] tracking-[-0.03em] lg:text-[48px] lg:leading-[54px]">
                We learn the work before we write any code.
              </h2>
            </Reveal>
            <div className="mt-12 lg:mt-16">
              <Approach />
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-20 py-20 lg:py-32">
          <div className={CONTAINER}>
            <Reveal>
              <Label tone="blue">About</Label>
            </Reveal>
            <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-12">
              <Reveal className="lg:col-span-8">
                <p className="text-[26px] font-semibold leading-[34px] tracking-[-0.025em] lg:text-[38px] lg:leading-[46px]">
                  Every business we meet is two businesses at once. There is the one running today, held together by people, spreadsheets, and a lot of
                  memory, and the one it could be with the right systems underneath. Our job is the bridge between them.
                </p>
              </Reveal>
              <Reveal delay={80} className="lg:col-span-4 lg:pt-2">
                <p className="text-[17px] leading-[27px] text-pt-muted">
                  Pontian was founded by Han and Guga. Han leads the engineering. Guga leads client relationships, which mostly means he is the one who
                  calls you back.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="start" className="scroll-mt-20 px-3 pb-20 sm:px-6 lg:pb-28">
          <div className="relative mx-auto max-w-[1248px] overflow-hidden rounded-[32px] bg-pt-action px-6 py-14 text-white sm:px-10 lg:px-16 lg:py-20">
            <span aria-hidden className="absolute -bottom-14 left-[132px] hidden h-28 w-56 rounded-[32px] bg-pt-yellow lg:block" />
            <span aria-hidden className="absolute -bottom-16 -left-6 hidden size-36 rounded-[32px] bg-pt-red lg:block" />
            <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className="lg:pb-24">
                <p className="flex items-center gap-2.5 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em]">
                  <span aria-hidden className="size-2.5 rounded-[3px] bg-white" />
                  Start a project
                </p>
                <h2 className="mt-5 text-[40px] font-bold leading-[44px] tracking-[-0.035em] lg:text-[56px] lg:leading-[60px]">
                  Tell us where the work gets stuck.
                </h2>
                <p className="mt-5 max-w-[30em] text-[18px] leading-[28px] lg:text-[20px] lg:leading-[31px]">
                  A few sentences about the workflow is plenty. A founder reads every note and writes back with what we would look at first.
                </p>
                <p className="mt-8 text-[16px] leading-[26px]">
                  Or email{" "}
                  <a href="mailto:hello@urso.ws" className="font-semibold underline underline-offset-4 hover:no-underline">
                    hello@urso.ws
                  </a>
                </p>
              </Reveal>
              <Reveal delay={80}>
                <Inquiry />
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-pt-line">
        <div className={`${CONTAINER} grid gap-10 py-14 lg:grid-cols-[1.2fr_1fr] lg:py-16`}>
          <div>
            <Image src="/pontian/logo-lockup.png" alt="Pontian" width={881} height={228} className="h-auto w-[160px]" />
            <p className="mt-5 max-w-[34ch] text-[16px] leading-[26px] text-pt-muted">
              Custom software, connected data, and AI tools for real business operations.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-1 text-[15px] font-medium sm:grid-cols-3 lg:justify-self-end">
            {[
              ["#services", "Services"],
              ["#work", "Work"],
              ["#approach", "Approach"],
              ["#about", "About"],
              ["#start", "Start a project"],
              ["mailto:hello@urso.ws", "hello@urso.ws"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="inline-flex h-11 items-center hover:text-pt-action hover:underline hover:underline-offset-4">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-4 border-t border-pt-line py-6 text-[14px] text-pt-muted`}>
          <p>© 2026 Pontian</p>
          <BuildConnectOperate className="font-semibold text-pt-ink" />
        </div>
      </footer>
    </>
  );
}