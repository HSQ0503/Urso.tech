import { redirect } from "next/navigation";
import { getSession, resolveScope } from "@/lib/auth";
import { getWeeklyBrief } from "@/components/dashboard/data.server";
import { AnalystConsole } from "@/components/dashboard/analyst-console";

// The AI actions page is now the owner's general strategy console — an open-ended
// urso.ai analyst (stronger model + full tool belt) that replaces the static
// pipeline/agent sections. The action pipeline still exists and the analyst can
// surface it via its list_actions tool.
export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const scope = resolveScope(user, sp.store);

  // Best-effort opening context: this week's headline. Never blocks the page.
  let briefHeadline: string | null = null;
  try {
    briefHeadline = (await getWeeklyBrief(scope)).headline;
  } catch {
    briefHeadline = null;
  }

  return <AnalystConsole userName={user.name} briefHeadline={briefHeadline} />;
}
