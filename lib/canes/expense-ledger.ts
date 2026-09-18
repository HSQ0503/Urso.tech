import { canesDb } from "./supabase";
import { isDemo } from "./data";
import {
  type BusinessExpense,
  type ExpenseLedger,
  type ExpenseRule,
} from "@urso/types";

export async function getExpenseLedger(): Promise<ExpenseLedger> {
  if (isDemo()) return { entries: [], rules: [], employees: [] };
  const db = canesDb();
  const [expenses, rules, roster] = await Promise.all([
    db
      .from("business_expenses")
      .select("*")
      .eq("legacy_template", false)
      .eq("active", true)
      .order("incurred_on", { ascending: false })
      .limit(5000),
    db.from("expense_rules").select("*").order("name"),
    db.rpc("canes_employee_payment_totals"),
  ]);
  for (const result of [expenses, rules, roster])
    if (result.error) throw new Error("Expense history could not be loaded.");
  const entries = (expenses.data ?? []) as BusinessExpense[];
  return {
    entries,
    rules: (rules.data ?? []) as ExpenseRule[],
    employees: (
      (roster.data ?? []) as {
        id: string;
        name: string;
        month_cents: number;
        all_time_cents: number;
      }[]
    ).map((employee) => ({
      id: employee.id,
      name: employee.name,
      monthCents: Number(employee.month_cents),
      allTimeCents: Number(employee.all_time_cents),
    })),
  };
}
