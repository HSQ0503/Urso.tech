import { Pill } from "@/components/ui/pill";

const artifacts: Array<{ title: string; body: string }> = [
  {
    title: "Your operating system, live.",
    body: "Every store in one dashboard — filterable per store, comparable side by side. You're logged in and using it during the audit, not after.",
  },
  {
    title: "The Leak Report.",
    body: "Your top leaks, in your numbers, with a measurement plan and the one fix worth making. Worth having even if we never work together again.",
  },
];

export function AuditDeliverables() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="max-w-[640px]">
          <Pill>What you walk away with</Pill>
          <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
            Two artifacts<span className="text-orange">.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:mt-14 md:grid-cols-2 md:gap-6">
          {artifacts.map((a) => (
            <div
              key={a.title}
              className="rounded-2xl border border-edge bg-panel p-7 sm:p-9"
            >
              <h3 className="text-[22px] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[24px]">
                {a.title}
              </h3>
              <p className="mt-4 text-[14px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:text-[15px]">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
