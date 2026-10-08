import { canesConfigured, canesDb } from "@/lib/canes/supabase";

export async function canesAutomationsEnabled(scope?: "estimate" | "meta_intro"): Promise<boolean> {
  if (!canesConfigured()) return false;
  if (scope && !(await canesAutomationsEnabled())) return false;
  try {
    const { data, error } = await canesDb()
      .from("settings")
      .select("value")
      .eq("key", scope === "meta_intro" ? "meta_intro_enabled" : scope === "estimate" ? "estimate_automations_enabled" : "automations_enabled")
      .maybeSingle();
    // A missing setting or failed read must not restart customer messages.
    return !error && data?.value === true;
  } catch {
    return false;
  }
}
