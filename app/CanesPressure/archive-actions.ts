"use server";
import { revalidatePath } from "next/cache";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import type { DocumentKind } from "@urso/types";

export async function listArchivedDocuments() {
  const denied = await denyUnlessPermitted();
  if (denied) return { ok: false as const, notice: denied.notice };
  if (!canesConfigured())
    return {
      ok: true as const,
      data: [] as {
        kind: DocumentKind;
        id: string;
        label: string;
        archivedAt: string;
      }[],
    };
  const data: {
    kind: DocumentKind;
    id: string;
    label: string;
    archivedAt: string;
  }[] = [];
  for (const [kind, table] of [
    ["estimate", "estimates"],
    ["job", "jobs"],
    ["invoice", "invoices"],
  ] as const) {
    const result = await canesDb()
      .from(table)
      .select(
        kind === "job"
          ? "id,job_name,customer_name,archived_at"
          : "id,number,customer_name,archived_at",
      )
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(500);
    if (result.error)
      return {
        ok: false as const,
        notice: "Archived history could not be loaded.",
      };
    for (const row of result.data as unknown as {
      id: string;
      number?: string;
      job_name?: string;
      customer_name: string | null;
      archived_at: string;
    }[])
      data.push({
        kind,
        id: row.id,
        label: `${row.number ?? row.job_name ?? "Work order"} · ${row.customer_name ?? "Customer"}`,
        archivedAt: row.archived_at,
      });
  }
  return {
    ok: true as const,
    data: data.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
  };
}

export async function restoreArchivedDocument(kind: DocumentKind, id: string) {
  const denied = await denyUnlessPermitted();
  if (denied) return denied;
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  const table =
    kind === "estimate"
      ? "estimates"
      : kind === "job"
        ? "jobs"
        : kind === "invoice"
          ? "invoices"
          : null;
  if (!table) return { ok: false, notice: "Choose a valid document." };
  const { data, error } = await canesDb()
    .from(table)
    .update({ archived_at: null })
    .eq("id", id)
    .not("archived_at", "is", null)
    .select("id");
  if (error || !data?.length)
    return { ok: false, notice: "The record changed. Refresh and try again." };
  revalidatePath("/CanesPressure", "layout");
  return {
    ok: true,
    notice:
      "Restored to the lists. Canceled visits and payment links remain canceled.",
  };
}
