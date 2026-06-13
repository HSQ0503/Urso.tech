// Server-only data access. Reads real rows from Supabase and returns them in the
// same shapes the mock data layer used, so pages swap mock → real with minimal
// change. Pulls in next/headers via the Supabase server client, so this must
// NEVER be imported by a client component.

import { createClient } from "@/lib/supabase/server";
import {
  stores,
  STORE_OPTIONS,
  scopeLabel,
  COMPARE_METRICS,
  type CompareMode,
  type ComparePreset,
  type CompareFormat,
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
  type TeamRow,
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

const isYear = (month: MonthValue) => /^\d{4}$/.test(month);

function monthRange(month: MonthValue): { start: string; end: string } | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (month === "all") {
    // "Last 12 months" = a trailing window, NOT all history — staging reaches
    // back to 2024, so an unbounded read would overshoot the label.
    const today = nyToday();
    const [y, m] = today.split("-").map(Number);
    const sy = m === 12 ? y : y - 1;
    const sm = m === 12 ? 1 : m + 1;
    return { start: `${sy}-${pad(sm)}-01`, end: addDays(today, 1) };
  }
  if (isYear(month)) {
    const y = Number(month);
    return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  }
  const [y, m] = month.split("-").map(Number);
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
  const [{ data, error }, roles] = await Promise.all([
    supabase
      .from("groomers")
      .select("id, store_id, name, flag, rev_per_hr, appts, rebook, attach, util, avg_ticket")
      .order("rev_per_hr", { ascending: false }),
    loadStaffRoles(),
  ]);
  if (error) throw new Error(`groomers read failed: ${error.message}`);
  type GRow = { id: string; store_id: StoreId; name: string; flag: "star" | "coach" | null; rev_per_hr: number; appts: number; rebook: number; attach: number; util: number; avg_ticket: number };
  return ((data ?? []) as unknown as GRow[])
    .filter((g) => (roles.get(staffNameKey(g.name)) ?? "groomer") === "groomer")
    .map((g) => ({
      id: g.id, name: g.name, store: fullName(g.store_id), revPerHr: Number(g.rev_per_hr), appts: g.appts,
      rebook: Number(g.rebook), attach: Number(g.attach), avgTicket: Number(g.avg_ticket), util: Number(g.util),
      flag: g.flag ?? undefined,
    }));
}

// Mirrors staff_name_key() in migration 0016.
function staffNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// FranPOS SalesPerson is free text — the staff table classifies each name as
// groomer / front_desk / vendor / system so front desks ringing nail trims
// don't rank as groomers. Unknown names default to groomer (new hires appear
// without a deploy). Tolerant of the table not existing yet (pre-0016).
async function loadStaffRoles(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").select("name_key, role");
  if (error) return new Map();
  return new Map((data ?? []).map((s: { name_key: string; role: string }) => [s.name_key, s.role]));
}

