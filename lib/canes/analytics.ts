import { canesDb } from "@/lib/canes/supabase";
import { isDemo, listLeads } from "@/lib/canes/data";
import { listCrews, listEstimates, listJobs } from "@/lib/canes/estimates";
import { listInvoices } from "@/lib/canes/invoices";
import {
  DEMO_CALLS,
  DEMO_INVOICE_ITEMS,
  DEMO_MESSAGES,
  DEMO_PAYMENTS,
} from "@/lib/canes/fixtures";
import {
  ET,
  invoiceBalanceCents,
  SOURCE_LABEL,
  type Call,
  type InvoiceItem,
  type Job,
  type LeadSource,
  type LeadStatus,
  type Message,
  type Payment,
} from "@/lib/canes/types";

// The Insights (Phase 3) metric engine. One server call computes everything the
// dashboard renders, from the same readers the rest of the app uses — so demo
// mode falls back to fixtures exactly like every other page. Money stays in
// integer cents until the chart layer (which plots dollars); COLLECTED always
// means the payments ledger (money actually received), never invoice status.

// ── Range (URL-driven, like the estimates tabs) ───────────────────────────────

export type RangeKey = "7d" | "30d" | "90d" | "12m";

export const RANGES: Record<RangeKey, { days: number; label: string; short: string }> = {
  "7d": { days: 7, label: "Last 7 days", short: "7d" },
  "30d": { days: 30, label: "Last 30 days", short: "30d" },
  "90d": { days: 90, label: "Last 90 days", short: "90d" },
  "12m": { days: 365, label: "Last 12 months", short: "12m" },
};

export function parseRange(raw?: string): RangeKey {
  return raw === "7d" || raw === "90d" || raw === "12m" ? raw : "30d";
}

// ── Result shape ──────────────────────────────────────────────────────────────

export type TrendPoint = { label: string; cash: number; card: number }; // dollars

export type Insights = {
  rangeKey: RangeKey;
  rangeLabel: string;
  kpis: {
    collectedCents: number;
    collectedPrevCents: number; // same-length window immediately before
    outstandingCents: number;
    outstandingCount: number;
    wonCents: number; // approved-estimate value in range
    wonCount: number;
    avgJobCents: number | null; // avg paid invoice in range
    paidJobs: number;
  };
  trend: TrendPoint[];
  methodShare: { cash: number; card: number; other: number }; // cents
  revenueByCrew: { name: string; color: string; cents: number; jobs: number }[];
  topServices: { name: string; cents: number; count: number }[];
  funnel: { label: string; count: number }[]; // [0] = all leads in range
  estimates: {
    total: number;
    awaiting: number; // sent or viewed, undecided
    approved: number;
    declined: number;
    expired: number;
    drafts: number;
    winRatePct: number | null; // approved / decided
    approvedCents: number;
  };
  speedToLead: {
    medianMinutes: number | null;
    within15Pct: number | null;
    sampled: number;
    uncontacted: number;
  };
  sources: { source: LeadSource; label: string; leads: number; won: number; wonCents: number }[];
  ops: {
    completed: number;
    canceled: number;
    unscheduled: number;
    upcomingCount: number;
    upcomingCents: number;
  };
};

// ── Analytics-only readers (payments / outbound touches / paid line items) ────

async function listCompletedPayments(sinceIso: string): Promise<Payment[]> {
  if (isDemo()) {
    return DEMO_PAYMENTS.filter((p) => p.status === "completed" && p.created_at >= sinceIso);
  }
  const { data, error } = await canesDb()
    .from("payments")
    .select("*")
    .eq("status", "completed")
    .gte("created_at", sinceIso)
    .limit(2000);
  if (error) throw new Error(`listCompletedPayments: ${error.message}`);
  return (data ?? []) as Payment[];
}

async function listOutboundCalls(sinceIso: string): Promise<Call[]> {
  if (isDemo()) {
    return DEMO_CALLS.filter((c) => c.direction === "out" && c.created_at >= sinceIso);
  }
  const { data, error } = await canesDb()
    .from("calls")
    .select("*")
    .eq("direction", "out")
    .gte("created_at", sinceIso)
    .limit(2000);
  if (error) throw new Error(`listOutboundCalls: ${error.message}`);
  return (data ?? []) as Call[];
}

