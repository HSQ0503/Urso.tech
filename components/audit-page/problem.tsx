import { Pill } from "@/components/ui/pill";

export function AuditProblem() {
  return (
    <section className="relative border-t border-edge bg-bg px-5 py-20 text-ink sm:px-8 sm:py-24 md:px-14">
      <div className="mx-auto max-w-[820px]">
        <Pill>The problem</Pill>
        <h2 className="mt-5 text-[clamp(34px,7.5vw,60px)] font-medium leading-[1.05] tracking-[-0.035em] sm:mt-6">
          The most expensive leaks are the ones
          <br className="hidden md:block" />{" "}
          <span className="text-ink-dim">you can&apos;t see</span>
          <span className="text-orange">.</span>
        </h2>
        <div className="mt-8 grid gap-6 text-[16px] leading-[1.55] tracking-[-0.005em] text-ink-dim sm:mt-10 sm:text-[17px]">
          <p>
            The after-hours calls nobody answers. The one-star reviews on a
            profile you don&apos;t control. The booking flow you&apos;ve never
            walked as a customer. None of it shows up in your POS, and none of
            it shows up in your books — so it keeps costing you, quietly,
            every week.
          </p>
          <p>
            And the gap you feel but can&apos;t explain: your best store and
            your worst store are running different businesses. The audit
            makes all of it visible — in your numbers, not a benchmark.
          </p>
        </div>
      </div>
    </section>
  );
}
