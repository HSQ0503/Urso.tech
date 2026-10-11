"use server";

import { revalidatePath } from "next/cache";
import { isServiceArea, type ServiceArea } from "@urso/types";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";

export async function setDocumentServiceArea(
  kind: "estimate" | "job" | "invoice" | "plan",
  id: string,
  area: ServiceArea | null,
): Promise<{ ok: boolean; notice?: string }> {
  const resources = {
    estimate: { table: "estimates", permission: "estimates" },
    job: { table: "jobs", permission: "schedule" },
    invoice: { table: "invoices", permission: "invoices" },
    plan: { table: "recurring_plans", permission: "estimates" },
  } as const;
  if (!Object.hasOwn(resources, kind)) return { ok: false, notice: "Unknown document." };
  const resource = resources[kind];
  const denied = await denyUnlessPermitted(resource.permission);
  if (denied) return denied;
  if (kind === "plan") {
    const scheduleDenied = await denyUnlessPermitted("schedule");
    if (scheduleDenied) return scheduleDenied;
  }
  if (area !== null && !isServiceArea(area)) return { ok: false, notice: "Choose a valid service area." };
  if (!canesConfigured()) return { ok: false, notice: "Demo data is read-only." };
  const { data, error } = await canesDb().from(resource.table)
    .update({ service_area: area, service_area_selected: true }).eq("id", id).select("id").maybeSingle();
  if (error) {
    console.error("[canes] service area update failed:", error.message);
    return { ok: false, notice: "The area could not be saved. Try again." };
  }
  if (!data) return { ok: false, notice: "Document not found." };
  revalidatePath("/CanesPressure", "layout");
  return { ok: true };
}
