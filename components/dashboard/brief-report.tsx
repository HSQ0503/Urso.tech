import Link from "next/link";
import { type BriefChange, type WeeklyBrief } from "@/components/dashboard/data";
import { type T } from "@/lib/i18n";
import { Micro, Delta } from "@/components/dashboard/ui";
import { CountUp, type CountFormat } from "@/components/dashboard/count-up";
import { RichInline } from "@/components/dashboard/rich-text";

// Delta colors green when good — map our precomputed `good` onto its invert flag.
const deltaInvert = (c: BriefChange) => (c.delta >= 0) !== c.good;

// BriefChange ships only the preformatted string, so recover the raw number to
// let the headline stats tick up. The patterns mirror CountUp's money/pct/int
// output exactly; anything that doesn't round-trip (the seeded "4.8" rating)
// stays a static string rather than settling on a different figure.
function parseStat(value: string): { n: number; format: CountFormat } | null {
  if (/^\$[\d,]+(\.\d+)?$/.test(value)) return { n: Number(value.slice(1).replace(/,/g, "")), format: "money" };
  if (/^[\d,]+(\.\d+)?%$/.test(value)) return { n: Number(value.replace(/[,%]/g, "")) / 100, format: "pct" };
  if (/^[\d,]+$/.test(value)) return { n: Number(value.replace(/,/g, "")), format: "int" };
  return null;
}

