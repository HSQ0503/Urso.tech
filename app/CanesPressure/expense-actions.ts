"use server";

import { revalidatePath } from "next/cache";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { denyUnlessPermitted } from "@/lib/canes/access";
import { isDateKey, todayEtKey } from "@/lib/canes/recurring";

type Result = { ok: boolean; notice?: string };
async function guard(): Promise<Result | null> {
  if (!canesConfigured())
    return { ok: false, notice: "Demo mode: nothing was saved." };
  return denyUnlessPermitted();
}
const refresh = () => revalidatePath("/CanesPressure", "layout");

export async function recordEmployeePayment(input: {
  employeeId: string;
  amountCents: number;
  paidOn: string;
  method: string;
  note?: string;
  requestKey: string;
}): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > 2_147_483_647 ||
    !isDateKey(input.paidOn) ||
    input.paidOn > todayEtKey() ||
    !/^[\w-]{8,160}$/.test(input.requestKey) ||
    !["cash", "check", "bank", "card", "other"].includes(input.method)
  ) {
    return {
      ok: false,
      notice: "Choose an employee, valid payment date, amount, and method.",
    };
  }
  const db = canesDb();
  const { data: employee, error: readError } = await db
    .from("team_members")
    .select("id,name")
    .eq("id", input.employeeId)
    .eq("active", true)
    .in("role", ["worker", "ops_manager"])
    .maybeSingle();
  if (readError || !employee)
    return {
      ok: false,
      notice: "That employee is not available. Refresh the roster.",
    };
  const { error } = await db.from("business_expenses").insert({
    name: employee.name,
    category: "Labor",
    employee_id: employee.id,
    amount_cents: input.amountCents,
    incurred_on: input.paidOn,
    occurrence_on: input.paidOn,
    recurring: false,
    frequency: "one_time",
    payment_method: input.method,
    note: input.note?.trim() || null,
    request_key: input.requestKey,
  });
  if (error?.code === "23505") {
    const { data: existing } = await db
      .from("business_expenses")
      .select("employee_id,amount_cents,incurred_on,payment_method")
      .eq("request_key", input.requestKey)
      .maybeSingle();
    if (
      existing?.employee_id !== input.employeeId ||
      existing.amount_cents !== input.amountCents ||
      existing.incurred_on !== input.paidOn ||
      existing.payment_method !== input.method
    )
      return {
        ok: false,
        notice:
          "That payment request changed. Refresh before recording another payment.",
      };
  } else if (error)
    return {
      ok: false,
      notice: "The payment could not be recorded. Try again.",
    };
  refresh();
  return { ok: true, notice: "Employee payment recorded as a Labor expense." };
}

export async function addExpenseEmployee(name: string): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (typeof name !== "string" || !name.trim() || name.length > 120)
    return { ok: false, notice: "Enter the employee's name." };
  const { error } = await canesDb().from("team_members").insert({
    name: name.trim(),
    role: "worker",
    comp_type: "none",
    comp_bps: 0,
    hourly_cents: 0,
  });
  if (error) return { ok: false, notice: "The employee could not be added." };
  refresh();
  return { ok: true };
}

export async function updateExpenseRule(
  id: string,
  input: {
    active?: boolean;
    amountCents?: number;
    nextDueOn?: string;
    endsOn?: string | null;
  },
): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  const patch: Record<string, unknown> = {};
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean")
      return { ok: false, notice: "Choose pause or resume." };
    patch.active = input.active;
  }
  if (input.amountCents !== undefined) {
    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > 2_147_483_647
    )
      return { ok: false, notice: "Enter a valid expense amount." };
    patch.amount_cents = input.amountCents;
  }
  if (input.nextDueOn !== undefined) {
    if (!isDateKey(input.nextDueOn) || input.nextDueOn < todayEtKey())
      return { ok: false, notice: "Choose a valid next date." };
    patch.next_due_on = input.nextDueOn;
    patch.anchor_day = Number(input.nextDueOn.slice(-2));
  }
  if (input.endsOn !== undefined) {
    if (input.endsOn !== null && !isDateKey(input.endsOn))
      return { ok: false, notice: "Choose a valid end date." };
    patch.ends_on = input.endsOn;
  }
  if (!Object.keys(patch).length)
    return { ok: false, notice: "Choose a change to save." };
  const { data, error } = await canesDb().rpc("edit_canes_expense_rule", {
    p_id: id,
    p_patch: patch,
  });
  if (error || data !== "saved")
    return {
      ok: false,
      notice: "The recurring expense changed. Refresh and try again.",
    };
  refresh();
  return {
    ok: true,
    notice: "Future expenses updated. Earlier entries are unchanged.",
  };
}

export async function editExpenseOccurrence(
  id: string,
  input: { amountCents?: number; skipped?: boolean; note?: string },
): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  const patch: Record<string, unknown> = {};
  if (input.amountCents !== undefined) {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
      return { ok: false, notice: "Enter a valid amount." };
    patch.amount_cents = input.amountCents;
  }
  if (typeof input.skipped === "boolean") patch.skipped = input.skipped;
  if (typeof input.note === "string") patch.note = input.note.trim() || null;
  if (!Object.keys(patch).length)
    return { ok: false, notice: "Choose a change to save." };
  const { data, error } = await canesDb()
    .from("business_expenses")
    .update(patch)
    .eq("id", id)
    .eq("legacy_template", false)
    .is("employee_id", null)
    .select("id");
  if (error || !data?.length)
    return {
      ok: false,
      notice:
        "That expense could not be changed. Employee payment history requires a correction entry.",
    };
  refresh();
  return { ok: true, notice: "Only this expense entry was changed." };
}
