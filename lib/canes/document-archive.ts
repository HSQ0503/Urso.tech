import { getAdminSession } from "@/lib/urso-auth";
import { canesDb } from "./supabase";
import { getJob } from "./estimates";
import { getInvoice, getInvoiceByJob } from "./invoices";
import { setJobStatus, voidInvoice } from "@/app/CanesPressure/actions";

export async function archiveDocument(
  kind: "estimate" | "job" | "invoice",
  id: string,
): Promise<{ ok: boolean; notice?: string }> {
  const db = canesDb();
  if (kind === "job") {
    const job = await getJob(id);
    if (!job) return { ok: false, notice: "Work order not found." };
    if (!["completed", "invoiced", "paid", "canceled"].includes(job.status)) {
      const result = await setJobStatus(
        id,
        "canceled",
        "Removed from active work orders",
      );
      if (!result.ok) return result;
    }
  }
  if (kind === "job") {
    const bill = await getInvoiceByJob(id);
    if (bill && !["paid", "void"].includes(bill.status)) {
      const result = await voidInvoice(bill.id);
      if (!result.ok) return result;
    }
  }
  if (kind === "invoice") {
    const invoice = await getInvoice(id);
    if (!invoice) return { ok: false, notice: "Invoice not found." };
    if (!["paid", "void"].includes(invoice.status)) {
      const result = await voidInvoice(id);
      if (!result.ok) return result;
    }
  }
  if (kind === "estimate") {
    const { data: jobs, error } = await db
      .from("jobs")
      .select("id,status")
      .eq("estimate_id", id)
      .is("archived_at", null);
    if (error)
      return {
        ok: false,
        notice: "Linked work could not be checked. Nothing was archived.",
      };
    for (const job of jobs ?? []) {
      if (["completed", "invoiced", "paid", "canceled"].includes(job.status))
        continue;
      const result = await setJobStatus(
        job.id,
        "canceled",
        "Estimate removed from active work",
      );
      if (!result.ok) return result;
    }
    const bills = await db
      .from("invoices")
      .select("id")
      .eq("estimate_id", id)
      .not("status", "in", "(paid,void)");
    if (bills.error)
      return {
        ok: false,
        notice: "Linked invoices could not be checked. Nothing was archived.",
      };
    for (const bill of bills.data ?? []) {
      const result = await voidInvoice(bill.id);
      if (!result.ok) return result;
    }
    const tasks = await db
      .from("tasks")
      .update({ status: "canceled" })
      .eq("status", "pending")
      .in("kind", ["estimate_send", "estimate_reminder"])
      .contains("payload", { estimate_id: id });
    if (tasks.error)
      return {
        ok: false,
        notice:
          "Open work was checked, but reminders could not be canceled. Refresh before retrying.",
      };
  }
  const table =
    kind === "estimate" ? "estimates" : kind === "job" ? "jobs" : "invoices";
  const { data, error } = await db
    .from(table)
    .update({
      archived_at: new Date().toISOString(),
      archived_by: (await getAdminSession())?.email ?? "owner",
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length)
    return {
      ok: false,
      notice: "The record could not be archived. Refresh and try again.",
    };
  return {
    ok: true,
    notice:
      "Removed from active lists. Document and payment history have been preserved.",
  };
}
