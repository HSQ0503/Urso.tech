import { canesConfigured, canesDb } from "@/lib/canes/supabase";

export async function canesAutomationsEnabled(scope?: "estimate"): Promise<boolean> {
  if (!canesConfigured()) return false;
  if (scope === "estimate" && !(await canesAutomationsEnabled())) return false;
  try {
    const { data, error } = await canesDb()
      .from("settings")
      .select("value")
      .eq("key", scope === "estimate" ? "estimate_automations_enabled" : "automations_enabled")
      .maybeSingle();
    // A missing setting or failed read must not restart customer messages.
    return !error && data?.value === true;
  } catch {
    return false;
  }
}