// Manual outbound texts only — automated hold/confirmation texts are the
// machine talking, not Sebastian reaching the customer.
async function listManualOutboundMessages(sinceIso: string): Promise<Message[]> {
  if (isDemo()) {
    return DEMO_MESSAGES.filter(
      (m) => m.direction === "out" && !m.automated && m.created_at >= sinceIso,
    );
  }
  const { data, error } = await canesDb()
    .from("messages")
    .select("*")
    .eq("direction", "out")
    .eq("automated", false)
    .gte("created_at", sinceIso)
    .limit(2000);
  if (error) throw new Error(`listManualOutboundMessages: ${error.message}`);
  return (data ?? []) as Message[];
}

async function listInvoiceItemsFor(invoiceIds: string[]): Promise<InvoiceItem[]> {
  if (invoiceIds.length === 0) return [];
  if (isDemo()) return DEMO_INVOICE_ITEMS.filter((i) => invoiceIds.includes(i.invoice_id));
  const { data, error } = await canesDb()
    .from("invoice_items")
    .select("*")
    .in("invoice_id", invoiceIds)
    .limit(2000);
  if (error) throw new Error(`listInvoiceItemsFor: ${error.message}`);
  return (data ?? []) as InvoiceItem[];
}

// ── ET bucketing ──────────────────────────────────────────────────────────────

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", day: "numeric" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short" });
const ET_MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit" });

// Build the empty buckets for a range plus a timestamp → bucket index resolver.
// Daily buckets key on the ET calendar day (DST-proof); 90d groups 7-day spans;
// 12m keys on the ET year-month.
function makeBuckets(key: RangeKey, nowMs: number): {
  points: TrendPoint[];
  indexOf: (tsMs: number) => number;
} {
  if (key === "7d" || key === "30d") {
    const days = RANGES[key].days;
    const dayKeys: string[] = [];
    const points: TrendPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(nowMs - i * 86_400_000);
      dayKeys.push(ET_DAY.format(d));
      points.push({ label: DAY_LABEL.format(d), cash: 0, card: 0 });
    }
    const idx = new Map(dayKeys.map((k, i) => [k, i]));
    return { points, indexOf: (ts) => idx.get(ET_DAY.format(new Date(ts))) ?? -1 };
  }
  if (key === "90d") {
    const weeks = 13;
    const startMs = nowMs - 90 * 86_400_000;
    const points: TrendPoint[] = [];
    for (let i = 0; i < weeks; i++) {
      points.push({ label: DAY_LABEL.format(new Date(startMs + i * 7 * 86_400_000)), cash: 0, card: 0 });
    }
    return {
      points,
      indexOf: (ts) => {
        if (ts < startMs || ts > nowMs) return -1;
        return Math.min(weeks - 1, Math.floor((ts - startMs) / (7 * 86_400_000)));
      },
    };
  }
  // 12m — walk back month by month in ET.
  const monthKeys: string[] = [];
  const points: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    // Anchor mid-month so timezone never shifts the month.
    const anchor = new Date(nowMs);
    anchor.setUTCDate(15);
    anchor.setUTCMonth(anchor.getUTCMonth() - i);
    monthKeys.push(ET_MONTH.format(anchor));
    points.push({ label: MONTH_LABEL.format(anchor), cash: 0, card: 0 });
  }
  const idx = new Map(monthKeys.map((k, i) => [k, i]));
  return { points, indexOf: (ts) => idx.get(ET_MONTH.format(new Date(ts))) ?? -1 };
}

// ── The one entry point ───────────────────────────────────────────────────────

const STATUS_RANK: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  appointment_set: 2,
  confirmed: 3,
  estimated: 4,
  won: 5,
  lost: -1, // counts as a lead, never as progress
};

