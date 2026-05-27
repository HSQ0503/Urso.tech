import { reports } from "./research/data";
import { ReportCard } from "./research/report-card";

export function Research() {
  return (
    <section
      id="work"
      className="relative border-t border-edge bg-bg px-14 py-24 text-ink"
    >
      <div className="mb-14 max-w-[820px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dimmer">
          02 — Research
        </div>
        <h2 className="mt-6 text-[64px] font-medium leading-[1.02] tracking-[-0.03em]">
          Notes from inside the{" "}
          <em className="font-medium italic text-ink-dim">work</em>
          <span className="text-orange">.</span>
        </h2>
        <p className="mt-6 max-w-[600px] text-[17px] leading-[1.5] text-ink-dim">
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
