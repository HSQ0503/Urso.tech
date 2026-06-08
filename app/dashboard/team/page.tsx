import { parseScope, parseMonth, scopeLabel, monthLabel } from "@/components/dashboard/data";
import { getGroomers } from "@/components/dashboard/data.server";
import { TeamClient } from "@/components/dashboard/team-client";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const sp = await searchParams;
  const scope = parseScope(sp.store);
  const month = parseMonth(sp.month);
  const period = month === "all" ? "Last 12 months" : monthLabel(month);
  const roster = await getGroomers(scope);

  return <TeamClient roster={roster} scopeName={scopeLabel(scope)} period={period} />;
}
