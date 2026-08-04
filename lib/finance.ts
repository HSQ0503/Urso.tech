import "server-only";

import { getAdminSession } from "@/lib/urso-auth";
import { ursoDbSafe } from "@/lib/brain/supabase";

export type FinanceDealStatus = "active" | "complete" | "canceled";
export type FinanceEntryType =
  | "income"
  | "expense"
  | "founder_draw"
  | "founder_contribution"
  | "refund";
export type FinanceFounder = "han" | "guga";

type FinanceDealRow = {
  id: string;
  client_name: string;
  deal_name: string;
  contracted_cents: number;
  planned_han_draw_cents: number;
  planned_guga_draw_cents: number;
  signed_on: string | null;
  status: FinanceDealStatus;
  notes: string;
  created_at: string;
};

type FinanceEntryRow = {
  id: string;
  deal_id: string | null;
  entry_type: FinanceEntryType;
  amount_cents: number;
  occurred_on: string;
  category: string;
  counterparty: string;
  founder: FinanceFounder | null;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type FinanceDeal = {
  id: string;
  clientName: string;
  dealName: string;
  contractedCents: number;
  collectedCents: number;
  outstandingCents: number;
  plannedHanDrawCents: number;
  plannedGugaDrawCents: number;
  retainedTargetCents: number;
  businessSpentCents: number;
  companyAllocationCents: number;
  signedOn: string | null;
  status: FinanceDealStatus;
  notes: string;
};

export type FinanceEntry = {
  id: string;
  dealId: string | null;
  dealName: string | null;
  entryType: FinanceEntryType;
  amountCents: number;
  cashEffectCents: number;
  occurredOn: string;
  category: string;
  counterparty: string;
  founder: FinanceFounder | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type FinanceMonth = {
  key: string;
  label: string;
  incomeCents: number;
  outflowCents: number;
  netCents: number;
  endingCashCents: number;
};

export type FinanceSnapshot = {
  configured: boolean;
  deals: FinanceDeal[];
  entries: FinanceEntry[];
  months: FinanceMonth[];
  totals: {
    contractedCents: number;
    retainedTargetCents: number;
    plannedFounderDrawsCents: number;
    collectedCents: number;
    outstandingCents: number;
    revenueReceivedCents: number;
    founderContributionsCents: number;
    founderDrawsCents: number;
    expensesCents: number;
    companyAllocationCents: number;
    refundsCents: number;
    availableCashCents: number;
  };
};

export async function getFinanceAdmin() {
  const session = await getAdminSession();
  return session?.scope === "admin" ? session : null;
}

function cashEffect(entry: Pick<FinanceEntryRow, "entry_type" | "amount_cents">) {
  return entry.entry_type === "income" || entry.entry_type === "founder_contribution"
    ? entry.amount_cents
    : -entry.amount_cents;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function cashMonths(entries: FinanceEntryRow[]): FinanceMonth[] {
  const now = new Date();
  const firstEntry = entries.at(-1)?.occurred_on;
  const firstDate = firstEntry ? new Date(`${firstEntry}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const startCandidate = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1));
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const start = startCandidate < sixMonthsAgo ? startCandidate : sixMonthsAgo;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const byMonth = new Map<string, { incomeCents: number; outflowCents: number }>();

  for (const entry of entries) {
    const bucket = byMonth.get(entry.occurred_on.slice(0, 7)) ?? { incomeCents: 0, outflowCents: 0 };
    const effect = cashEffect(entry);
    if (effect >= 0) bucket.incomeCents += effect;
    else bucket.outflowCents += Math.abs(effect);
    byMonth.set(entry.occurred_on.slice(0, 7), bucket);
  }

  const months: FinanceMonth[] = [];
  let endingCashCents = 0;
  for (let cursor = start; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    const key = monthKey(cursor);
    const bucket = byMonth.get(key) ?? { incomeCents: 0, outflowCents: 0 };
    const netCents = bucket.incomeCents - bucket.outflowCents;
    endingCashCents += netCents;
    months.push({ key, label: monthLabel(key), ...bucket, netCents, endingCashCents });
  }
  return months;
}

const emptySnapshot: FinanceSnapshot = {
  configured: false,
  deals: [],
  entries: [],
  months: [],
  totals: {
    contractedCents: 0,
    retainedTargetCents: 0,
    plannedFounderDrawsCents: 0,
    collectedCents: 0,
    outstandingCents: 0,
    revenueReceivedCents: 0,
    founderContributionsCents: 0,
    founderDrawsCents: 0,
    expensesCents: 0,
    companyAllocationCents: 0,
    refundsCents: 0,
    availableCashCents: 0,
  },
};

export async function getFinanceSnapshot(): Promise<FinanceSnapshot> {
  const admin = ursoDbSafe();
  if (!admin) return emptySnapshot;

  const [dealResult, entryResult] = await Promise.all([
    admin
      .from("urso_finance_deals")
      .select("id,client_name,deal_name,contracted_cents,planned_han_draw_cents,planned_guga_draw_cents,signed_on,status,notes,created_at")
      .order("created_at", { ascending: true }),
    admin
      .from("urso_finance_entries")
      .select("id,deal_id,entry_type,amount_cents,occurred_on,category,counterparty,founder,notes,created_by,created_at,updated_at,updated_by")
      .is("voided_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  // Missing tables means the migration has not run yet. Other read failures
  // remain visible in server logs while the page presents one setup state.
  if (dealResult.error || entryResult.error) {
    console.error(
      "[finance] read failed:",
      dealResult.error?.message ?? entryResult.error?.message ?? "unknown error",
    );
    return emptySnapshot;
  }

  const dealRows = (dealResult.data ?? []) as FinanceDealRow[];
  const entryRows = (entryResult.data ?? []) as FinanceEntryRow[];
  const collectedByDeal = new Map<string, number>();
  const expensesByDeal = new Map<string, number>();
  for (const entry of entryRows) {
    if (!entry.deal_id) continue;
    const revenueEffect = entry.entry_type === "income"
      ? entry.amount_cents
      : entry.entry_type === "refund"
        ? -entry.amount_cents
        : 0;
    collectedByDeal.set(entry.deal_id, (collectedByDeal.get(entry.deal_id) ?? 0) + revenueEffect);
    if (entry.entry_type === "expense") {
      expensesByDeal.set(entry.deal_id, (expensesByDeal.get(entry.deal_id) ?? 0) + entry.amount_cents);
    }
  }

  const deals = dealRows.map<FinanceDeal>((deal) => {
    const collectedCents = collectedByDeal.get(deal.id) ?? 0;
    const retainedTargetCents = deal.contracted_cents - deal.planned_han_draw_cents - deal.planned_guga_draw_cents;
    const businessSpentCents = expensesByDeal.get(deal.id) ?? 0;
    return {
      id: deal.id,
      clientName: deal.client_name,
      dealName: deal.deal_name,
      contractedCents: deal.contracted_cents,
      collectedCents,
      outstandingCents: Math.max(0, deal.contracted_cents - collectedCents),
      plannedHanDrawCents: deal.planned_han_draw_cents,
      plannedGugaDrawCents: deal.planned_guga_draw_cents,
      retainedTargetCents,
      businessSpentCents,
      companyAllocationCents: Math.max(0, retainedTargetCents - businessSpentCents),
      signedOn: deal.signed_on,
      status: deal.status,
      notes: deal.notes,
    };
  });
  const dealNames = new Map(deals.map((deal) => [deal.id, deal.clientName]));
  const entries = entryRows.map<FinanceEntry>((entry) => ({
    id: entry.id,
    dealId: entry.deal_id,
    dealName: entry.deal_id ? dealNames.get(entry.deal_id) ?? null : null,
    entryType: entry.entry_type,
    amountCents: entry.amount_cents,
    cashEffectCents: cashEffect(entry),
    occurredOn: entry.occurred_on,
    category: entry.category,
    counterparty: entry.counterparty,
    founder: entry.founder,
    notes: entry.notes,
    createdBy: entry.created_by,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    updatedBy: entry.updated_by,
  }));

  const sum = (type: FinanceEntryType) =>
    entryRows.filter((entry) => entry.entry_type === type).reduce((total, entry) => total + entry.amount_cents, 0);
  const contractedCents = deals
    .filter((deal) => deal.status !== "canceled")
    .reduce((total, deal) => total + deal.contractedCents, 0);
  const retainedTargetCents = deals
    .filter((deal) => deal.status !== "canceled")
    .reduce((total, deal) => total + deal.retainedTargetCents, 0);
  const plannedFounderDrawsCents = deals
    .filter((deal) => deal.status !== "canceled")
    .reduce((total, deal) => total + deal.plannedHanDrawCents + deal.plannedGugaDrawCents, 0);
  const revenueReceivedCents = sum("income");
  const founderContributionsCents = sum("founder_contribution");
  const founderDrawsCents = sum("founder_draw");
  const expensesCents = sum("expense");
  const refundsCents = sum("refund");
  const collectedCents = revenueReceivedCents - refundsCents;
  const availableCashCents = revenueReceivedCents + founderContributionsCents - founderDrawsCents - expensesCents - refundsCents;
  const companyAllocationCents = Math.max(0, retainedTargetCents - expensesCents);

  return {
    configured: true,
    deals,
    entries,
    months: cashMonths(entryRows),
    totals: {
      contractedCents,
      retainedTargetCents,
      plannedFounderDrawsCents,
      collectedCents,
      outstandingCents: Math.max(0, contractedCents - collectedCents),
      revenueReceivedCents,
      founderContributionsCents,
      founderDrawsCents,
      expensesCents,
      companyAllocationCents,
      refundsCents,
      availableCashCents,
    },
  };
}
