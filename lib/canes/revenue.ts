import { canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { getRecurringInsights } from "@/lib/canes/growth";
import { rangeBounds } from "@/lib/canes/payouts";
import { DEMO_PAYMENTS } from "@/lib/canes/fixtures";
import type { PayoutRangeKey, RevenueMonth, RevenueSummary, RevenueWindow } from "@/lib/canes/types";

// The Dashboard's money, in Sebastian's own words (2026-09-13): "revenue made
// on the day, the week, the month and the year — that's all", plus recurring
// revenue per month and the year's ARR.
//
// Revenue here is COLLECTED — the payments ledger minus refunds — never
// invoiced or won. It is the number he can spend, and it cannot be moved by
// sending an invoice nobody pays. The four windows are the ET calendar
// periods Payouts already uses (rangeBounds), so "this week" is one instant
// pair everywhere. Money in integer cents.

export type { RevenueMonth, RevenueSummary, RevenueWindow };

type LedgerRow = { amount_cents: number; created_at: string };

async function paymentsSince(sinceIso: string): Promise<LedgerRow[]> {
  if (isDemo()) return DEMO_PAYMENTS.filter((p) => p.created_at >= sinceIso);
  const { data, error } = await canesDb()
    .from("payments")
    .select("amount_cents, created_at")
    .gte("created_at", sinceIso)
    .limit(5000);
  if (error) throw new Error(`revenue payments: ${error.message}`);
  return (data ?? []) as LedgerRow[];
}

async function refundsSince(sinceIso: string): Promise<LedgerRow[]> {
  if (isDemo()) return [];
  const { data, error } = await canesDb()
    .from("payment_refunds")
    .select("amount_cents, created_at")
    .gte("created_at", sinceIso)
    .limit(5000);
  if (error) throw new Error(`revenue refunds: ${error.message}`);
  return (data ?? []) as LedgerRow[];
}

const WINDOWS: PayoutRangeKey[] = ["day", "week", "month", "year"];

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const bounds = WINDOWS.map((key) => ({ key, ...rangeBounds(key) }));
  // Every window sits inside the calendar year, so one ledger read from Jan 1
  // ET serves all four.
  const earliest = bounds.reduce((min, b) => (b.startIso < min ? b.startIso : min), bounds[0].startIso);

  const [payments, refunds, recurring] = await Promise.all([
    paymentsSince(earliest),
    refundsSince(earliest),
    getRecurringInsights(),
  ]);

  const sumIn = (rows: LedgerRow[], startIso: string, endIso: string) => {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    return rows.reduce((sum, row) => {
      const t = Date.parse(row.created_at);
      return t >= start && t < end ? sum + row.amount_cents : sum;
    }, 0);
  };

  const windows: RevenueWindow[] = bounds.map((b) => ({
    key: b.key,
    label: b.key === "day" ? "Today" : b.key === "week" ? "This week" : b.key === "month" ? "This month" : "This year",
    collectedCents: sumIn(payments, b.startIso, b.endIso) - sumIn(refunds, b.startIso, b.endIso),
  }));

  return {
    windows,
    recurring: {
      mrrCents: recurring.mrrCents,
      arrCents: recurring.mrrCents * 12,
      activePlans: recurring.rows.length,
      months: recurring.months.map((m) => ({ key: m.key, label: m.label, recurringCents: m.cents })),
    },
  };
}
