import { Pill } from "@/components/ui/pill";

const steps: Array<{
  n: string;
  title: string;
  body: string;
}> = [
  {
    n: "01",
    title: "We dig before we talk.",
    body: "By our first real call, we've already walked your stores as a customer — ranked your listings, tested your phones after hours, read every review. We show up knowing things about your business. Most vendors show up with questions.",
  },
  {
    n: "02",
    title: "We stand up your operating system.",
    body: "Your POS, Google, books, and calls — wired into one live dashboard, in weeks, not months. You log in and watch your own business surface itself. Observation only; we change nothing yet.",
  },
  {
    n: "03",
    title: "We hand you the one fix worth making.",
    body: "Not a deck of twelve. One leak, what it's costing you in dollars, the fix in plain language, and exactly how we'll measure whether it worked.",
  },
];

export function AuditProcess() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>What we do</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            Three beats<span className="text-orange">.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:mt-14 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="bg-bg p-7 sm:p-9">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-orange">
                {s.n}
              </div>
              <h3 className="mt-5 text-[20px] font-medium leading-[1.2] tracking-[-0.015em] sm:text-[22px]">
                {s.title}
              </h3>
              <p className="mt-4 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
