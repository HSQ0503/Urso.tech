import Link from "next/link";
import { notFound } from "next/navigation";
import { reportBySlug, reports } from "@/components/research/data";

export function generateStaticParams() {
  return reports.map((r) => ({ slug: r.slug }));
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const report = reportBySlug(slug);
  if (!report) notFound();

  return (
    <main className="relative min-h-screen bg-[var(--urso-navy)] text-white">
      <div className="mx-auto max-w-[1100px] px-8 pb-24 pt-24 md:px-14 md:pt-32">
        <Link
          href="/#work"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 hover:text-white"
        >
          ← Research
        </Link>

        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.22em] text-white/60">
              {report.eyebrow}
            </div>
            <h1 className="mt-6 text-[clamp(38px,6vw,72px)] font-medium leading-[1.02] tracking-[-0.02em]">
              {report.title}
            </h1>
            <p className="mt-8 max-w-[60ch] text-[19px] leading-[1.5] text-white/75 md:text-[21px]">
              {report.deck}
            </p>
            <div className="mt-10 flex flex-wrap gap-x-10 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55">
              <span>{report.date}</span>
              <span>{report.meta}</span>
            </div>
            <div
              aria-hidden
              className="mt-8 h-[6px] w-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--urso-blue-bright) 0%, #5b8cff 28%, #a7c0ff 60%, var(--bone) 100%)",
              }}
            />
          </div>

          <aside className="border-t border-white/10 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/55">
              Written by
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="text-[17px] font-medium">Shouqi Han</div>
                <div className="text-[14px] text-white/65">Co-founder, Urso</div>
              </div>
              <div>
                <div className="text-[17px] font-medium">Gustavo Campos</div>
                <div className="text-[14px] text-white/65">Co-founder, Urso</div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-24 max-w-[68ch] border-t border-white/10 pt-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/55">
            Full report
          </div>
          <p className="mt-4 text-[17px] leading-[1.65] text-white/75">
            The long-form version of this piece is being prepared for the web.
            In the meantime, request a copy and we&apos;ll send the PDF — along
            with the sources behind every figure.
          </p>
          <Link
            href="mailto:hsq0503@gmail.com?subject=Request%20a%20copy%20of%20the%20Urso%20report"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:border-white/40 hover:bg-white/10"
          >
            Request a copy <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
