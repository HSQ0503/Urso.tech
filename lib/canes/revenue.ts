import { readAll } from "./read-all";import { canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { listPlans, mrrCentsOf, recurringCollectedByMonth } from "@/lib/canes/recurring";
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
  return readAll<LedgerRow>((from, to) =>
    canesDb()
      .from("payments")
      .select("amount_cents, created_at")
      .gte("created_at", sinceIso)
      .order("id")
      .range(from, to),
  );
}

async function refundsSince(sinceIso: string): Promise<LedgerRow[]> {
  if (isDemo()) return [];
  return readAll<LedgerRow>((from, to) =>
    canesDb()
      .from("payment_refunds")
      .select("amount_cents, created_at")
      .gte("created_at", sinceIso)
      .order("id")
      .range(from, to),
  );
}

const WINDOWS: PayoutRangeKey[] = ["day", "week", "month", "year"];

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const bounds = WINDOWS.map((key) => ({ key, ...rangeBounds(key) }));
  // Every window sits inside the calendar year, so one ledger read from Jan 1
  // ET serves all four.
  const earliest = bounds.reduce(
    (min, b) => (b.startIso < min ? b.startIso : min),
    bounds[0].startIso,
  );

  // Recurring is read off PLANS (0027): MRR is the sum of active plans'
  // per-visit price normalized to a month; the monthly bars are money actually
  // collected on plan visits. The old jobs.recurrence flag no longer counts.
  const [payments, refunds, plans, months, services] = await Promise.all([
    paymentsSince(earliest),
    refundsSince(earliest),
    listPlans(),
    recurringCollectedByMonth(),
    isDemo()
      ? Promise.resolve({
          data: { mrr_cents: 0, active_agreements: 0 },
          error: null,
        })
      : canesDb().rpc("canes_service_revenue_snapshot"),
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
    label:
      b.key === "day"
        ? "Today"
        : b.key === "week"
          ? "This week"
          : b.key === "month"
            ? "This month"
            : "This year",
    collectedCents:
      sumIn(payments, b.startIso, b.endIso) -
      sumIn(refunds, b.startIso, b.endIso),
  }));

  if (services.error) throw new Error("Recurring revenue could not be loaded.");
  const mrrCents = mrrCentsOf(plans) + Number(services.data?.mrr_cents ?? 0);
  return {
    windows,
    recurring: {
      mrrCents,
      arrCents: mrrCents * 12,
      activePlans:
        plans.filter((p) => p.status === "active").length +
        Number(services.data?.active_agreements ?? 0),
      months: months.map((m) => ({
        key: m.key,
        label: m.label,
        recurringCents: m.cents,
      })),
    },
  };
}
