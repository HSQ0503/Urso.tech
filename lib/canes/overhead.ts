import { canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { DEMO_BUSINESS_EXPENSES } from "@/lib/canes/fixtures";
import type { BusinessExpense, ExpenseFrequency } from "@/lib/canes/types";

// Business / overhead expenses (0008_growth.sql) — costs NOT tied to a job
// (subscriptions, insurance, truck, marketing). Reads mirror lib/canes/expenses.ts:
// an isDemo() fixtures fallback, list throws on hard error. The period math turns
// a recurring row into the cost attributable to an arbitrary [start,end) window
// by PRO-RATING over days, so the same row reads correctly whether the caller
// asks for a day, week, month, or year (a $99/mo sub is ~$99 for a month, ~$1,188
// for a year, ~$3.25 for a day). One-time rows count once, on incurred_on.

const MS_DAY = 86_400_000;
const AVG_MONTH_DAYS = 30.437; // 365.25 / 12
const YEAR_DAYS = 365.25;

export async function listBusinessExpenses(): Promise<BusinessExpense[]> {
  if (isDemo()) {
    return [...DEMO_BUSINESS_EXPENSES]
      .filter((e) => e.active)
      .sort((a, b) => b.incurred_on.localeCompare(a.incurred_on));
  }
  const { data, error } = await canesDb()
    .from("business_expenses")
    .select("*")
    .eq("active", true)
    .order("incurred_on", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listBusinessExpenses: ${error.message}`);
  return (data ?? []) as BusinessExpense[];
}

// Whole-day overlap between [start,end) and the expense's active window
// [incurred_on, ends_on || +inf).
function overlapDays(exp: BusinessExpense, startMs: number, endMs: number): number {
  const activeStart = Date.parse(`${exp.incurred_on}T00:00:00Z`);
  const activeEnd = exp.ends_on ? Date.parse(`${exp.ends_on}T23:59:59Z`) : Number.POSITIVE_INFINITY;
  const lo = Math.max(startMs, activeStart);
  const hi = Math.min(endMs, activeEnd);
  return hi <= lo ? 0 : (hi - lo) / MS_DAY;
}

// The cost a single expense contributes to [startMs,endMs).
export function expenseCentsForRange(exp: BusinessExpense, startMs: number, endMs: number): number {
  if (!exp.active) return 0;
  if (!exp.recurring || exp.frequency === "one_time") {
    const on = Date.parse(`${exp.incurred_on}T12:00:00Z`);
    return on >= startMs && on < endMs ? exp.amount_cents : 0;
  }
  const days = overlapDays(exp, startMs, endMs);
  if (days <= 0) return 0;
  const per = exp.frequency === "yearly" ? YEAR_DAYS : AVG_MONTH_DAYS;
  return Math.round(exp.amount_cents * (days / per));
}

// Total overhead attributable to [startIso,endIso).
export async function overheadCentsForRange(startIso: string, endIso: string): Promise<number> {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const rows = await listBusinessExpenses();
  return rows.reduce((sum, e) => sum + expenseCentsForRange(e, startMs, endMs), 0);
}

// Normalize a recurring row to a monthly-equivalent cost (for the "monthly
// subscriptions" total on the Expenses tab). One-time rows return 0.
export function monthlyEquivalentCents(exp: BusinessExpense): number {
  if (!exp.active || !exp.recurring) return 0;
  if (exp.frequency === "monthly") return exp.amount_cents;
  if (exp.frequency === "yearly") return Math.round(exp.amount_cents / 12);
  return 0;
}

// ── DB write helpers — the page-facing server actions self-guard on canesConfigured().

export async function addBusinessExpenseRow(input: {
  name: string;
  amountCents: number;
  category: string;
  recurring: boolean;
  frequency: ExpenseFrequency;
  incurredOn: string;
  endsOn?: string | null;
  note?: string | null;
}): Promise<string | null> {
  const { data, error } = await canesDb()
    .from("business_expenses")
    .insert({
      name: input.name,
      amount_cents: input.amountCents,
      category: input.category,
      recurring: input.recurring,
      frequency: input.frequency,
      incurred_on: input.incurredOn,
      ends_on: input.endsOn ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`[canes] addBusinessExpenseRow: ${error.message}`);
    return null;
  }
  return data.id as string;
}

export async function deleteBusinessExpenseRow(id: string): Promise<boolean> {
  const { error } = await canesDb().from("business_expenses").delete().eq("id", id);
  if (error) {
    console.error(`[canes] deleteBusinessExpenseRow: ${error.message}`);
    return false;
  }
  return true;
}
