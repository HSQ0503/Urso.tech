import { Pill } from "@/components/ui/pill";

const steps: Array<{
  n: string;
  week: string;
  title: string;
  body: string;
}> = [
  {
    n: "01",
    week: "Week 1",
    title: "Recon, before we talk.",
    body: "By our first real call, we've already walked your business as a customer — ranked your listings, tested your phones after hours, read every review. We show up knowing things. Most vendors show up with questions.",
  },
  {
    n: "02",
    week: "Weeks 2–3",
    title: "Your operating system, live.",
    body: "POS, Google, books, ads, calls, reviews — wired into one dashboard, observable per location and side by side. You log in and watch your own business surface itself, in real numbers, in real time.",
  },
  {
    n: "03",
    week: "Week 4",
    title: "Fortune-500 analytics in your hands.",
    body: "Every system aggregated, every signal surfaced, every leak quantified. You walk out with the dashboard, the leak report, and a measurement plan tied to each fix — so every decision after this is backed by data.",
  },
];

export function AuditProcess() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>How it works</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            Four weeks. Three beats<span className="text-orange">.</span>
          </h2>
          <p className="mt-5 max-w-[520px] text-[15px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:mt-6 sm:text-[16px]">
            From the moment access is granted to the day you hold the leak
            report — a fixed timeline, no surprises.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-edge bg-edge md:mt-14 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="relative flex flex-col bg-bg p-7 sm:p-9"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-orange">
                  {s.n}
                </span>
                <span className="h-px flex-1 bg-edge-strong/40" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
                  {s.week}
                </span>
              </div>
              <h3 className="mt-6 text-[20px] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[22px]">
                {s.title}
              </h3>
              <p className="mt-4 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
                {s.body}
              </p>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[-9px] top-1/2 hidden h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-bg font-mono text-[11px] text-orange md:flex"
                >
                  ›
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
