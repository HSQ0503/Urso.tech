import { canesConfigured, canesDb } from "@/lib/canes/supabase";

export async function canesAutomationsEnabled(): Promise<boolean> {
  if (!canesConfigured()) return false;
  try {
    const { data, error } = await canesDb()
      .from("settings")
      .select("value")
      .eq("key", "automations_enabled")
      .maybeSingle();
    // A missing setting or failed read must not restart customer messages.
    return !error && data?.value === true;
  } catch {
    return false;
  }
}