const ACTIVE_JOB: Job["status"][] = ["scheduled", "confirmed", "in_progress"];
const DONE_JOB: Job["status"][] = ["completed", "invoiced", "paid"];

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export async function getInsights(key: RangeKey): Promise<Insights> {
  const days = RANGES[key].days;
  const nowMs = Date.now();
  const startMs = nowMs - days * 86_400_000;
  const startIso = new Date(startMs).toISOString();
  const prevStartIso = new Date(startMs - days * 86_400_000).toISOString();

  const [leads, estimates, jobs, invoices, crews, payments, calls, manualMsgs] = await Promise.all([
    listLeads(),
    listEstimates(),
    listJobs(),
    listInvoices(),
    listCrews(),
    listCompletedPayments(prevStartIso), // one fetch covers range + prior window
    listOutboundCalls(startIso),
    listManualOutboundMessages(startIso),
  ]);

  const ts = (iso: string) => new Date(iso).getTime();
  const inRange = (iso: string | null) => iso !== null && ts(iso) >= startMs;

  // ── Money ──
  const rangePayments = payments.filter((p) => inRange(p.created_at));
  const prevPayments = payments.filter((p) => !inRange(p.created_at)); // fetched ≥ prevStart
  const collectedCents = rangePayments.reduce((s, p) => s + p.amount_cents, 0);
  const collectedPrevCents = prevPayments.reduce((s, p) => s + p.amount_cents, 0);

  const openInvoices = invoices.filter(
    (i) => i.status === "draft" || i.status === "sent" || i.status === "viewed",
  );
  const outstandingCents = openInvoices.reduce((s, i) => s + invoiceBalanceCents(i), 0);

  const approvedInRange = estimates.filter((e) => inRange(e.approved_at));
  const wonCents = approvedInRange.reduce((s, e) => s + e.total_cents, 0);

  const paidInvoices = invoices.filter((i) => i.status === "paid" && inRange(i.paid_at));
  const avgJobCents =
    paidInvoices.length > 0
      ? Math.round(paidInvoices.reduce((s, i) => s + i.total_cents, 0) / paidInvoices.length)
      : null;

  // Trend + method share off the ledger.
  const { points, indexOf } = makeBuckets(key, nowMs);
  const methodShare = { cash: 0, card: 0, other: 0 };
  for (const p of rangePayments) {
    const method = p.method === "cash" || p.method === "card" ? p.method : "other";
    methodShare[method] += p.amount_cents;
    const i = indexOf(ts(p.created_at));
    if (i < 0) continue;
    if (method === "cash") points[i].cash += p.amount_cents / 100;
    else points[i].card += p.amount_cents / 100; // "other" plots with card, rare
  }

  // Revenue by crew (per-contractor contribution): ledger → job → crew.
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const crewAgg = new Map<string, { name: string; color: string; cents: number; jobs: Set<string> }>();
  for (const p of rangePayments) {
    const job = p.job_id ? jobById.get(p.job_id) : undefined;
    const crew = job?.crew_id ? crews.find((c) => c.id === job.crew_id) : undefined;
    const k = crew?.id ?? "none";
    const entry =
      crewAgg.get(k) ??
      { name: crew?.name ?? "Unassigned", color: crew?.color ?? "#84888f", cents: 0, jobs: new Set<string>() };
    entry.cents += p.amount_cents;
    if (p.job_id) entry.jobs.add(p.job_id);
    crewAgg.set(k, entry);
  }
  const revenueByCrew = [...crewAgg.values()]
    .map((c) => ({ name: c.name, color: c.color, cents: c.cents, jobs: c.jobs.size }))
    .sort((a, b) => b.cents - a.cents);

  // Top services: line items across invoices PAID in range.
  const paidIds = paidInvoices.map((i) => i.id);
  const items = await listInvoiceItemsFor(paidIds);
  const svcAgg = new Map<string, { cents: number; count: number }>();
  for (const it of items) {
    const entry = svcAgg.get(it.name) ?? { cents: 0, count: 0 };
    entry.cents += it.line_total_cents;
    entry.count += 1;
    svcAgg.set(it.name, entry);
  }
  const topServices = [...svcAgg.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 6);

  // ── Pipeline ──
  const rangeLeads = leads.filter((l) => inRange(l.created_at));
  const reached = (rank: number) => rangeLeads.filter((l) => STATUS_RANK[l.status] >= rank).length;
  const funnel = [
    { label: "Leads", count: rangeLeads.length },
    { label: "Contacted", count: reached(1) },
    { label: "Appointment set", count: reached(2) },
    { label: "Estimated", count: reached(4) },
    { label: "Won", count: reached(5) },
  ];

  const rangeEstimates = estimates.filter((e) => inRange(e.created_at));
  const byStatus = (s: string) => rangeEstimates.filter((e) => e.status === s).length;
  const approved = byStatus("approved");
  const declined = byStatus("declined");
  const expired = byStatus("expired");
  const decided = approved + declined + expired;
  const estimateStats = {
    total: rangeEstimates.length,
    awaiting: byStatus("sent") + byStatus("viewed"),
    approved,
    declined,
    expired,
    drafts: byStatus("draft"),
    winRatePct: decided > 0 ? Math.round((approved / decided) * 100) : null,
    approvedCents: rangeEstimates
      .filter((e) => e.status === "approved")
      .reduce((s, e) => s + e.total_cents, 0),
  };

  // ── Speed to lead: cold leads created in range → first human outbound ──
  const coldLeads = rangeLeads.filter((l) => l.type === "cold");
  const samples: number[] = [];
  let uncontacted = 0;
  for (const lead of coldLeads) {
    const createdTs = ts(lead.created_at);
    const touches: number[] = [];
    for (const c of calls) {
      if (c.lead_id === lead.id && ts(c.created_at) >= createdTs) touches.push(ts(c.created_at));
    }
    for (const m of manualMsgs) {
      if (
        (m.lead_id === lead.id || (lead.phone && m.peer_phone === lead.phone)) &&
        ts(m.created_at) >= createdTs
      ) {
        touches.push(ts(m.created_at));
      }
    }
    if (touches.length === 0) {
      uncontacted++;
      continue;
    }
    samples.push(Math.round((Math.min(...touches) - createdTs) / 60_000));
  }
  const speedToLead = {
    medianMinutes: median(samples),
    within15Pct:
      samples.length > 0
        ? Math.round((samples.filter((m) => m <= 15).length / samples.length) * 100)
        : null,
    sampled: samples.length,
    uncontacted,
  };

  // ── Sources (lead-gen ROI) ──
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const srcAgg = new Map<LeadSource, { leads: number; won: number; wonCents: number }>();
  for (const l of rangeLeads) {
    const entry = srcAgg.get(l.source) ?? { leads: 0, won: 0, wonCents: 0 };
    entry.leads += 1;
    if (l.status === "won") entry.won += 1;
    srcAgg.set(l.source, entry);
  }
  for (const e of approvedInRange) {
    const lead = e.lead_id ? leadById.get(e.lead_id) : undefined;
    if (!lead) continue;
    const entry = srcAgg.get(lead.source) ?? { leads: 0, won: 0, wonCents: 0 };
    entry.wonCents += e.total_cents;
    srcAgg.set(lead.source, entry);
  }
  const sources = [...srcAgg.entries()]
    .map(([source, v]) => ({ source, label: SOURCE_LABEL[source], ...v }))
    .sort((a, b) => b.leads - a.leads);

  // ── Ops ──
  const upcomingEnd = nowMs + 7 * 86_400_000;
  const upcoming = jobs.filter(
    (j) =>
      j.scheduled_at &&
      ACTIVE_JOB.includes(j.status) &&
      ts(j.scheduled_at) >= nowMs &&
      ts(j.scheduled_at) < upcomingEnd,
  );
  const ops = {
    completed: jobs.filter((j) => DONE_JOB.includes(j.status) && inRange(j.scheduled_at)).length,
    canceled: jobs.filter((j) => j.status === "canceled" && inRange(j.scheduled_at)).length,
    unscheduled: jobs.filter((j) => j.status === "unscheduled").length,
    upcomingCount: upcoming.length,
    upcomingCents: upcoming.reduce((s, j) => s + j.total_cents, 0),
  };

  return {
    rangeKey: key,
    rangeLabel: RANGES[key].label,
    kpis: {
      collectedCents,
      collectedPrevCents,
      outstandingCents,
      outstandingCount: openInvoices.length,
      wonCents,
      wonCount: approvedInRange.length,
      avgJobCents,
      paidJobs: paidInvoices.length,
    },
    trend: points,
    methodShare,
    revenueByCrew,
    topServices,
    funnel,
    estimates: estimateStats,
    speedToLead,
    sources,
    ops,
  };
}
