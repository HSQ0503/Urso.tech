import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import {
  Section,
  Eyebrow,
  Headline,
  Body,
  PageHero,
  CtaBlock,
} from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SystemSchematic } from "@/components/site/motifs";

export const metadata: Metadata = {
  title: "Capabilities",
  description:
    "One operating layer, many parts — intelligence, systems, automation, execution, and growth. Not a menu of services: the tools an Urso engagement brings.",
};

const GROUPS = [
  {
    n: "01",
    name: "Intelligence",
    tagline: "See clearly",
    items: [
      ["Data unification", "POS, books, payroll, phones, booking, reviews — one validated source of truth."],
      ["KPI definition & tracking", "Metrics defined once and true everywhere, so stores compare honestly."],
      ["Revenue opportunity analysis", "Leaks found and sized in dollars, ranked by certainty."],
      ["Customer intelligence", "Who's due back, who's slipping away, who's worth a call today."],
      ["Product & service intelligence", "What sells where, what's ignored where, and what that's worth."],
      ["Scheduling & utilization analysis", "Where the calendar leaks hours and the chairs sit empty."],
    ],
  },
  {
    n: "02",
    name: "Systems",
    tagline: "Build the layer",
    items: [
      ["Operational dashboards", "Every location, every number, one screen — owner and manager views."],
      ["Custom internal tools", "Built where off-the-shelf doesn't fit how you run."],
      ["System integrations", "The tools you already use, finally talking to each other."],
      ["Data quality & validation", "Reconciled against source systems — to the penny, not roughly."],
    ],
  },
  {
    n: "03",
    name: "Automation",
    tagline: "Remove the busywork",
    items: [
      ["AI agents", "Watching the numbers, drafting the brief, chasing the follow-up — quietly."],
      ["Workflow automation", "The repeatable steps between systems, done without a human relay."],
      ["Alerts & monitoring", "Silent until there's a move to make. Then specific."],
      ["Automated reporting", "The weekly brief written before Monday opens."],
    ],
  },
  {
    n: "04",
    name: "Execution",
    tagline: "Make it stick",
    items: [
      ["Implementation", "We install the fixes with your team — not a recommendations PDF."],
      ["Team process improvement", "The best location's playbook, made standard at all of them."],
      ["Training & adoption", "Managers who use the system because it's faster than not using it."],
      ["Operations support", "A standing partner when something breaks, drifts, or changes."],
    ],
  },
  {
    n: "05",
    name: "Growth",
    tagline: "Scale with direction",
    items: [
      ["Ongoing advisory", "An operator across the table every month, looking at the same numbers."],
      ["Margin improvement", "Labor, inventory, and spend tuned against what the data supports."],
      ["Location benchmarking", "What your best store proves, rolled out to the rest."],
      ["Expansion readiness", "Open the next location on systems, not adrenaline."],
    ],
  },
];

export default function CapabilitiesPage() {
  return (
    <>
      <SiteNav />
      <main className="bg-bg text-ink">
        <PageHero
          eyebrow="Capabilities"
          title="One system. Many parts"
          sub="Everything below ships as part of one operating layer — not a menu of services. You engage Urso; these are the tools the engagement brings."
          primary={{ label: "Start the conversation", href: "/contact" }}
          visual={<SystemSchematic />}
        />

        {GROUPS.map((g, gi) => (
          <Section key={g.n} divide={gi !== 0}>
            <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
              <Reveal className="lg:col-span-4">
                <Eyebrow index={g.n}>{g.name}</Eyebrow>
                <Headline className="mt-4">{g.tagline}</Headline>
              </Reveal>
              <div className="grid grid-cols-1 gap-px self-start overflow-hidden rounded-xl border border-edge sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
                {g.items.map(([name, desc], i) => (
                  <Reveal key={name} delay={(i % 2) * 60}>
                    <div className="h-full bg-panel p-5 transition-colors duration-200 hover:bg-panel-strong">
                      <h3 className="text-[15px] font-medium tracking-[-0.01em] text-ink">
                        {name}
                      </h3>
                      <Body className="mt-2 text-[14px] leading-[1.5]">{desc}</Body>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </Section>
        ))}

        <CtaBlock
          title="The parts only matter assembled"
          sub="Tell us what you run today and we'll tell you which of these your operation actually needs — and in what order."
          secondary={{ label: "See what we find", href: "/what-we-find" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
