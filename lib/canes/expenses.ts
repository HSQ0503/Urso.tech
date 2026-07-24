import { canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { DEMO_ESTIMATE_EXPENSES, DEMO_EXPENSES } from "@/lib/canes/fixtures";
import type { EstimateExpense, JobExpense } from "@/lib/canes/types";

// Reads + DB helpers for the per-job expense layer (0007_ops_feedback.sql).
// Mirrors lib/canes/invoices.ts: every read has an isDemo() fixtures fallback,
// list reads throw on hard error. The write helpers snapshot crew_id from the
// job so per-crew margin survives a later crew reassignment; the page-facing
// server actions in app/CanesPressure/actions.ts self-guard on canesConfigured().

export async function listJobExpenses(jobId: string): Promise<JobExpense[]> {
  if (isDemo()) {
    return DEMO_EXPENSES.filter((e) => e.job_id === jobId).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  }
  const { data, error } = await canesDb()
    .from("job_expenses")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`listJobExpenses: ${error.message}`);
  return (data ?? []) as JobExpense[];
}

export async function sumJobExpensesCents(jobId: string): Promise<number> {
  const rows = await listJobExpenses(jobId);
  return rows.reduce((sum, e) => sum + e.amount_cents, 0);
}

// All job expenses logged in [startIso, endIso) — for the Expenses tab period
// roll-up and the payouts P&L. Cash-basis: an expense counts in the period it
// was recorded (created_at).
export async function listJobExpensesInRange(startIso: string, endIso: string): Promise<JobExpense[]> {
  if (isDemo()) {
    return DEMO_EXPENSES.filter((e) => e.created_at >= startIso && e.created_at < endIso);
  }
  const { data, error } = await canesDb()
    .from("job_expenses")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`listJobExpensesInRange: ${error.message}`);
  return (data ?? []) as JobExpense[];
}

// Insert a job expense, snapshotting the job's current crew_id so per-crew
// margin is stable even if the job is re-crewed afterward. Returns the new id.
export async function addJobExpenseRow(input: {
  jobId: string;
  amountCents: number;
  category: string;
  note?: string | null;
}): Promise<string | null> {
  const db = canesDb();
  const { data: job } = await db
    .from("jobs")
    .select("crew_id")
    .eq("id", input.jobId)
    .maybeSingle();
  const { data, error } = await db
    .from("job_expenses")
    .insert({
      job_id: input.jobId,
      amount_cents: input.amountCents,
      category: input.category,
      note: input.note ?? null,
      crew_id: (job?.crew_id as string | null) ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`[canes] addJobExpenseRow failed for ${input.jobId}: ${error.message}`);
    return null;
  }
  return data.id as string;
}

export async function deleteJobExpenseRow(id: string): Promise<boolean> {
  const { error } = await canesDb().from("job_expenses").delete().eq("id", id);
  if (error) {
    console.error(`[canes] deleteJobExpenseRow failed for ${id}: ${error.message}`);
    return false;
  }
  return true;
}

// ── Estimate expenses (0014) — the quote-time cost model ─────────────────────
// Reads DEGRADE to [] instead of throwing: a deploy that outruns the 0014
// migration must render the estimate page without its costs panel, not 500.

export async function listEstimateExpenses(estimateId: string): Promise<EstimateExpense[]> {
  if (isDemo()) {
    return DEMO_ESTIMATE_EXPENSES.filter((e) => e.estimate_id === estimateId).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  }
  const { data, error } = await canesDb()
    .from("estimate_expenses")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error(`[canes] listEstimateExpenses: ${error.message}`);
    return [];
  }
  return (data ?? []) as EstimateExpense[];
}

export async function addEstimateExpenseRow(input: {
  estimateId: string;
  amountCents: number;
  category: string;
  note?: string | null;
}): Promise<string | null> {
  const { data, error } = await canesDb()
    .from("estimate_expenses")
    .insert({
      estimate_id: input.estimateId,
      amount_cents: input.amountCents,
      category: input.category,
      note: input.note ?? null,
      created_by: "owner",
    })
    .select("id")
    .single();
  if (error) {
    console.error(`[canes] addEstimateExpenseRow failed for ${input.estimateId}: ${error.message}`);
    return null;
  }
  return data.id as string;
}

export async function deleteEstimateExpenseRow(id: string): Promise<boolean> {
  const { error } = await canesDb().from("estimate_expenses").delete().eq("id", id);
  if (error) {
    console.error(`[canes] deleteEstimateExpenseRow failed for ${id}: ${error.message}`);
    return false;
  }
  return true;
}
