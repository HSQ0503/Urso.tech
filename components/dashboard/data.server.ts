// Server-only data access. Reads real rows from Supabase and returns them in the
// same shapes the mock data layer used, so pages swap mock → real with minimal
// change. Pulls in next/headers via the Supabase server client, so this must
// NEVER be imported by a client component.

import { createClient } from "@/lib/supabase/server";
import {
  stores,
  STORE_OPTIONS,
  scopeLabel,
  type StoreId,
  type Scope,
  type MonthValue,
  type StoreScore,
  type ScoreRow,
  type RankMetric,
  type CustomerRow,
  type CustomerSegment,
  type AgentAction,
  type Groomer,
  type ServiceLine,
  type WeeklyBrief,
  type BriefChange,
  type FunnelStep,
  type Review,
} from "./data";

// ── small helpers (kept local so this module stays self-contained) ──────────
const money = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString("en-US")}`);
const pctStr = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
const fullName = (id: StoreId) => STORE_OPTIONS.find((o) => o.value === id)!.label;
const scopeIds = (scope: Scope): StoreId[] => (scope === "all" ? stores.map((s) => s.id) : [scope]);

function monthRange(month: MonthValue): { start: string; end: string } | null {
  if (month === "all") return null;
  const [y, m] = month.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start: `${y}-${pad(m)}-01`, end: `${ny}-${pad(nm)}-01` };
}

// ── raw loaders ─────────────────────────────────────────────────────────────
type Agg = {
  rev: number; groom: number; retail: number; bookingRev: number; newRev: number; repeatRev: number; tickets: number;
  bookings: number; identified: number; noShows: number; rebooks: number;
  attached: number; calls: number; missed: number; visits: number; starts: number; completes: number; booked: number;
};
const emptyAgg = (): Agg => ({ rev: 0, groom: 0, retail: 0, bookingRev: 0, newRev: 0, repeatRev: 0, tickets: 0, bookings: 0, identified: 0, noShows: 0, rebooks: 0, attached: 0, calls: 0, missed: 0, visits: 0, starts: 0, completes: 0, booked: 0 });

type DailyRow = {
  store_id: StoreId; revenue: number; grooming_revenue: number; retail_revenue: number; booking_revenue: number;
  new_revenue: number; repeat_revenue: number; tickets_total: number; identified_bookings: number;
  bookings: number; no_shows: number; rebooks: number; retail_attached: number; calls_total: number; calls_missed: number;
  web_visits: number; web_form_starts: number; web_form_completes: number; web_booked: number;
};

async function loadDailyRange(start: string | null, end: string | null): Promise<Record<StoreId, Agg>> {
  const supabase = await createClient();
  // Aggregate in the DB (returns ≤4 rows) — avoids PostgREST's 1,000-row cap.
  const { data, error } = await supabase.rpc("metrics_by_store", { p_start: start, p_end: end });
  if (error) throw new Error(`metrics_by_store failed: ${error.message}`);

  const acc = {} as Record<StoreId, Agg>;
  for (const s of stores) acc[s.id] = emptyAgg();
  for (const r of (data ?? []) as unknown as DailyRow[]) {
    const a = acc[r.store_id];
    if (!a) continue;
    a.rev = Number(r.revenue); a.groom = Number(r.grooming_revenue); a.retail = Number(r.retail_revenue);
    a.bookingRev = Number(r.booking_revenue);
    a.newRev = Number(r.new_revenue); a.repeatRev = Number(r.repeat_revenue); a.tickets = Number(r.tickets_total);
    a.identified = Number(r.identified_bookings);
    a.bookings = Number(r.bookings); a.noShows = Number(r.no_shows); a.rebooks = Number(r.rebooks); a.attached = Number(r.retail_attached);
    a.calls = Number(r.calls_total); a.missed = Number(r.calls_missed);
    a.visits = Number(r.web_visits); a.starts = Number(r.web_form_starts); a.completes = Number(r.web_form_completes); a.booked = Number(r.web_booked);
  }
  return acc;
}

async function loadDaily(month: MonthValue): Promise<Record<StoreId, Agg>> {
  const range = monthRange(month);
  return loadDailyRange(range?.start ?? null, range?.end ?? null);
}

type Listing = { rating: number; reviewCount: number; responseRate: number; responseHours: number; localRank: number; hasBook: boolean; listing: number };
async function loadListings(): Promise<Record<StoreId, Listing>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_listings")
    .select("store_id, local_rank, listing_completeness, has_book_button, avg_rating, review_count, response_rate, response_hours");
  if (error) throw new Error(`store_listings read failed: ${error.message}`);
  const out = {} as Record<StoreId, Listing>;
  type LRow = { store_id: StoreId; local_rank: number; listing_completeness: number; has_book_button: boolean; avg_rating: number; review_count: number; response_rate: number; response_hours: number };
  for (const r of (data ?? []) as unknown as LRow[]) {
    out[r.store_id] = {
      rating: Number(r.avg_rating), reviewCount: r.review_count, responseRate: Number(r.response_rate),
      responseHours: r.response_hours, localRank: r.local_rank, hasBook: r.has_book_button, listing: Number(r.listing_completeness),
    };
  }
  return out;
}

async function loadGroomers(): Promise<Groomer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groomers")
    .select("id, store_id, name, flag, rev_per_hr, appts, rebook, attach, util, avg_ticket")
    .order("rev_per_hr", { ascending: false });
  if (error) throw new Error(`groomers read failed: ${error.message}`);
  type GRow = { id: string; store_id: StoreId; name: string; flag: "star" | "coach" | null; rev_per_hr: number; appts: number; rebook: number; attach: number; util: number; avg_ticket: number };
  return ((data ?? []) as unknown as GRow[]).map((g) => ({
    id: g.id, name: g.name, store: fullName(g.store_id), revPerHr: Number(g.rev_per_hr), appts: g.appts,
    rebook: Number(g.rebook), attach: Number(g.attach), avgTicket: Number(g.avg_ticket), util: Number(g.util),
    flag: g.flag ?? undefined,
  }));
}

const NEXT_ACTION: Record<CustomerSegment, string> = {
  VIP: "Offer standing appointment", Loyal: "Confirm next groom", "At risk": "Send rebooking link", Lapsed: "Reactivation offer",
};
// The customers table holds ~35k rows (incl. identity-only rows with no orders
// in our history), far past PostgREST's 1,000-row cap — so customer reads must
// either aggregate in the DB (RPCs) or be filtered + limited. Never .select()
// the whole table. visits >= 1 keeps identity-only rows out everywhere.
const CUSTOMER_COLS = "store_id, name, pet, visits, ltv, segment, last_visit_at";
type CustRow = { store_id: StoreId; name: string; pet: string | null; visits: number; ltv: number; segment: CustomerSegment; last_visit_at: string };
const toCustomerRow = (c: CustRow): CustomerRow => ({
  name: c.name, pet: c.pet ?? "—", store: fullName(c.store_id), storeId: c.store_id, visits: c.visits, ltv: Number(c.ltv),
  lastVisit: Math.max(0, Math.round((Date.now() - new Date(`${c.last_visit_at}T00:00:00Z`).getTime()) / 86400000)),
  segment: c.segment, next: NEXT_ACTION[c.segment],
});

type SegCount = { segment: CustomerSegment; customers: number; ltv_sum: number };
async function loadSegmentCounts(scope: Scope): Promise<SegCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_segment_counts", { p_store_ids: scopeIds(scope) });
  if (error) throw new Error(`customer_segment_counts failed: ${error.message}`);
  return (data ?? []) as unknown as SegCount[];
}

type RawAction = { id: string; store_id: StoreId | null; store_label: string; agent: string; title: string; detail: string; metric: string; status: AgentAction["status"]; result: string | null; pending: boolean };
async function loadActions(): Promise<RawAction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select("id, store_id, store_label, agent, title, detail, metric, status, result, pending");
  if (error) throw new Error(`agent_actions read failed: ${error.message}`);
  return (data ?? []) as unknown as RawAction[];
}
const toAction = (a: RawAction): AgentAction => ({
  id: a.id, title: a.title, store: a.store_label, agent: a.agent, detail: a.detail, metric: a.metric,
  status: a.status, result: a.result ?? undefined, pending: a.pending,
});

// ── per-store + per-scope metric computation ────────────────────────────────
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
function sumScope(byStore: Record<StoreId, Agg>, ids: StoreId[]): Agg {
  const out = emptyAgg();
  for (const id of ids) {
    const a = byStore[id];
    (Object.keys(out) as (keyof Agg)[]).forEach((k) => (out[k] += a[k]));
  }
  return out;
}

type Metrics = { revenue: number; bookings: number; grooming: number; retail: number; groomingShare: number; avgTicket: number; rebook: number; noShow: number; attach: number; rating: number };
function computeMetrics(scope: Scope, byStore: Record<StoreId, Agg>, listings: Record<StoreId, Listing>): Metrics {
  const ids = scopeIds(scope);
  const a = sumScope(byStore, ids);
  const denom = a.bookings || 1;
  const totalRev = ids.reduce((s, id) => s + byStore[id].rev, 0) || 1;
  const rating = ids.reduce((s, id) => s + (listings[id]?.rating ?? 0) * byStore[id].rev, 0) / totalRev;
  return {
    revenue: Math.round(a.rev), bookings: a.bookings, grooming: Math.round(a.groom), retail: Math.round(a.retail),
    groomingShare: a.groom + a.retail > 0 ? a.groom / (a.groom + a.retail) : 0,
    // Revenue on grooming tickets ÷ grooming tickets — NOT all revenue, which
    // would mix retail-only purchases into the numerator (showed $134 vs $95).
    avgTicket: a.bookings ? Math.round(a.bookingRev / a.bookings) : 0,
    // Return rate over IDENTIFIED grooming visits — anonymous walk-in tickets
    // (~10% of bookings) can never register a return, so leaving them in the
    // denominator would bias the rate down.
    rebook: a.identified ? a.rebooks / a.identified : 0,
    noShow: a.noShows / denom, attach: a.attached / denom, rating,
  };
}
function computeCalls(scope: Scope, byStore: Record<StoreId, Agg>) {
  const a = sumScope(byStore, scopeIds(scope));
  return { total: a.calls, missed: a.missed, missedPct: a.calls ? a.missed / a.calls : 0, answeredPct: a.calls ? 1 - a.missed / a.calls : 0 };
}
function computeWeb(scope: Scope, byStore: Record<StoreId, Agg>) {
  const a = sumScope(byStore, scopeIds(scope));
  return { visits: a.visits, bookings: a.booked, convRate: a.visits ? a.booked / a.visits : 0 };
}

// ── public: headline metrics ────────────────────────────────────────────────
export async function getMetrics(scope: Scope, month: MonthValue) {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  return computeMetrics(scope, byStore, listings);
}
export async function getCallStats(scope: Scope, month: MonthValue) {
  return computeCalls(scope, await loadDaily(month));
}
export async function getWebStats(scope: Scope, month: MonthValue) {
  return computeWeb(scope, await loadDaily(month));
}
// Real ticket mix: shares of ALL tickets in scope (not just grooming tickets).
// both = tickets with a grooming service AND a retail item; grooming-only =
// service tickets without retail; retail-only = everything else.
export async function getCrossSell(scope: Scope, month: MonthValue) {
  const a = sumScope(await loadDaily(month), scopeIds(scope));
  const t = a.tickets || 1;
  return {
    both: clamp01(a.attached / t),
    groomingOnly: clamp01((a.bookings - a.attached) / t),
    retailOnly: clamp01((a.tickets - a.bookings) / t),
  };
}

// ── public: real period-over-period deltas ──────────────────────────────────
// FranPOS history starts 2025-06-16, so June 2025 is a partial month — deltas
// against it (or against nothing) would mislead. The backward-90-day return
// rate is only mature once a full 90 days of history sit behind the comparison
// month. A null delta means "no honest prior period" and the chip is hidden.
const FIRST_FULL_MONTH = "2025-07-01";
const RETURN_RATE_MATURE = "2025-10-01";

export type KpiDeltas = {
  revenue: number | null; bookings: number | null; avgTicket: number | null;
  rebook: number | null; attach: number | null; groomingShare: number | null;
};
const NULL_DELTAS: KpiDeltas = { revenue: null, bookings: null, avgTicket: null, rebook: null, attach: null, groomingShare: null };

const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export async function getKpiDeltas(scope: Scope, month: MonthValue): Promise<KpiDeltas> {
  // "Last 12 months" has no prior 12-month window in our history — no chips.
  if (month === "all") return NULL_DELTAS;
  const [y, m] = month.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const prevStart = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
  if (prevStart < FIRST_FULL_MONTH) return NULL_DELTAS;

  const curStart = `${y}-${pad(m)}-01`;
  const today = nyToday();
  let curEnd: string, prevEnd: string;
  if (today.slice(0, 7) === month) {
    // Current month is partial: compare completed days only, like-for-like
    // (Jun 1–11 vs May 1–11) — never a part-month against a full month.
    const completedDays = Number(today.slice(8, 10)) - 1;
    if (completedDays < 1) return NULL_DELTAS;
    curEnd = addDays(curStart, completedDays);
    prevEnd = addDays(prevStart, completedDays);
  } else {
    curEnd = monthRange(month)!.end;
    prevEnd = curStart;
  }

  const [curBy, prevBy] = await Promise.all([loadDailyRange(curStart, curEnd), loadDailyRange(prevStart, prevEnd)]);
  const a = sumScope(curBy, scopeIds(scope));
  const b = sumScope(prevBy, scopeIds(scope));
  if (b.rev === 0 && b.bookings === 0) return NULL_DELTAS;
  const d = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
  const rebookRate = (x: Agg) => (x.identified ? x.rebooks / x.identified : 0);
  const attachRate = (x: Agg) => (x.bookings ? x.attached / x.bookings : 0);
  return {
    revenue: d(a.rev, b.rev),
    bookings: d(a.bookings, b.bookings),
    avgTicket: d(a.bookings ? a.bookingRev / a.bookings : 0, b.bookings ? b.bookingRev / b.bookings : 0),
    rebook: prevStart < RETURN_RATE_MATURE ? null : d(rebookRate(a), rebookRate(b)),
    attach: d(attachRate(a), attachRate(b)),
    groomingShare: d(a.groom + a.retail ? a.groom / (a.groom + a.retail) : 0, b.groom + b.retail ? b.groom / (b.groom + b.retail) : 0),
  };
}

// ── public: stores comparison + scoreboard ──────────────────────────────────
export type StoreMetrics = Metrics & { missedPct: number };
export async function storeComparison(month: MonthValue): Promise<Record<StoreId, StoreMetrics>> {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  const out = {} as Record<StoreId, StoreMetrics>;
  for (const s of stores) {
    out[s.id] = { ...computeMetrics(s.id, byStore, listings), missedPct: computeCalls(s.id, byStore).missedPct };
  }
  return out;
}

// Composite score from the two live, store-controllable metrics (the weights
// are published in SCORE_WEIGHTS — keep both in sync). Calls answered, review
// rating, and no-show rejoin the formula when their feeds go live; scoring
// dead-source zeros or seeded ratings would make the ranking dishonest.
export async function getStoreScores(month: MonthValue): Promise<StoreScore[]> {
  const byStore = await loadDaily(month);
  const rows = stores.map((s) => {
    const m = computeMetrics(s.id, byStore, {} as Record<StoreId, Listing>);
    const raw = m.rebook * 0.6 + m.attach * 0.4;
    return { id: s.id, name: s.name, score: Math.round(Math.min(99, Math.max(40, 50 + raw * 70))) };
  });
  return rows.sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function getStoreRanking(metric: RankMetric, month: MonthValue) {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  return stores
    .map((s) => {
      const m = computeMetrics(s.id, byStore, listings);
      const value = metric === "revenue" ? m.revenue : metric === "answered" ? computeCalls(s.id, byStore).answeredPct : metric === "rebook" ? m.rebook : m.attach;
      return { id: s.id, name: s.name, value };
    })
    .sort((a, b) => b.value - a.value);
}

// ── public: revenue map ─────────────────────────────────────────────────────
export async function getRevenueByLocation(month: MonthValue) {
  const byStore = await loadDaily(month);
  return stores.map((s) => ({ id: s.id, name: s.name, value: Math.round(byStore[s.id].rev) })).sort((a, b) => b.value - a.value);
}
// Real items from product_sales_daily (RPC aggregates by name in the DB).
// Top 5 per line so retail's long tail doesn't vanish under grooming.
export async function getRevenueByService(scope: Scope, month: MonthValue): Promise<{ name: string; value: number; line: ServiceLine }[]> {
  const supabase = await createClient();
  const range = monthRange(month);
  const { data, error } = await supabase.rpc("product_revenue_by_name", {
    p_store_ids: scopeIds(scope), p_start: range?.start ?? null, p_end: range?.end ?? null,
  });
  if (error) throw new Error(`product_revenue_by_name failed: ${error.message}`);
  type Row = { name: string; is_service: boolean; revenue: number; units: number };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    name: r.name, value: Math.round(Number(r.revenue)), line: (r.is_service ? "Grooming" : "Retail") as ServiceLine,
  }));
  const top = (line: ServiceLine) => rows.filter((r) => r.line === line).sort((a, b) => b.value - a.value).slice(0, 5);
  return [...top("Grooming"), ...top("Retail")].sort((a, b) => b.value - a.value);
}
// True service revenue per groomer over the period (groomer_sales_daily),
// replacing the old appts×avg_ticket×months approximation — appts was already
// an all-time count, so ×12 inflated the 12-month view ~12×.
export async function getRevenueByGroomer(scope: Scope, month: MonthValue) {
  const supabase = await createClient();
  const range = monthRange(month);
  const { data, error } = await supabase.rpc("groomer_revenue", {
    p_store_ids: scopeIds(scope), p_start: range?.start ?? null, p_end: range?.end ?? null,
  });
  if (error) throw new Error(`groomer_revenue failed: ${error.message}`);
  type Row = { store_id: StoreId; name: string; revenue: number; appts: number };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ name: r.name, store: fullName(r.store_id), value: Math.round(Number(r.revenue)) }))
    .sort((a, b) => b.value - a.value);
}
// Real split from metrics_daily. "New" = the customer's first visit day in our
// recorded history (starts 2025-06-16). walkIn = revenue on the stores' house
// walk-in accounts — real sales, but not attributable to a known customer.
export async function getRevenueNewVsRepeat(scope: Scope, month: MonthValue) {
  const a = sumScope(await loadDaily(month), scopeIds(scope));
  return {
    repeat: Math.round(a.repeatRev),
    fresh: Math.round(a.newRev),
    walkIn: Math.max(0, Math.round(a.rev - a.newRev - a.repeatRev)),
  };
}

// ── public: customers ───────────────────────────────────────────────────────
export async function getCustomersByValue(scope: Scope): Promise<CustomerRow[]> {
  const supabase = await createClient();
  let q = supabase.from("customers").select(CUSTOMER_COLS).gte("visits", 1).order("ltv", { ascending: false }).limit(12);
  if (scope !== "all") q = q.eq("store_id", scope);
  const { data, error } = await q;
  if (error) throw new Error(`customers read failed: ${error.message}`);
  return ((data ?? []) as unknown as CustRow[]).map(toCustomerRow);
}
export async function getCustomerSegments(scope: Scope) {
  const counts = await loadSegmentCounts(scope);
  const order: CustomerSegment[] = ["VIP", "Loyal", "At risk", "Lapsed"];
  return order.map((segment) => ({ segment, count: Number(counts.find((c) => c.segment === segment)?.customers ?? 0) }));
}
export async function getCustomerIntel(scope: Scope) {
  const counts = await loadSegmentCounts(scope);
  const count = counts.reduce((a, c) => a + Number(c.customers), 0);
  const ltv = counts.reduce((a, c) => a + Number(c.ltv_sum), 0);
  const atRisk = counts.filter((c) => c.segment === "At risk" || c.segment === "Lapsed").reduce((a, c) => a + Number(c.customers), 0);
  return { avgLtv: count ? Math.round(ltv / count) : 0, atRisk, count };
}
// Win-back list shape for the Customers page WinbackCard. The count is exact
// (DB count); the displayed list is the 60 most-lapsed.
export async function getWinbackList(scope: Scope) {
  const supabase = await createClient();
  let countQ = supabase.from("customers").select("*", { count: "exact", head: true }).gte("visits", 1).in("segment", ["At risk", "Lapsed"]);
  let listQ = supabase.from("customers").select(CUSTOMER_COLS).gte("visits", 1).in("segment", ["At risk", "Lapsed"]).order("last_visit_at", { ascending: true }).limit(60);
  if (scope !== "all") {
    countQ = countQ.eq("store_id", scope);
    listQ = listQ.eq("store_id", scope);
  }
  const [{ count, error: countErr }, { data, error: listErr }] = await Promise.all([countQ, listQ]);
  if (countErr || listErr) throw new Error(`winback read failed: ${(countErr ?? listErr)!.message}`);
  const rows = ((data ?? []) as unknown as CustRow[]).map(toCustomerRow);
  return { list: rows.map((c) => ({ name: c.name, store: c.store, last: `${c.lastVisit} days ago`, visits: c.visits })), count: count ?? rows.length };
}
export async function getCustomersNeedingAttention(store: StoreId): Promise<CustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers").select(CUSTOMER_COLS)
    .eq("store_id", store).gte("visits", 1).in("segment", ["At risk", "Lapsed"])
    .order("last_visit_at", { ascending: true }).limit(60);
  if (error) throw new Error(`customers read failed: ${error.message}`);
  return ((data ?? []) as unknown as CustRow[]).map(toCustomerRow);
}
// Retention aggregates — all real now. Cohort, cadence, returning share and
// one-and-done are trailing measures over the full recorded history (history
// starts 2025-06-16); the return rate honors the month filter like every other
// metric. The 90-day guards in the SQL keep censoring honest: a customer only
// counts as returning or one-and-done once they have had 90 days to come back.
export async function getRetention(scope: Scope, month: MonthValue) {
  const supabase = await createClient();
  const ids = scopeIds(scope);
  const [m, summary, cohortRows, wb] = await Promise.all([
    getMetrics(scope, month),
    supabase.rpc("retention_summary", { p_store_ids: ids }),
    supabase.from("cohort_monthly").select("month_offset, eligible, retained").in("store_id", ids),
    getWinbackList(scope),
  ]);
  if (summary.error) throw new Error(`retention_summary failed: ${summary.error.message}`);
  if (cohortRows.error) throw new Error(`cohort_monthly read failed: ${cohortRows.error.message}`);
  type S = { total_customers: number; eligible90: number; returning90: number; one_and_done90: number; avg_cadence_days: number };
  const s = ((summary.data ?? []) as unknown as S[])[0];
  const eligible = Number(s?.eligible90 ?? 0);
  const returningPct = eligible ? Number(s.returning90) / eligible : 0;

  // Survival curve: sum per-store rows, keep offsets contiguous from 0 and
  // backed by a meaningful sample (≥50 eligible customers).
  type C = { month_offset: number; eligible: number; retained: number };
  const byOffset = new Map<number, { e: number; r: number }>();
  for (const r of (cohortRows.data ?? []) as unknown as C[]) {
    const o = byOffset.get(Number(r.month_offset)) ?? { e: 0, r: 0 };
    o.e += Number(r.eligible);
    o.r += Number(r.retained);
    byOffset.set(Number(r.month_offset), o);
  }
  const cohort: number[] = [];
  for (let k = 0; byOffset.has(k); k++) {
    const { e, r } = byOffset.get(k)!;
    if (e < 50) break;
    cohort.push(Math.round((r / e) * 100));
  }

  return {
    returningPct,
    newPct: 1 - returningPct,
    rebook: m.rebook,
    cadenceDays: Math.round(Number(s?.avg_cadence_days ?? 0)),
    oneAndDone: Number(s?.one_and_done90 ?? 0),
    winbackCount: wb.count,
    cohort: cohort.length > 1 ? cohort : [100],
  };
}

// ── public: weekly brief ────────────────────────────────────────────────────
export async function getWeeklyBrief(scope: Scope): Promise<WeeklyBrief> {
  // The brief is always "this week" — the last 7 complete days vs the 7 days
  // before them, both real windows from metrics_daily. Calls and rating rows
  // return when Twilio / GBP land; showing dead zeros with a delta would lie.
  const today = nyToday();
  const weekStart = addDays(today, -7);
  const prevStart = addDays(today, -14);
  const [curBy, prevBy, actions] = await Promise.all([
    loadDailyRange(weekStart, today),
    loadDailyRange(prevStart, weekStart),
    loadActions(),
  ]);
  const ids = scopeIds(scope);
  const a = sumScope(curBy, ids);
  const b = sumScope(prevBy, ids);
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;

  const d = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 1000 : 0);
  const avgVisit = (x: Agg) => (x.bookings ? x.bookingRev / x.bookings : 0);
  const rebookRate = (x: Agg) => (x.identified ? x.rebooks / x.identified : 0);
  const rebook = rebookRate(a);
  const attach = a.bookings ? a.attached / a.bookings : 0;
  const [revD, bookD, avgD, rebookD] = [
    d(a.rev, b.rev),
    d(a.bookings, b.bookings),
    d(avgVisit(a), avgVisit(b)),
    d(rebookRate(a), rebookRate(b)),
  ];

  const changes: BriefChange[] = [
    { label: "Revenue", value: money(Math.round(a.rev)), delta: revD, good: revD >= 0 },
    { label: "Bookings", value: a.bookings.toLocaleString(), delta: bookD, good: bookD >= 0 },
    { label: "Avg visit", value: money(Math.round(avgVisit(a))), delta: avgD, good: avgD >= 0 },
    { label: "Return rate", value: pctStr(rebook), delta: rebookD, good: rebookD >= 0 },
  ];
  const dir = (n: number) => (n >= 0 ? "up" : "down");
  const wins = changes.filter((c) => c.good && Math.abs(c.delta) >= 0.01).map((c) => `${c.label} ${dir(c.delta)} ${pctStr(Math.abs(c.delta))} ${here} vs the week before.`);
  const risks = changes.filter((c) => !c.good && Math.abs(c.delta) >= 0.01).map((c) => `${c.label} moved the wrong way (${dir(c.delta)} ${pctStr(Math.abs(c.delta))}) ${here} vs the week before.`);

  // Opportunity selection considers live metrics only — calls and the web
  // funnel join once their feeds exist.
  const [lever, opportunity]: [string, { title: string; detail: string }] =
    rebook < 0.5
      ? ["rebooking", { title: "Rebooking is the biggest lever", detail: `Only ${pctStr(rebook)} of grooming visits ${here} come from customers returning within 90 days. A rebooking prompt at checkout is the most durable fix.` }]
      : attach < 0.35
        ? ["retail attach", { title: "Retail attach is the biggest lever", detail: `Only ${pctStr(attach)} of grooming visits ${here} add a retail item this week. A one-line suggestion at checkout is the simplest gain on visits already happening.` }]
        : ["holding the current playbook", { title: "Hold the playbook — the next lever is call capture", detail: `Return rate and retail attach are both holding ${here}. The next measurable lever arrives when call tracking goes live.` }];

  return {
    headline: `Revenue ${revD >= 0 ? "rose" : "eased"} to ${money(Math.round(a.rev))} ${here} this week, and ${lever} is the clearest opportunity to act on.`,
    changes,
    wins: wins.length ? wins : ["Performance held steady across the headline metrics."],
    risks: risks.length ? risks : ["No metric moved materially in the wrong direction."],
    opportunity,
    actionsCompleted: actions.filter((a) => a.status === "completed").length,
    actionsOpen: actions.filter((a) => a.status !== "completed").length,
    recommendation: opportunity.title,
  };
}

// ── public: manager dashboard ───────────────────────────────────────────────
// Scorecard rows are the live, manager-movable metrics only. Calls answered,
// no-show, and review rating rejoin when their feeds (Twilio, bookings, GBP)
// go live — showing dead zeros or seeded ratings as "your performance" would
// be inaccurate. Deltas are real period-over-period (null = no prior period).
export async function getManagerScorecard(store: StoreId, month: MonthValue): Promise<ScoreRow[]> {
  const [byStore, deltas] = await Promise.all([loadDaily(month), getKpiDeltas(store, month)]);
  const none = {} as Record<StoreId, Listing>;
  const m = computeMetrics(store, byStore, none);
  const gm = computeMetrics("all", byStore, none);
  const rows: { label: string; raw: number; avg: number; fmt: (n: number) => string; delta: number | null }[] = [
    { label: "Return rate", raw: m.rebook, avg: gm.rebook, fmt: (n) => pctStr(n), delta: deltas.rebook },
    { label: "Retail attach", raw: m.attach, avg: gm.attach, fmt: (n) => pctStr(n), delta: deltas.attach },
    { label: "Avg visit", raw: m.avgTicket, avg: gm.avgTicket, fmt: (n) => money(n), delta: deltas.avgTicket },
  ];
  return rows.map((r) => ({
    label: r.label, value: r.fmt(r.raw), raw: r.raw, avgLabel: r.fmt(r.avg), delta: r.delta, invert: false,
    beatsAvg: r.raw >= r.avg,
  }));
}

export async function getManagerFocus(store: StoreId, month: MonthValue) {
  const byStore = await loadDaily(month);
  const cs = computeCalls(store, byStore);
  const m = computeMetrics(store, byStore, {} as Record<StoreId, Listing>);
  const here = `at ${scopeLabel(store)}`;
  // Candidates are gated on their data source being live (calls) or the copy
  // being truthful (the "Only X%" framings presume the metric is actually low).
  const candidates = [
    ...(cs.total > 0
      ? [{ score: cs.missedPct, planKey: "call-capture", title: "Unanswered inbound calls are the biggest capture leak", detail: `${pctStr(cs.missedPct)} of inbound calls went unanswered ${here}. Each unanswered call is most often a booking that goes to a competitor instead.`, metric: `${pctStr(cs.missedPct)} of calls missed`, pending: true }]
      : []),
    ...(m.rebook < 0.6
      ? [{ score: 1 - m.rebook, planKey: "rebook-coach", title: "Rebooking at checkout is the most durable lever", detail: `Only ${pctStr(m.rebook)} of grooming visits ${here} come from customers returning within 90 days. A short rebooking prompt at checkout is the most reliable fix.`, metric: `${pctStr(m.rebook)} return rate`, pending: false }]
      : []),
    ...(m.attach < 0.5
      ? [{ score: 1 - m.attach, planKey: "retail-attach", title: "Retail attachment on grooming visits is below the group", detail: `${pctStr(m.attach)} of grooming visits ${here} add a retail item. Suggesting food or accessories at checkout is the simplest add.`, metric: `${pctStr(m.attach)} retail attach`, pending: false }]
      : []),
  ];
  if (!candidates.length) {
    return { score: 0, planKey: "rebook-coach", title: "Retention and attach are on track — hold the line", detail: `Return rate and retail attach ${here} are both at healthy levels. Keep the checkout habits consistent; the next measurable lever arrives with call tracking.`, metric: `${pctStr(m.rebook)} return rate`, pending: false };
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

export async function getGroomersForStore(store: StoreId): Promise<Groomer[]> {
  return (await loadGroomers()).filter((g) => g.store === fullName(store));
}

export async function getAgentActionsForStore(store: StoreId): Promise<AgentAction[]> {
  const name = fullName(store);
  return (await loadActions())
    .filter((a) => a.store_id === store || a.store_label === "All stores" || a.store_label.includes(name) || name.startsWith(a.store_label.split(" · ")[0]))
    .map(toAction);
}

// ── public: time series for the trend charts (Performance, Home) ─────────────
// Granularity follows the month filter: "all" → one point per calendar month,
// a specific month → one point per day. Labels are generated from the data, so
// they always match the series length.
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type SeriesBucket = { bucket: string; revenue: number; calls_total: number; calls_missed: number; web_visits: number; web_booked: number };

export async function getSeries(scope: Scope, month: MonthValue) {
  const supabase = await createClient();
  const range = monthRange(month);
  const monthly = month === "all";
  // Bucketed + summed in the DB (≤12 months or ≤31 days) — avoids the row cap.
  const { data, error } = await supabase.rpc("metrics_series", {
    p_store_ids: scopeIds(scope),
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
    p_monthly: monthly,
  });
  if (error) throw new Error(`metrics_series failed: ${error.message}`);
  const rows = (data ?? []) as unknown as SeriesBucket[];
  return {
    labels: rows.map((r) => (monthly ? MONTH_ABBR[Number(r.bucket.slice(5, 7)) - 1] : String(Number(r.bucket.slice(8, 10))))),
    revenue: rows.map((r) => Math.round(Number(r.revenue))),
    callsTotal: rows.map((r) => Number(r.calls_total)),
    callsMissed: rows.map((r) => Number(r.calls_missed)),
    webVisits: rows.map((r) => Number(r.web_visits)),
    webBookings: rows.map((r) => Number(r.web_booked)),
  };
}

// ── public: conversion funnel (Performance) ─────────────────────────────────
export async function getFunnel(scope: Scope, month: MonthValue): Promise<FunnelStep[]> {
  const a = sumScope(await loadDaily(month), scopeIds(scope));
  const raw = [
    { stage: "Visited site", value: a.visits },
    { stage: "Started booking", value: a.starts },
    { stage: "Completed form", value: a.completes },
    { stage: "Booked", value: a.booked },
  ];
  return raw.map((r, i) => {
    const stepConv = i === 0 ? 1 : r.value / (raw[i - 1].value || 1);
    return { ...r, pct: r.value / (a.visits || 1), stepConv, leak: i > 0 && stepConv < 0.45 };
  });
}

// ── public: intraday call profile (Performance) ─────────────────────────────
// The hourly shape is a fixed profile scaled by the real average daily call
// volume from metrics_daily (intraday timing arrives for real with Twilio).
const HOURLY = [4, 9, 14, 16, 15, 12, 13, 15, 14, 11, 9, 7, 5, 4];
const MISSED_HOURLY = [1, 2, 3, 4, 3, 2, 3, 5, 5, 4, 4, 5, 4, 3];
export async function getCallsHourly(scope: Scope, month: MonthValue) {
  const a = sumScope(await loadDaily(month), scopeIds(scope));
  const days = month === "all" ? 365 : 30;
  const hSum = HOURLY.reduce((x, y) => x + y, 0);
  const mSum = MISSED_HOURLY.reduce((x, y) => x + y, 0);
  const hourly = HOURLY.map((h) => Math.round(((a.calls / days) * h) / hSum));
  const missedHourly = MISSED_HOURLY.map((h, i) => Math.min(hourly[i], Math.round(((a.missed / days) * h) / mSum)));
  return { hourly, missedHourly, startHour: 8, closeHour: 19 };
}

// ── public: groomer roster (Team page) ──────────────────────────────────────
export async function getGroomers(scope: Scope): Promise<Groomer[]> {
  const all = await loadGroomers();
  return scope === "all" ? all : all.filter((g) => g.store === fullName(scope));
}

// ── public: Home "one action item" (the highest-scoring leak in scope) ───────
// Candidates are gated on live data: the call and web-funnel levers only enter
// once Twilio / GA4 report real volume (recommending a fix for "0% missed
// calls" would be acting on dead-source zeros), and the "Only X%" framings
// only run when the metric is actually low.
export async function getTopAction(scope: Scope, month: MonthValue) {
  const byStore = await loadDaily(month);
  const cs = computeCalls(scope, byStore);
  const ws = computeWeb(scope, byStore);
  const m = computeMetrics(scope, byStore, {} as Record<StoreId, Listing>);
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;
  const candidates = [
    ...(cs.total > 0
      ? [{
          score: 2 + cs.missedPct,
          planKey: "call-capture",
          title: "Missed calls aren't being followed up fast enough",
          detail: `${pctStr(cs.missedPct)} of inbound calls ${here} go unanswered, and nothing texts those callers back. Each one is usually a booking that goes to whoever picks up next. Urso sets up a Twilio line that catches every missed call and texts the caller back a booking link within seconds — you approve the message once, then it runs.`,
          metric: `${pctStr(cs.missedPct)} of calls missed`,
          pending: true,
        }]
      : []),
    ...(m.rebook < 0.6
      ? [{
          score: 1 - m.rebook,
          planKey: "rebook-coach",
          title: "Rebooking is below the level where recurring revenue holds",
          detail: `Only ${pctStr(m.rebook)} of grooming visits ${here} come from customers returning within 90 days. Grooming is recurring revenue, so this is the most durable lever on long-term performance. Urso sets up a checkout rebooking prompt and tracks what it brings back.`,
          metric: `${pctStr(m.rebook)} return rate`,
          pending: false,
        }]
      : []),
    ...(m.attach < 0.5
      ? [{
          score: 1 - m.attach,
          planKey: "retail-attach",
          title: "Retail attach on grooming visits is the clearest revenue lever",
          detail: `Only ${pctStr(m.attach)} of grooming visits ${here} add a retail item, so most visits leave retail margin on the table. Urso sets up a checkout prompt and reorder reminders built from each pet's purchase history, and tracks attach per store and groomer.`,
          metric: `${pctStr(m.attach)} retail attach`,
          pending: false,
        }]
      : []),
    ...(ws.visits > 0
      ? [{
          score: 1 - ws.convRate * 3.5,
          planKey: "booking-form",
          title: "Online booking abandonment is suppressing new bookings",
          detail: `${pctStr(1 - ws.convRate)} of website visitors ${here} leave without booking. The drop is concentrated in the booking form — Urso builds and tests a shorter, mobile-first form and tracks the bookings it recovers.`,
          metric: `${pctStr(ws.convRate, 1)} book online`,
          pending: true,
        }]
      : []),
  ];
  if (!candidates.length) {
    return {
      score: 0,
      planKey: "rebook-coach",
      title: "Retention and attach are on track — hold the line",
      detail: `Return rate and retail attach ${here} are both at healthy levels. Keep the checkout habits consistent; the next measurable lever arrives when call tracking goes live.`,
      metric: `${pctStr(m.rebook)} return rate`,
      pending: false,
    };
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

// ── public: reviews + reputation (Reviews page) ─────────────────────────────
export async function getReviewsData() {
  const supabase = await createClient();
  const listings = await loadListings();

  const reputation = stores.map((s) => {
    const l = listings[s.id];
    return { store: s.name, rating: l?.rating ?? 0, volume: l?.reviewCount ?? 0, responseRate: l?.responseRate ?? 0, responseHrs: l?.responseHours ?? 0 };
  });
  const findability = stores.map((s) => {
    const l = listings[s.id];
    return { store: s.name, rank: l?.localRank ?? 0, listing: l?.listing ?? 0, bookButton: l?.hasBook ?? true };
  });

  const { data, error } = await supabase
    .from("reviews")
    .select("store_id, author, rating, body, created_at, replied, flagged_fake")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`reviews read failed: ${error.message}`);

  type RvRow = { store_id: StoreId; author: string; rating: number; body: string; created_at: string; replied: boolean; flagged_fake: boolean };
  const now = Date.now();
  const byStore: Record<string, Review[]> = {};
  for (const s of stores) byStore[s.name] = [];
  for (const r of (data ?? []) as unknown as RvRow[]) {
    byStore[fullName(r.store_id)].push({
      author: r.author,
      rating: r.rating,
      text: r.body,
      days: Math.max(0, Math.round((now - new Date(r.created_at).getTime()) / 86400000)),
      flagged: r.flagged_fake,
    });
  }
  const rows = (data ?? []) as unknown as RvRow[];
  return {
    reputation,
    findability,
    byStore,
    suspectedFakes: rows.filter((r) => r.flagged_fake).length,
    unanswered: rows.filter((r) => !r.replied && r.rating <= 3).length,
  };
}

// ── public: every agent action with its plan key (AI actions page) ──────────
export type ActionWithPlan = AgentAction & { planKey: string };
export async function getAllAgentActions(): Promise<ActionWithPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select("id, store_id, store_label, agent, title, detail, metric, status, result, pending, plan_key")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`agent_actions read failed: ${error.message}`);
  type R = RawAction & { plan_key: string };
  return ((data ?? []) as unknown as R[]).map((a) => ({ ...toAction(a), planKey: a.plan_key }));
}