const NEXT_ACTION: Record<CustomerSegment, string> = {
  VIP: "Offer standing appointment", Loyal: "Confirm next groom", "At risk": "Send rebooking link", Lapsed: "Reactivation offer", Dormant: "Seasonal reactivation only",
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
// FranPOS history starts 2024-01-01, so January 2024 has no honest prior
// period. The backward-90-day return rate is only mature once a full 90 days
// of history sit behind the comparison month. A null delta means "no honest
// prior period" and the chip is hidden.
const FIRST_FULL_MONTH = "2024-01-01";
const RETURN_RATE_MATURE = "2024-04-01";

export type KpiDeltas = {
  revenue: number | null; bookings: number | null; avgTicket: number | null;
  rebook: number | null; attach: number | null; groomingShare: number | null;
};
const NULL_DELTAS: KpiDeltas = { revenue: null, bookings: null, avgTicket: null, rebook: null, attach: null, groomingShare: null };

const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Same date one year earlier (Feb 29 clamps to Feb 28).
const yearBack = (iso: string) => {
  const s = `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
  return s.endsWith("-02-29") ? `${s.slice(0, 8)}28` : s;
};

export async function getKpiDeltas(scope: Scope, month: MonthValue): Promise<KpiDeltas> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = nyToday();
  let curStart: string, curEnd: string, prevStart: string, prevEnd: string;
  if (month === "all" || isYear(month)) {
    // Year-shaped periods compare against the same window one year earlier.
    const range = monthRange(month)!;
    curStart = range.start; curEnd = range.end;
    prevStart = yearBack(curStart); prevEnd = yearBack(curEnd);
    if (prevStart < FIRST_FULL_MONTH) return NULL_DELTAS;
  } else {
    const [y, m] = month.split("-").map(Number);
    prevStart = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
    if (prevStart < FIRST_FULL_MONTH) return NULL_DELTAS;

    curStart = `${y}-${pad(m)}-01`;
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
// recorded history (starts 2024-01-01). walkIn = revenue on the stores' house
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
// Unnamed rows ("—") are excluded from people-facing lists: you can't greet or
// call a customer without a name, and the heaviest unnamed rows are house
// accounts the walk-in heuristic missed. Counts stay exact — only display
// lists filter.
export async function getCustomersByValue(scope: Scope): Promise<CustomerRow[]> {
  const supabase = await createClient();
  let q = supabase.from("customers").select(CUSTOMER_COLS).gte("visits", 1).neq("name", "—").order("ltv", { ascending: false }).limit(12);
  if (scope !== "all") q = q.eq("store_id", scope);
  const { data, error } = await q;
  if (error) throw new Error(`customers read failed: ${error.message}`);
  return ((data ?? []) as unknown as CustRow[]).map(toCustomerRow);
}
export async function getCustomerSegments(scope: Scope) {
  const counts = await loadSegmentCounts(scope);
  const order: CustomerSegment[] = ["VIP", "Loyal", "At risk", "Lapsed", "Dormant"];
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
// (DB count of every actionable lapse); the displayed list is the 60 with the
// most value at risk. At risk + Lapsed only — once migration 0014 lands,
// >365-day churn is Dormant and drops out of this pool by construction.
export async function getWinbackList(scope: Scope) {
  const supabase = await createClient();
  let countQ = supabase.from("customers").select("*", { count: "exact", head: true }).gte("visits", 1).in("segment", ["At risk", "Lapsed"]);
  let listQ = supabase.from("customers").select(CUSTOMER_COLS).gte("visits", 1).neq("name", "—").in("segment", ["At risk", "Lapsed"]).order("ltv", { ascending: false }).limit(60);
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
    .eq("store_id", store).gte("visits", 1).neq("name", "—").in("segment", ["At risk", "Lapsed"])
    .order("ltv", { ascending: false }).limit(60);
  if (error) throw new Error(`customers read failed: ${error.message}`);
  return ((data ?? []) as unknown as CustRow[]).map(toCustomerRow);
}
// Retention aggregates — all real now. Cohort, cadence, returning share and
// one-and-done are trailing measures over the full recorded history (history
// starts 2024-01-01); the return rate honors the month filter like every other
// metric. The 90-day guards in the SQL keep censoring honest: a customer only
// counts as returning or one-and-done once they have had 90 days to come back.
export async function getRetention(scope: Scope, month: MonthValue) {
  const supabase = await createClient();
  const ids = scopeIds(scope);
  const [m, summary, cohortRows, gapRows, wb] = await Promise.all([
    getMetrics(scope, month),
    supabase.rpc("retention_summary", { p_store_ids: ids }),
    supabase.from("cohort_monthly").select("month_offset, eligible, retained").in("store_id", ids),
    supabase.from("grooming_gap_buckets").select("bucket, gaps").in("store_id", ids),
    getWinbackList(scope),
  ]);
  if (summary.error) throw new Error(`retention_summary failed: ${summary.error.message}`);
  if (cohortRows.error) throw new Error(`cohort_monthly read failed: ${cohortRows.error.message}`);
  if (gapRows.error) throw new Error(`grooming_gap_buckets read failed: ${gapRows.error.message}`);
  type S = { total_customers: number; eligible90: number; returning90: number; one_and_done90: number; avg_cadence_days: number; cycle_customers: number; recurring60: number };
  const s = ((summary.data ?? []) as unknown as S[])[0];
  const eligible = Number(s?.eligible90 ?? 0);
  const returningPct = eligible ? Number(s.returning90) / eligible : 0;

  // Grooming cycle: 1-day gap buckets (capped at 127 = "18+ weeks") summed
  // across the scope. Exact median below the cap; display buckets for the
  // histogram. Cycle gaps are grooming-visit-to-grooming-visit — retail-only
  // stops don't reset the clock.
  type G = { bucket: number; gaps: number };
  const byDay = new Map<number, number>();
  for (const r of (gapRows.data ?? []) as unknown as G[]) {
    byDay.set(Number(r.bucket), (byDay.get(Number(r.bucket)) ?? 0) + Number(r.gaps));
  }
  const totalGaps = [...byDay.values()].reduce((a, b) => a + b, 0);
  let medianDays = 0;
  {
    let cum = 0;
    for (const d of [...byDay.keys()].sort((x, y) => x - y)) {
      cum += byDay.get(d)!;
      if (cum >= totalGaps / 2) {
        medianDays = d;
        break;
      }
    }
  }
  const CYCLE_BUCKETS = [
    { label: "≤2 wk", lo: 1, hi: 14 },
    { label: "2–4 wk", lo: 15, hi: 28 },
    { label: "4–6 wk", lo: 29, hi: 42 },
    { label: "6–8 wk", lo: 43, hi: 56 },
    { label: "8–10 wk", lo: 57, hi: 70 },
    { label: "10–13 wk", lo: 71, hi: 90 },
    { label: "13–18 wk", lo: 91, hi: 126 },
    { label: "18+ wk", lo: 127, hi: 127 },
  ];
  const histogram = CYCLE_BUCKETS.map((bk) => {
    let n = 0;
    for (const [d, c] of byDay) if (d >= bk.lo && d <= bk.hi) n += c;
    return { label: bk.label, value: totalGaps ? n / totalGaps : 0 };
  });
  const cycleCustomers = Number(s?.cycle_customers ?? 0);
  const cycle = {
    medianDays,
    histogram,
    gapCount: totalGaps,
    recurringCount: Number(s?.recurring60 ?? 0),
    recurringPct: cycleCustomers ? Number(s.recurring60) / cycleCustomers : 0,
    cycleCustomers,
  };

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
    cycle,
  };
}

// Return rate by month over the trailing year — the Customers page trend line.
// Reads the metrics_monthly RPC (migration 0014) and aggregates the scope in
// JS (≤48 rows). Returns null until that migration is applied, so the page
// ships ahead of the DB and the card simply doesn't render yet.
export async function getReturnRateTrend(scope: Scope): Promise<{ label: string; value: number }[] | null> {
  const supabase = await createClient();
  const range = monthRange("all")!;
  const { data, error } = await supabase.rpc("metrics_monthly", { p_start: range.start, p_end: range.end });
  if (error) return null;
  type Row = { store_id: StoreId; month: string; rebooks: number; identified_bookings: number };
  const ids = new Set(scopeIds(scope));
  const byMonth = new Map<string, { rebooks: number; identified: number }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!ids.has(r.store_id)) continue;
    const m = byMonth.get(r.month) ?? { rebooks: 0, identified: 0 };
    m.rebooks += Number(r.rebooks);
    m.identified += Number(r.identified_bookings);
    byMonth.set(r.month, m);
  }
  const out = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .filter(([, v]) => v.identified > 0)
    .map(([month, v]) => ({
      label: new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      value: Math.round((v.rebooks / v.identified) * 1000) / 10,
    }));
  return out.length > 1 ? out : null;
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

  const brief: WeeklyBrief = {
    headline: `Revenue ${revD >= 0 ? "rose" : "eased"} to ${money(Math.round(a.rev))} ${here} this week, and ${lever} is the clearest opportunity to act on.`,
    changes,
    wins: wins.length ? wins : ["Performance held steady across the headline metrics."],
    risks: risks.length ? risks : ["No metric moved materially in the wrong direction."],
    opportunity,
    actionsCompleted: actions.filter((a) => a.status === "completed").length,
    actionsOpen: actions.filter((a) => a.status !== "completed").length,
    recommendation: opportunity.title,
  };

  // If the Monday AI run wrote a fresh narrative for this scope, it replaces
  // the template prose — the computed `changes` numbers above always stay.
  const supabase = await createClient();
  const { data: ai } = await supabase
    .from("ai_briefs")
    .select("week_start, headline, wins, risks, opportunity, recommendation")
    .eq("scope", scope)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ai && ai.week_start >= addDays(today, -8)) {
    type AiBrief = { headline: string; wins: string[]; risks: string[]; opportunity: { title: string; detail: string } | null; recommendation: string | null };
    const n = ai as unknown as AiBrief;
    brief.headline = n.headline;
    if (n.wins?.length) brief.wins = n.wins;
    if (n.risks?.length) brief.risks = n.risks;
    if (n.opportunity?.title) brief.opportunity = n.opportunity;
    if (n.recommendation) brief.recommendation = n.recommendation;
  }
  return brief;
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

// Team page roster: period-scoped service revenue per groomer (the metric the
// page ranks by while labour hours are unavailable), joined with the lifetime
// return/attach shares from the groomers table where they exist.
export async function getTeamRoster(scope: Scope, month: MonthValue): Promise<TeamRow[]> {
  const supabase = await createClient();
  const range = monthRange(month);
  const [{ data, error }, lifetime, roles] = await Promise.all([
    supabase.rpc("groomer_revenue", {
      p_store_ids: scopeIds(scope), p_start: range?.start ?? null, p_end: range?.end ?? null,
    }),
    loadGroomers(),
    loadStaffRoles(),
  ]);
  if (error) throw new Error(`groomer_revenue failed: ${error.message}`);
  const byKey = new Map(lifetime.map((g) => [`${g.store}|${staffNameKey(g.name)}`, g]));
  type Row = { store_id: StoreId; name: string; revenue: number; appts: number };
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => (roles.get(staffNameKey(r.name)) ?? "groomer") === "groomer")
    .map((r) => {
      const g = byKey.get(`${fullName(r.store_id)}|${staffNameKey(r.name)}`);
      const revenue = Math.round(Number(r.revenue));
      const appts = Number(r.appts);
      return {
        id: `${r.store_id}:${staffNameKey(r.name).replace(/ /g, "-")}`,
        name: r.name,
        store: fullName(r.store_id),
        revenue,
        appts,
        avgTicket: appts ? Math.round(revenue / appts) : 0,
        share: 0,
        rebook: g?.rebook ?? null,
        attach: g?.attach ?? null,
        flag: g?.flag,
      };
    })
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  for (const r of rows) r.share = total ? r.revenue / total : 0;
  return rows;
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
  const monthly = month === "all" || isYear(month);
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
  const days = month === "all" || isYear(month) ? 365 : 30;
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

// ── public: comparison engine (Compare page) ─────────────────────────────────
// One comparison = an entity set (stores | groomers | products) × one metric ×
// period A vs period B. Ranges are INCLUSIVE calendar dates in the URL and UI;
// queries convert to exclusive ends. Period A is the focus period, B is the
// baseline — deltas read (A − B) / B (or percentage points for rate metrics).

export const DATA_START = "2024-01-01"; // first day of FranPOS history

// Date-picker bounds: recorded history through the last complete day.
export const compareBounds = () => ({ min: DATA_START, max: addDays(nyToday(), -1) });

export type CompareRange = { start: string; end: string }; // inclusive
const exclusiveEnd = (r: CompareRange) => addDays(r.end, 1);
const isoDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const rangeDays = (r: CompareRange) => isoDays(r.start, r.end) + 1;
const shiftYear = (iso: string, years: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years); // Feb 29 rolls to Mar 1 — acceptable
  return d.toISOString().slice(0, 10);
};

function parseRangeParam(raw?: string | null): CompareRange | null {
  const m = raw?.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  if (Number.isNaN(Date.parse(m[1])) || Number.isNaN(Date.parse(m[2]))) return null;
  return m[1] <= m[2] ? { start: m[1], end: m[2] } : { start: m[2], end: m[1] };
}

// Resolve a preset (or custom params) into a focus period + 1–3 baseline
// periods, with honesty notes. Completed days only: "this month" means the 1st
// through yesterday, compared like-for-like against the same day-span — never
// a partial vs a full month. bs[0] is the PRIMARY baseline (all deltas,
// insights and movers read against it); bs[1..] are extra context periods —
// "years" builds the same window across every year on record, and custom mode
// accepts up to three comma-separated baseline ranges in ?b=.
export const MAX_BASELINES = 3;
export function resolveCompareRanges(preset: ComparePreset, aRaw?: string, bRaw?: string): { a: CompareRange; bs: CompareRange[]; warnings: string[] } {
  const warnings: string[] = [];
  const today = nyToday();
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;

  // The shared focus period: this month's completed days (or, on the 1st of a
  // month, the whole previous month).
  const focus: CompareRange =
    monthStart > yesterday ? { start: prevMonthStart, end: addDays(monthStart, -1) } : { start: monthStart, end: yesterday };

  let a: CompareRange;
  let bs: CompareRange[];
  if (preset === "custom") {
    const pa = parseRangeParam(aRaw);
    const pbs = (bRaw ?? "").split(",").map(parseRangeParam).filter((r): r is CompareRange => r != null);
    if (pa && pbs.length) {
      a = pa;
      bs = pbs.slice(0, MAX_BASELINES);
    } else {
      warnings.push("Custom dates were missing or invalid — showing this month vs last month instead.");
      ({ a, bs } = resolveCompareRanges("mom"));
    }
  } else if (preset === "30d") {
    a = { start: addDays(yesterday, -29), end: yesterday };
    bs = [{ start: addDays(yesterday, -59), end: addDays(yesterday, -30) }];
  } else if (preset === "years") {
    // The focus window against the same calendar window in every prior year
    // with recorded history — "this June vs last June vs the June before".
    a = focus;
    bs = [];
    for (let y = 1; y <= MAX_BASELINES; y++) {
      const shifted = { start: shiftYear(a.start, -y), end: shiftYear(a.end, -y) };
      if (shifted.end < DATA_START) break;
      bs.push(shifted);
    }
    if (!bs.length) {
      warnings.push("No prior-year data exists for this window yet — showing this month vs last month instead.");
      ({ a, bs } = resolveCompareRanges("mom"));
    }
  } else {
    a = focus;
    bs = [
      preset === "yoy"
        ? { start: shiftYear(a.start, -1), end: shiftYear(a.end, -1) }
        : monthStart > yesterday
          ? { start: `${addDays(prevMonthStart, -1).slice(0, 7)}-01`, end: addDays(prevMonthStart, -1) }
          : { start: prevMonthStart, end: addDays(prevMonthStart, rangeDays(a) - 1) },
    ];
  }

  if (a.start < DATA_START || bs.some((b) => b.start < DATA_START)) {
    const startLabel = new Date(`${DATA_START}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    warnings.push(`Recorded history starts ${startLabel} — days before that count as zero, so totals for the clipped period under-report.`);
  }
  if (a.end > yesterday || bs.some((b) => b.end > yesterday)) {
    warnings.push("A period extends past the last complete day — today's sales land after the evening sync.");
  }
  const offLength = bs.find((b) => rangeDays(b) !== rangeDays(a));
  if (offLength) {
    warnings.push(`The periods differ in length (${rangeDays(a)} vs ${rangeDays(offLength)} days) — totals aren't like-for-like; check the per-day figures.`);
  }
  return { a, bs, warnings };
}

