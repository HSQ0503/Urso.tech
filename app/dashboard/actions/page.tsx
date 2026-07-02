import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getSession, resolveScope } from "@/lib/auth";
import { getAllAgentActions, getWeeklyBrief } from "@/components/dashboard/data.server";
import { ActionsClient } from "@/components/dashboard/actions-client";
import { AnalystConsole } from "@/components/dashboard/analyst-console";
import { PageHeader, Micro } from "@/components/dashboard/ui";
import { getI18n } from "@/lib/i18n.server";

// The AI actions page leads with the general urso.ai analyst console (the primary
// surface), then the AI suggested-actions pipeline (approve / dismiss) below it.
export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const scope = resolveScope(user, sp.store);
  const { t } = await getI18n();

  const actions = await getAllAgentActions();

  // Best-effort opening context for the console: this week's headline.
  let briefHeadline: string | null = null;
  try {
    briefHeadline = (await getWeeklyBrief(scope)).headline;
  } catch {
    briefHeadline = null;
  }

  return (
    <div className="space-y-12">
      {/* Hero — the general analyst console */}
      <div>
        <div className="dash-rise" style={{ "--i": 0 } as CSSProperties}>
          <PageHeader
            eyebrow={`urso.ai · ${t("analyst")}`}
            title={t("Your data analyst, on demand.")}
          />
        </div>
        <div className="dash-rise" style={{ "--i": 1 } as CSSProperties}>
          <AnalystConsole userName={user.name} briefHeadline={briefHeadline} />
        </div>
      </div>

      {/* AI suggested actions — the pipeline, agent toggles, approve/dismiss cards */}
      <section className="border-t border-edge pt-10">
        <div className="dash-rise mb-6" style={{ "--i": 2 } as CSSProperties}>
          <Micro>{t("AI suggested actions")}</Micro>
          <h2 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ink">{t("What the agents recommend")}</h2>
          <p className="mt-1.5 max-w-[560px] text-[13.5px] leading-[1.55] text-ink-dim">
            {t("Each finding becomes a concrete action — you approve or dismiss; nothing runs without you.")}
          </p>
        </div>
        <ActionsClient initialActions={actions} showHeader={false} />
      </section>
    </div>
  );
}
