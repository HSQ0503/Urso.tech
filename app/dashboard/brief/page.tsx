import {
  parseScope,
  scopeLabel,
} from "@/components/dashboard/data";
import { getWeeklyBrief } from "@/components/dashboard/data.server";
import { BriefReport } from "@/components/dashboard/brief-report";
import { getI18n } from "@/lib/i18n.server";
import { intlLocale } from "@/lib/i18n";

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const period = "This week";
  const { locale, t } = await getI18n();
  const b = await getWeeklyBrief(scope);
  const generatedAt = new Date().toLocaleDateString(intlLocale(locale), { month: "long", day: "numeric", year: "numeric" });
  const printHref = sp.store ? `/brief-print?store=${encodeURIComponent(sp.store)}` : "/brief-print";

  return (
    <div className="animate-stage-in space-y-3">
      <div className="flex items-center justify-end">
        <a
          href={printHref}
          target="_blank"
          rel="noopener noreferrer"
          className="dash-pill inline-flex items-center gap-2 rounded-lg px-3.5 py-2 font-mono text-2xs uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 2v8m0 0 3-3m-3 3L5 7M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("Download PDF")}
        </a>
      </div>
      <BriefReport b={b} scopeText={scopeLabel(scope)} period={period} generatedAt={generatedAt} t={t} />
    </div>
  );
}