// Row values: `a` is the focus period, `b` the PRIMARY baseline (bs[0] — all
// deltas/insights/movers read against it), `more` the values for any extra
// baselines (bs[1..]), oldest last, used for context columns/series only.
export type CompareRow = { key: string; name: string; tag?: string; a: number | null; b: number | null; more?: (number | null)[] };
export type CompareData = {
  rows: CompareRow[];
  format: CompareFormat;
  metricLabel: string;
  pointDelta: boolean; // rate metrics: deltas read as percentage points, not relative %
  revenue: { a: number; bs: number[] };
  days: { a: number; bs: number[] };
  pace?: { a: number[]; bs: number[][] }; // daily revenue per period (stores mode) for the running-total overlay
  movers?: { name: string; delta: number }[]; // products mode: biggest gains + drops across ALL items, noise filtered
  insights: string[];
  notes: string[];
};

const fmtVal = (n: number, format: CompareFormat) =>
  format === "money" ? money(Math.round(n)) : format === "pct" ? pctStr(n) : Math.round(n).toLocaleString();

// Plain-English takeaways, deterministic and guarded: movers must clear a
// volume floor so a $40 item "up 600%" never headlines, and rate metrics are
// described in percentage points.
function buildInsights(rows: CompareRow[], format: CompareFormat, metricLabel: string, revenue: { a: number; bs: number[] }, days: { a: number; bs: number[] }): string[] {
  const out: string[] = [];
  const rb = revenue.bs[0] ?? 0;
  const db = days.bs[0] ?? 0;
  if (rb > 0) {
    if (days.a === db) {
      const d = (revenue.a - rb) / rb;
      out.push(`Revenue is ${d >= 0 ? "up" : "down"} ${pctStr(Math.abs(d))} — ${money(Math.round(revenue.a))} vs ${money(Math.round(rb))}.`);
    } else {
      const pa = revenue.a / days.a;
      const pb = rb / db;
      const d = (pa - pb) / pb;
      out.push(`Per day, revenue is ${d >= 0 ? "up" : "down"} ${pctStr(Math.abs(d))} — ${money(Math.round(pa))}/day vs ${money(Math.round(pb))}/day (periods differ in length).`);
    }
  }
  // Multi-year arc: the revenue progression oldest → newest in one line.
  if (revenue.bs.length >= 2) {
    const sameLen = days.bs.every((d) => d === days.a);
    const series = [...revenue.bs].reverse().concat(revenue.a);
    const daysSeries = [...days.bs].reverse().concat(days.a);
    const arc = series.map((v, i) => money(Math.round(sameLen ? v : v / Math.max(1, daysSeries[i])))).join(" → ");
    out.push(`The arc across all ${series.length} periods, oldest first: ${arc}${sameLen ? "" : " per day"}.`);
  }
  const floor = format === "money" ? 250 : format === "number" ? 10 : 0;
  const movers = rows
    .filter((r) => r.a != null && r.b != null && r.b > 0 && (format === "pct" || (r.a ?? 0) + (r.b ?? 0) >= floor))
    .map((r) => ({ ...r, d: format === "pct" ? (r.a! - r.b!) : (r.a! - r.b!) / r.b! }))
    .sort((x, y) => y.d - x.d);
  const describe = (r: { name: string; a: number | null; b: number | null; d: number }, dir: string) =>
    format === "pct"
      ? `${r.name} ${dir} the most on ${metricLabel.toLowerCase()}: ${pctStr(r.b!)} → ${pctStr(r.a!)} (${r.d >= 0 ? "+" : "−"}${Math.abs(r.d * 100).toFixed(0)} pts).`
      : `${r.name} ${dir} the most: ${fmtVal(r.b!, format)} → ${fmtVal(r.a!, format)} (${r.d >= 0 ? "+" : "−"}${pctStr(Math.abs(r.d))}).`;
  if (movers.length >= 2) {
    const top = movers[0];
    const bottom = movers[movers.length - 1];
    if (top.d > 0.005) out.push(describe(top, format === "pct" ? "improved" : "grew"));
    if (bottom.d < -0.005 && bottom.key !== top.key) out.push(describe(bottom, format === "pct" ? "slipped" : "declined"));
  }
  const fresh = rows.filter((r) => (r.b == null || r.b === 0) && (r.a ?? 0) >= floor).sort((x, y) => (y.a ?? 0) - (x.a ?? 0))[0];
  if (fresh && format !== "pct") out.push(`${fresh.name} is new this period — ${fmtVal(fresh.a!, format)}, nothing in the comparison period.`);
  return out.slice(0, 4);
}

