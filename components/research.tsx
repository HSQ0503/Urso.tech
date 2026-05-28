import { reports } from "./research/data";
import { ReportCard } from "./research/report-card";

export function Research() {
  return (
    <section
      id="work"
      className="relative border-t border-edge bg-bg px-5 py-16 text-ink sm:px-8 sm:py-20 md:px-14 md:py-24"
    >
      <div className="mb-10 max-w-[820px] sm:mb-14">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
          02 — Research
        </div>
        <h2 className="mt-5 text-[clamp(34px,7.5vw,64px)] font-medium leading-[1.02] tracking-[-0.03em] sm:mt-6">
          Notes from inside the{" "}
          <em className="font-medium italic text-ink-dim">work</em>
          <span className="text-orange">.</span>
        </h2>
        <p className="mt-5 max-w-[600px] text-[15px] leading-[1.5] text-ink-dim sm:mt-6 sm:text-[17px]">
          Short, honest pieces about what actually moves the needle for
          founder-led service businesses — written while we build, not after.
          No gated PDFs, no fake stats.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {reports.map((r) => (
          <ReportCard key={r.slug} report={r} />
        ))}
      </div>
    </section>
  );
}