// One sectioned row of the report: a label in the left margin, content on the
// right, divided from the row above by a single hairline — the structure that
// makes the brief read as one document rather than a stack of cards.
function Row({ label, rise, children }: { label: string; rise?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <section className={`grid gap-x-10 gap-y-3 border-t border-edge px-6 py-6 sm:grid-cols-[150px_1fr] sm:px-9 sm:py-7${rise ? " dash-rise" : ""}`} style={rise}>
      <div className="font-mono text-[10.5px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">{label}</div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

// `t` is passed in (server component) so the static chrome translates with the
// dashboard locale. The AI-written headline/wins/risks/recommendation stay in
// their source language — they're generated content, not UI copy.
export function BriefReport({
  b,
  scopeText,
  period,
  generatedAt,
  t,
  animate = false,
}: {
  b: WeeklyBrief;
  scopeText: string;
  period: string;
  generatedAt: string;
  t: T;
  /** Dashboard entrance motion — left off so the print surface stays still. */
  animate?: boolean;
}) {
  // Section stagger continues from the page chrome (the download pill is 0).
  const rise = (i: number) => (animate ? ({ "--i": i } as React.CSSProperties) : undefined);
  return (
    <article className="brief-report mx-auto max-w-[1040px] overflow-hidden rounded-sm border border-edge bg-panel dash-raise">
      {/* Letterhead */}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-edge px-6 py-3.5 sm:px-9${animate ? " dash-rise" : ""}`} style={rise(1)}>
        <div className="flex items-center gap-2.5">
          <span className="size-1.5 rounded-full bg-orange" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dim">{t("Urso · Weekly Operating Brief")}</span>
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">{generatedAt} · {t("Confidential")}</span>
      </div>

      {/* Masthead */}
      <div className={`px-6 py-7 sm:px-9 sm:py-9${animate ? " dash-rise" : ""}`} style={rise(2)}>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-dimmer">{t(scopeText)} · {t(period)}</div>
        <h1 className="mt-2.5 text-[clamp(24px,3vw,34px)] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">{t("The week in one page")}</h1>
        <p className="mt-2.5 max-w-[640px] text-[13.5px] leading-[1.55] text-ink-dim">
          {t("Generated automatically every Monday — what changed, what to watch, and the single thing worth doing next.")}
        </p>
      </div>

      {/* Summary */}
      <Row label={t("Summary")} rise={rise(3)}>
        <p className="max-w-[760px] text-[clamp(15px,1.5vw,17px)] font-medium leading-[1.5] tracking-[-0.005em] text-ink"><RichInline text={b.headline} /></p>
      </Row>

      {/* What changed — an inline stat table, not boxed cells. */}
      <Row label={t("What changed")} rise={rise(4)}>
        <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
          {b.changes.map((c) => {
            const stat = animate ? parseStat(c.value) : null;
            return (
              <div key={c.label} className="sm:border-l sm:border-edge sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
                <Micro>{t(c.label)}</Micro>
                <div className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
                  {stat ? <CountUp value={stat.n} format={stat.format} /> : c.value}
                </div>
                <div className="mt-2"><Delta value={c.delta} invert={deltaInvert(c)} /></div>
              </div>
            );
          })}
        </div>
      </Row>

      {/* Improved / watch — two columns inside the document. */}
      <Row label={t("Improved · watch")} rise={rise(5)}>
        <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
          <div>
            <Micro className="!text-[var(--color-good)]">{t("What improved")}</Micro>
            <ul className="mt-3 divide-y divide-edge">
              {b.wins.map((w, i) => (
                <li key={i} className="py-2 text-[13px] leading-[1.5] text-ink-dim first:pt-0 last:pb-0"><RichInline text={w} /></li>
              ))}
            </ul>
          </div>
          <div className="sm:border-l sm:border-edge sm:pl-10">
            <Micro className="!text-orange">{t("What to watch")}</Micro>
            <ul className="mt-3 divide-y divide-edge">
              {b.risks.map((r, i) => (
                <li key={i} className="py-2 text-[13px] leading-[1.5] text-ink-dim first:pt-0 last:pb-0"><RichInline text={r} /></li>
              ))}
            </ul>
          </div>
        </div>
      </Row>

      {/* Biggest opportunity — the key finding, marked with the orange rule. */}
      <Row label={t("Biggest opportunity")} rise={rise(6)}>
        <div className="border-l-2 pl-4" style={{ borderLeftColor: "var(--color-orange)" }}>
          <h2 className="text-[clamp(17px,1.8vw,21px)] font-semibold leading-[1.25] tracking-[-0.01em] text-ink"><RichInline text={b.opportunity.title} /></h2>
          {/* Win rule — the page's single dash-draw, arriving once the section has settled. */}
          {animate && <div aria-hidden className="dash-draw mt-2.5 h-px max-w-[680px] bg-orange" style={{ "--reveal-delay": "650ms" } as React.CSSProperties} />}
          <p className="mt-2.5 max-w-[680px] text-[14px] leading-[1.55] text-ink-dim"><RichInline text={b.opportunity.detail} /></p>
        </div>
      </Row>

      {/* Recommended next step + the week's action tally. */}
      <Row label={t("Recommended next step")} rise={rise(7)}>
        <p className="max-w-[680px] text-[clamp(15px,1.6vw,18px)] font-medium leading-[1.4] tracking-[-0.005em] text-ink"><RichInline text={b.recommendation} /></p>
        <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dimmer">
            <span className="text-[var(--color-good)]">{b.actionsCompleted}</span> {t("completed")}
            <span className="mx-1.5 text-ink-dimmer">·</span>
            <span className="text-ink">{b.actionsOpen}</span> {t("open")}
          </span>
          <Link
            href="/dashboard/performance"
            className="no-print dash-press group inline-flex w-fit items-center gap-2 rounded-sm px-4 py-2 text-[13px] font-medium text-[#070707] transition-all duration-200 hover:-translate-y-px hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/60"
            style={{
              background: "linear-gradient(180deg, #ff6a26 0%, #fe5100 100%)",
              boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.28), 0 8px 18px -10px rgba(254,81,0,0.55)",
            }}
          >
            {t("See the detail")}
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </Link>
          <Link href="/dashboard/actions" className="no-print dash-press font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-orange">
            {t("Open action center")} →
          </Link>
        </div>
      </Row>

      {/* Footer */}
      <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-edge px-6 py-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer sm:px-9${animate ? " dash-rise" : ""}`} style={rise(8)}>
        <span>{t("Generated {date}", { date: generatedAt })}</span>
        <span>Urso · {t("Confidential")}</span>
        <span>{t("Page 1 of 1")}</span>
      </div>
    </article>
  );
}
