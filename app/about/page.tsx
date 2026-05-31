import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { DiagnosticCta } from "@/components/diagnostic-cta";
import { Pill } from "@/components/ui/pill";

export const metadata: Metadata = {
  title: "About | Urso",
  description:
    "Urso is a data agency for founder-led businesses. We find where your operation is losing money, then fix it with you on retainer.",
};

const steps = [
  {
    num: "01",
    verb: "Find",
    body: "We unify your data POS, calls, ads, finance and run a diagnostic that shows exactly where money is leaking, priced in dollars.",
  },
  {
    num: "02",
    verb: "Fix",
    body: "We build and ship the fix with you. Advisory, automation, or custom software whatever that specific leak actually needs.",
  },
  {
    num: "03",
    verb: "Stay",
    body: "We stay on retainer and measure every month, so the fixes hold and the next leak gets caught before it costs you.",
  },
];

const principles = [
  {
    title: "Built with you, not at you.",
    body: "We sit down with the operator and build the plan together. No black boxes, no 80-page deck you never read.",
  },
  {
    title: "Plain numbers over vanity metrics.",
    body: "Every finding ties back to dollars and a location. If it doesn't move money, we don't report it.",
  },
  {
    title: "Senior people, small team.",
    body: "You work with the people doing the work not an account manager relaying messages to an offshore queue.",
  },
  {
    title: "On retainer, accountable.",
    body: "We don't ship and disappear. We stay attached to the outcome and answer for the numbers every month.",
  },
];

export default function AboutPage() {
  return (
    <main className="bg-bg text-ink">
      <Nav />

      {/* Intro */}
      <section className="border-b border-edge px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20 md:px-14 md:pb-24 md:pt-24">
        <div className="max-w-[860px]">
          <Pill dot>About Urso</Pill>
          <h1 className="mt-5 text-[clamp(40px,8vw,80px)] font-medium leading-[1.0] tracking-[-0.04em] sm:mt-6">
            We find the leaks.
            <br />
            <span className="text-ink-dim">Then we close them</span>
            <span className="text-orange">.</span>
          </h1>
          <p className="mt-7 max-w-[640px] text-[16px] leading-[1.55] text-ink-dim sm:mt-8 sm:text-[19px]">
            Urso is a data agency for founder-led service businesses. We&apos;re
            not a software company that happens to consult we&apos;re an
            operating partner that happens to build software, when the fix needs
            it.
          </p>
        </div>
      </section>

      {/* What we actually do */}
      <section className="border-b border-edge px-5 py-16 sm:px-8 sm:py-20 md:px-14 md:py-24">
        <div className="mb-10 max-w-[720px] sm:mb-14">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
            What we actually do
          </div>
          <h2 className="mt-5 text-[clamp(30px,6vw,52px)] font-medium leading-[1.04] tracking-[-0.03em] sm:mt-6">
            One job, plainly stated
            <span className="text-orange">.</span>
          </h2>
          <p className="mt-5 max-w-[600px] text-[15px] leading-[1.5] text-ink-dim sm:text-[17px]">
            Most agencies sell you a deliverable. We sell you an outcome: less
            money slipping out of your business than there was last month.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-edge bg-[#0b0b0b]">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={s.num}
                className={`flex flex-col px-6 py-8 md:px-8 md:py-10 ${
                  i > 0 ? "border-t border-edge md:border-l md:border-t-0" : ""
                }`}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.18em]">
                  <span className="text-orange">{s.num}</span>
                  <span className="ml-2 text-ink">{s.verb}</span>
                </div>
                <p className="mt-4 text-[15px] leading-[1.55] text-ink-dim">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The system is a byproduct */}
      <section className="border-b border-edge px-5 py-16 sm:px-8 sm:py-20 md:px-14 md:py-24">
        <div className="grid grid-cols-1 gap-10 rounded-2xl border border-dashed border-edge-strong bg-panel/60 p-7 sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-14">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
              <span className="size-1.5 rounded-full bg-orange" />
              A clarification
            </div>
            <h2 className="mt-4 text-[clamp(26px,4.6vw,40px)] font-medium leading-[1.1] tracking-[-0.025em]">
              The AI operating system is the tool not the product.
            </h2>
            <p className="mt-5 max-w-[520px] text-[15px] leading-[1.6] text-ink-dim">
              Yes, we build a custom operating system trained on your data. But
              that&apos;s the means, not the offer. The software exists so we can
              find leaks faster and fix them in a way that lasts. You&apos;re
              hiring the team and the judgement. The system just comes with it.
            </p>
            <div className="mt-7">
              <Link
                href="/#system"
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:text-orange"
              >
                See the system
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            {[
              ["What you're buying", "An operating partner who is on the hook for your numbers."],
              ["What you're not buying", "A SaaS login we hand you and walk away from."],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-edge bg-[#0d0d0d] px-5 py-4"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                  {label}
                </div>
                <div className="mt-2 text-[14.5px] leading-[1.45] text-ink">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="border-b border-edge px-5 py-16 sm:px-8 sm:py-20 md:px-14 md:py-24">
        <div className="mb-10 max-w-[720px] sm:mb-14">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
            How we work
          </div>
          <h2 className="mt-5 text-[clamp(30px,6vw,52px)] font-medium leading-[1.04] tracking-[-0.03em] sm:mt-6">
            What you can count on
            <span className="text-orange">.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-edge bg-edge sm:grid-cols-2">
          {principles.map((p) => (
            <div key={p.title} className="bg-[#0b0b0b] px-6 py-8 md:px-8 md:py-9">
              <h3 className="text-[18px] font-medium leading-[1.25] tracking-[-0.01em]">
                {p.title}
              </h3>
              <p className="mt-3 text-[14px] leading-[1.55] text-ink-dim">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <DiagnosticCta />
      <Footer />
    </main>
  );
}
