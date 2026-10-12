"use server";
import { revalidatePath } from "next/cache";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { getAdminSession } from "@/lib/urso-auth";
import { parseLedgerCsv } from "@/lib/canes/ledger-import";

export async function stageLedgerImport(source: string, csv: string) {
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  try {
    if (typeof source !== "string" || typeof csv !== "string")
      throw new Error("Choose a source name and CSV file.");
    const rows = parseLedgerCsv(csv);
    const { data, error } = await canesDb().rpc("stage_canes_import", {
      p_source: source.trim(),
      p_rows: rows,
      p_actor: (await getAdminSession())!.email,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/CanesPressure/money/import");
    return {
      ok: true,
      batchId: data as string,
      notice: "Preview saved. Review each row before importing.",
    };
  } catch (error) {
    return {
      ok: false,
      notice:
        error instanceof Error
          ? error.message
          : "The preview could not be saved.",
    };
  }
}
export async function applyLedgerImport(batchId: string, rowIds: string[]) {
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  if (!Array.isArray(rowIds) || !rowIds.length || rowIds.length > 500)
    return { ok: false, notice: "Select reviewed rows." };
  const { data, error } = await canesDb().rpc("apply_canes_import", {
    p_batch: batchId,
    p_rows: rowIds,
    p_actor: (await getAdminSession())!.email,
  });
  if (error) return { ok: false, notice: error.message };
  revalidatePath("/CanesPressure", "layout");
  return {
    ok: true,
    notice: `Imported ${data} rows. Repeat submissions do not duplicate records.`,
  };
}