// One store-mode metric on one aggregate — shared by the single-metric rows
// and the all-metrics overview so the definitions can never drift apart.
function storeMetricValue(key: string, x: Agg): number | null {
  switch (key) {
    case "revenue": return x.rev;
    case "bookings": return x.bookings;
    case "avgTicket": return x.bookings ? x.bookingRev / x.bookings : null;
    case "rebook": return x.identified ? x.rebooks / x.identified : null;
    case "attach": return x.bookings ? x.attached / x.bookings : null;
    default: return x.groom + x.retail > 0 ? x.groom / (x.groom + x.retail) : null;
  }
}

// "All metrics" overview: every metric for the mode, aggregated over the scope,
// one value per period (side order: focus, then baselines newest → oldest).
// Same RPCs and formulas as the single-metric view — only the entity axis is
// collapsed, so a number here always matches its drill-down.
export type CompareOverview = {
  revenue: { a: number; bs: number[] };
  days: { a: number; bs: number[] };
  metrics: { key: string; label: string; format: CompareFormat; values: (number | null)[] }[];
};

export async function getCompareOverview(mode: CompareMode, a: CompareRange, bs: CompareRange[], scope: Scope): Promise<CompareOverview> {
  const periods = [a, ...bs];
  const byPeriod = await Promise.all(periods.map((r) => loadDailyRange(r.start, exclusiveEnd(r))));
  const ids = scopeIds(scope);
  const revenue = { a: sumScope(byPeriod[0], ids).rev, bs: byPeriod.slice(1).map((by) => sumScope(by, ids).rev) };
  const days = { a: rangeDays(a), bs: bs.map(rangeDays) };

  let metrics: CompareOverview["metrics"];
  if (mode === "stores") {
    const aggs = byPeriod.map((by) => sumScope(by, ids));
    metrics = COMPARE_METRICS.stores.map((def) => ({ ...def, values: aggs.map((x) => storeMetricValue(def.key, x)) }));
  } else if (mode === "groomers") {
    const supabase = await createClient();
    const results = await Promise.all(periods.map((r) => supabase.rpc("groomer_revenue", { p_store_ids: ids, p_start: r.start, p_end: exclusiveEnd(r) })));
    const failed = results.find((r) => r.error);
    if (failed) throw new Error(`groomer_revenue failed: ${failed.error!.message}`);
    type Row = { revenue: number; appts: number };
    const totals = results.map((res) => {
      const rows = (res.data ?? []) as unknown as Row[];
      return { rev: rows.reduce((s, r) => s + Number(r.revenue), 0), appts: rows.reduce((s, r) => s + Number(r.appts), 0) };
    });
    metrics = COMPARE_METRICS.groomers.map((def) => ({
      ...def,
      values: totals.map((t) => (def.key === "revenue" ? t.rev : def.key === "appts" ? t.appts : t.appts ? t.rev / t.appts : null)),
    }));
  } else {
    const supabase = await createClient();
    const results = await Promise.all(periods.map((r) => supabase.rpc("product_revenue_by_name", { p_store_ids: ids, p_start: r.start, p_end: exclusiveEnd(r) })));
    const failed = results.find((r) => r.error);
    if (failed) throw new Error(`product_revenue_by_name failed: ${failed.error!.message}`);
    type Row = { is_service: boolean; revenue: number; units: number; cost: number };
    const totals = results.map((res) => {
      const rows = (res.data ?? []) as unknown as Row[];
      const retail = rows.filter((r) => !r.is_service && Number(r.cost) > 0 && Number(r.revenue) > 0);
      const retailRev = retail.reduce((s, r) => s + Number(r.revenue), 0);
      const retailCost = retail.reduce((s, r) => s + Number(r.cost), 0);
      return {
        rev: rows.reduce((s, r) => s + Number(r.revenue), 0),
        units: rows.reduce((s, r) => s + Number(r.units), 0),
        margin: retailRev > 0 ? (retailRev - retailCost) / retailRev : null,
      };
    });
    metrics = COMPARE_METRICS.products.map((def) => ({
      ...def,
      values: totals.map((t) => (def.key === "revenue" ? t.rev : def.key === "units" ? t.units : t.margin)),
    }));
  }
  return { revenue, days, metrics };
}

