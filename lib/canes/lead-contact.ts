import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { toE164 } from "@/lib/canes/types";

export async function recordManualLeadContact(phone: string): Promise<void> {
  const normalized = toE164(phone);
  if (!normalized || !canesConfigured()) return;
  // The provider already accepted the message/call; never encourage a duplicate send.
  try {
    const { error } = await canesDb().rpc("record_manual_lead_contact", { p_phone: normalized });
    if (error) console.error("[canes] manual contact could not be recorded:", error.message);
  } catch (error) {
    console.error("[canes] manual contact could not be recorded:", error);
  }
}
