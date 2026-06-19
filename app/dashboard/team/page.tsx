import { parseScope, parseMonth, scopeLabel, monthLabel } from "@/components/dashboard/data";
import { getTeamRoster } from "@/components/dashboard/data.server";
import { TeamClient } from "@/components/dashboard/team-client";
import { getI18n } from "@/lib/i18n.server";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? t("Last 12 months") : monthLabel(month);
  const roster = await getTeamRoster(scope, month);

  return <TeamClient roster={roster} scopeName={scopeLabel(scope)} period={period} />;
}