export async function getCompareData(mode: CompareMode, metricKey: string, a: CompareRange, bs: CompareRange[], scope: Scope): Promise<CompareData> {
  const metric = COMPARE_METRICS[mode].find((m) => m.key === metricKey) ?? COMPARE_METRICS[mode][0];
  const periods = [a, ...bs]; // side 0 = focus, side 1 = primary baseline, 2.. = extra context
  const days = { a: rangeDays(a), bs: bs.map(rangeDays) };
  const notes: string[] = [];
  let rows: CompareRow[] = [];
  let movers: { name: string; delta: number }[] | undefined;

  // The headline revenue strip always reads metrics_daily (the canonical,
  // validated total) — never sums of the capped/attributed RPC rows.
  const byPeriod = await Promise.all(periods.map((r) => loadDailyRange(r.start, exclusiveEnd(r))));
  const revIds = scopeIds(mode === "stores" ? "all" : scope);
  const revenue = { a: sumScope(byPeriod[0], revIds).rev, bs: byPeriod.slice(1).map((by) => sumScope(by, revIds).rev) };

  // Stores mode also gets a day-by-day revenue overlay ("pace"). The series RPC
  // only returns days with rows, so gaps are densified to zero to keep day
  // indexes aligned between the periods.
  let pace: { a: number[]; bs: number[][] } | undefined;
  if (mode === "stores") {
    const supabase = await createClient();
    const series = (r: CompareRange) =>
      supabase.rpc("metrics_series", { p_store_ids: revIds, p_start: r.start, p_end: exclusiveEnd(r), p_monthly: false });
    const results = await Promise.all(periods.map(series));
    if (results.every((r) => !r.error)) {
      type SRow = { bucket: string; revenue: number };
      const dense = (r: CompareRange, rs: SRow[]) => {
        const byDay = new Map(rs.map((x) => [x.bucket, Number(x.revenue)]));
        const out: number[] = [];
        for (let d = r.start; d <= r.end; d = addDays(d, 1)) out.push(byDay.get(d) ?? 0);
        return out;
      };
      const lines = results.map((res, i) => dense(periods[i], (res.data ?? []) as unknown as SRow[]));
      pace = { a: lines[0], bs: lines.slice(1) };
    }
  }

  // helper: assemble a/b/more from one value per side (side 0 = focus)
  const pack = (vals: (number | null)[]) => ({ a: vals[0], b: vals[1] ?? null, more: vals.length > 2 ? vals.slice(2) : undefined });

  if (mode === "stores") {
    const val = (x: Agg) => storeMetricValue(metric.key, x);
    rows = stores.map((s) => ({ key: s.id, name: s.name, ...pack(byPeriod.map((by) => val(by[s.id]))) }));
    if (metric.key === "rebook" && periods.some((r) => r.start < RETURN_RATE_MATURE)) {
      notes.push("Return rate needs 90 days of history behind it — periods before Apr 2024 read low by construction.");
    }
  } else if (mode === "groomers") {
    const supabase = await createClient();
    const ids = scopeIds(scope);
    const call = (r: CompareRange) => supabase.rpc("groomer_revenue", { p_store_ids: ids, p_start: r.start, p_end: exclusiveEnd(r) });
    const results = await Promise.all(periods.map(call));
    const failed = results.find((r) => r.error);
    if (failed) throw new Error(`groomer_revenue failed: ${failed.error!.message}`);
    type Row = { store_id: StoreId; name: string; revenue: number; appts: number };
    const merged = new Map<string, { name: string; tag: string; sides: (Row | undefined)[] }>();
    results.forEach((res, side) => {
      for (const r of (res.data ?? []) as unknown as Row[]) {
        const key = `${r.store_id}|${r.name}`;
        const e = merged.get(key) ?? { name: r.name, tag: scopeLabel(r.store_id), sides: [] };
        e.sides[side] = r;
        merged.set(key, e);
      }
    });
    const val = (r?: Row): number | null => {
      if (!r) return null;
      if (metric.key === "revenue") return Number(r.revenue);
      if (metric.key === "appts") return Number(r.appts);
      return Number(r.appts) ? Number(r.revenue) / Number(r.appts) : null;
    };
    const ranked = [...merged.entries()]
      .map(([key, e]) => ({ key, e, vol: e.sides.reduce((s, r) => s + Number(r?.revenue ?? 0), 0) }))
      .sort((x, y) => y.vol - x.vol);
    rows = ranked
      .slice(0, 12)
      .map(({ key, e }) => ({ key, name: e.name, tag: scope === "all" ? e.tag : undefined, ...pack(periods.map((_, i) => val(e.sides[i]))) }));
    const cut = ranked.length > rows.length ? ` Showing top 12 of ${ranked.length} groomers active across the periods.` : "";
    notes.push(`Groomer figures are service-line revenue attributed by FranPOS salesperson — grooming only; front-desk, vendor, and system accounts excluded.${cut} A dash means no activity in that period (new hire or departure).`);
  } else {
    const supabase = await createClient();
    const ids = scopeIds(scope);
    const call = (r: CompareRange) => supabase.rpc("product_revenue_by_name", { p_store_ids: ids, p_start: r.start, p_end: exclusiveEnd(r) });
    const results = await Promise.all(periods.map(call));
    const failed = results.find((r) => r.error);
    if (failed) throw new Error(`product_revenue_by_name failed: ${failed.error!.message}`);
    type Row = { name: string; is_service: boolean; revenue: number; units: number; cost: number };
    const merged = new Map<string, { name: string; svc: boolean; sides: (Row | undefined)[] }>();
    results.forEach((res, side) => {
      for (const r of (res.data ?? []) as unknown as Row[]) {
        const key = r.name.trim().toLowerCase();
        const e = merged.get(key) ?? { name: r.name, svc: r.is_service, sides: [] };
        e.sides[side] = r;
        merged.set(key, e);
      }
    });
    const margin = (r?: Row): number | null =>
      r && Number(r.revenue) > 0 && Number(r.cost) > 0 ? (Number(r.revenue) - Number(r.cost)) / Number(r.revenue) : null;
    const val = (r?: Row): number | null => {
      if (!r) return null;
      if (metric.key === "revenue") return Number(r.revenue);
      if (metric.key === "units") return Number(r.units);
      return margin(r);
    };
    let entries = [...merged.entries()].map(([key, e]) => ({
      key, name: e.name, tag: e.svc ? "Grooming" : "Retail", svc: e.svc,
      ...pack(periods.map((_, i) => val(e.sides[i]))),
      vol: e.sides.reduce((s, r) => s + Number(r?.revenue ?? 0), 0),
    }));
    if (metric.key === "margin") {
      // Margin only means something for retail (services carry no item cost),
      // and tiny sellers produce noisy percentages — floor at $250 combined.
      entries = entries.filter((e) => !e.svc && e.vol >= 250);
      notes.push("Margin compares retail items only (services carry no item cost) with at least $250 of combined revenue.");
    }
    // Winners & losers: the biggest MOVES across every item (not the biggest
    // sellers — a top seller that barely moved is not a story). Small changes
    // are floored out so the chart never fills with −$5 noise rows.
    const moveFloor = metric.key === "margin" ? 0.01 : metric.key === "units" ? 5 : 50;
    const moved = entries
      .map((e) => ({ name: e.name, delta: (e.a ?? 0) - (e.b ?? 0) }))
      .filter((m) => Math.abs(m.delta) >= moveFloor)
      .sort((x, y) => y.delta - x.delta);
    movers = moved.length > 12 ? [...moved.slice(0, 6), ...moved.slice(-6)] : moved;
    rows = entries
      .sort((x, y) => y.vol - x.vol)
      .slice(0, 12)
      .map((e) => ({ key: e.key, name: e.name, tag: e.tag, a: e.a, b: e.b, more: e.more }));
    notes.push("Table: top 12 items by volume. Deposits and gift cards are excluded (liabilities until redeemed); items merge by name.");
  }

  rows.sort((x, y) => (y.a ?? -1) - (x.a ?? -1));
  return {
    rows,
    format: metric.format,
    metricLabel: metric.label,
    pointDelta: metric.format === "pct",
    revenue,
    days,
    pace,
    movers,
    insights: buildInsights(rows, metric.format, metric.label, revenue, days),
    notes,
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
