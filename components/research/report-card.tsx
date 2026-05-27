import Link from "next/link";
import type { Report } from "./data";

export function ReportCard({ report }: { report: Report }) {
  const { slug, eyebrow, title, meta, tone, cover } = report;
  const isBone = tone === "bone";

  return (
    <Link
      href={`/reports/${slug}`}
      className="group relative flex flex-col overflow-hidden rounded-[18px] bg-[var(--bone)] no-underline transition-[transform,box-shadow] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[0_28px_60px_-24px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--urso-blue-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div
        className={`relative flex aspect-[4/5] items-center justify-center overflow-hidden tone-${tone} ${isBone ? "border-b border-[var(--line)]" : ""}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.08), transparent 60%)",
          }}
        />
        <div className="relative h-[62%] w-[62%]">{cover}</div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6 md:p-7">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          {eyebrow}
        </div>
        <h3 className="m-0 text-[20px] font-medium leading-[1.2] tracking-[-0.01em] text-[var(--ink)] md:text-[22px]">
          {title}
        </h3>
        <div className="mt-auto flex items-center justify-between border-t border-[var(--line)] pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
          <span>{meta}</span>
          <span className="flex items-center gap-1 text-[var(--urso-blue)] opacity-0 transition-opacity duration-[220ms] group-hover:opacity-100 group-focus-visible:opacity-100">
            Read <span aria-hidden>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
