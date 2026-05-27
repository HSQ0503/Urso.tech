import Link from "next/link";
import type { Report } from "./data";

export function ReportCard({ report }: { report: Report }) {
  const { slug, eyebrow, title, meta, cover } = report;

  return (
    <Link
      href={`/reports/${slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-edge bg-panel/60 no-underline transition-[transform,border-color,background-color,box-shadow] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-edge-strong hover:bg-panel hover:shadow-[0_28px_60px_-32px_rgba(254,81,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden border-b border-edge bg-[#0a0a0a]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 110%, rgba(254,81,0,0.18), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[360ms] group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(80% 50% at 50% 50%, rgba(254,81,0,0.12), transparent 70%)",
          }}
        />
        <div className="relative h-[62%] w-[62%]">{cover}</div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6 md:p-7">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dimmer">
          {eyebrow}
        </div>
        <h3 className="m-0 text-[20px] font-medium leading-[1.2] tracking-[-0.01em] text-ink md:text-[22px]">
          {title}
        </h3>
        <div className="mt-auto flex items-center justify-between border-t border-edge pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          <span>{meta}</span>
          <span className="flex items-center gap-1 text-orange opacity-0 transition-opacity duration-[220ms] group-hover:opacity-100 group-focus-visible:opacity-100">
            Read <span aria-hidden>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
