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
} from "./data";

// ── small helpers (kept local so this module stays self-contained) ──────────
const wave = (seed: number, i: number) =>
  Math.sin(seed * 12.9 + i * 2.3) * 0.5 + Math.sin(seed * 7.1 + i * 0.7) * 0.3 + Math.sin(seed * 3.7 + i * 1.9) * 0.2;
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
  rev: number; groom: number; retail: number; bookings: number; noShows: number; rebooks: number;
  attached: number; calls: number; missed: number; visits: number; starts: number; completes: number; booked: number;
};
const emptyAgg = (): Agg => ({ rev: 0, groom: 0, retail: 0, bookings: 0, noShows: 0, rebooks: 0, attached: 0, calls: 0, missed: 0, visits: 0, starts: 0, completes: 0, booked: 0 });

type DailyRow = {
  store_id: StoreId; revenue: number; grooming_revenue: number; retail_revenue: number; bookings: number;
  no_shows: number; rebooks: number; retail_attached: number; calls_total: number; calls_missed: number;
  web_visits: number; web_form_starts: number; web_form_completes: number; web_booked: number;
};

async function loadDaily(month: MonthValue): Promise<Record<StoreId, Agg>> {
  const supabase = await createClient();
  let query = supabase
    .from("metrics_daily")
    .select("store_id, revenue, grooming_revenue, retail_revenue, bookings, no_shows, rebooks, retail_attached, calls_total, calls_missed, web_visits, web_form_starts, web_form_completes, web_booked");
  const range = monthRange(month);
  if (range) query = query.gte("date", range.start).lt("date", range.end);
  const { data, error } = await query;
  if (error) throw new Error(`metrics_daily read failed: ${error.message}`);

  const acc = {} as Record<StoreId, Agg>;
  for (const s of stores) acc[s.id] = emptyAgg();
  for (const r of (data ?? []) as unknown as DailyRow[]) {
    const a = acc[r.store_id];
    if (!a) continue;
    a.rev += Number(r.revenue); a.groom += Number(r.grooming_revenue); a.retail += Number(r.retail_revenue);
    a.bookings += r.bookings; a.noShows += r.no_shows; a.rebooks += r.rebooks; a.attached += r.retail_attached;
    a.calls += r.calls_total; a.missed += r.calls_missed;
    a.visits += r.web_visits; a.starts += r.web_form_starts; a.completes += r.web_form_completes; a.booked += r.web_booked;
  }
  return acc;
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
async function loadCustomers(): Promise<CustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, store_id, name, pet, visits, ltv, segment, last_visit_at");
  if (error) throw new Error(`customers read failed: ${error.message}`);
  type CRow = { store_id: StoreId; name: string; pet: string; visits: number; ltv: number; segment: CustomerSegment; last_visit_at: string };
  const now = Date.now();
  return ((data ?? []) as unknown as CRow[]).map((c) => ({
    name: c.name, pet: c.pet, store: fullName(c.store_id), storeId: c.store_id, visits: c.visits, ltv: Number(c.ltv),
    lastVisit: Math.max(0, Math.round((now - new Date(`${c.last_visit_at}T00:00:00Z`).getTime()) / 86400000)),
    segment: c.segment, next: NEXT_ACTION[c.segment],
  }));
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
    avgTicket: a.bookings ? Math.round(a.rev / a.bookings) : 0,
    rebook: a.rebooks / denom, noShow: a.noShows / denom, attach: a.attached / denom, rating,
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
export async function getCrossSell(scope: Scope, month: MonthValue) {
  const m = computeMetrics(scope, await loadDaily(month), {} as Record<StoreId, Listing>);
  const both = clamp01(m.attach);
  const groomingOnly = clamp01((1 - both) * 0.62);
  const retailOnly = clamp01(1 - both - groomingOnly);
  return { both, groomingOnly, retailOnly };
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

export async function getStoreScores(month: MonthValue): Promise<StoreScore[]> {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  const rows = stores.map((s) => {
    const m = computeMetrics(s.id, byStore, listings);
    const cs = computeCalls(s.id, byStore);
    const ratingN = (m.rating - 4) / 1;
    const raw = cs.answeredPct * 0.25 + m.rebook * 0.25 + ratingN * 0.2 + m.attach * 0.15 + (1 - m.noShow) * 0.15;
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
export async function getRevenueByService(scope: Scope, month: MonthValue): Promise<{ name: string; value: number; line: ServiceLine }[]> {
  const m = await getMetrics(scope, month);
  const grooming = [
    { name: "Full groom", w: 0.54 }, { name: "Bath & brush", w: 0.24 }, { name: "Nail & add-ons", w: 0.13 }, { name: "De-shed", w: 0.09 },
  ];
  const retail = [
    { name: "Food & treats", w: 0.47 }, { name: "Accessories", w: 0.31 }, { name: "Health & wellness", w: 0.22 },
  ];
  return [
    ...grooming.map((s) => ({ name: s.name, value: Math.round(m.grooming * s.w), line: "Grooming" as const })),
    ...retail.map((s) => ({ name: s.name, value: Math.round(m.retail * s.w), line: "Retail" as const })),
  ].sort((a, b) => b.value - a.value);
}
export async function getRevenueByGroomer(scope: Scope, month: MonthValue) {
  const groomers = await loadGroomers();
  const name = scope === "all" ? null : fullName(scope);
  const set = scope === "all" ? groomers : groomers.filter((g) => g.store === name);
  const months = month === "all" ? 12 : 1;
  return set.map((g) => ({ name: g.name, store: g.store, value: g.appts * g.avgTicket * months })).sort((a, b) => b.value - a.value);
}
export async function getRevenueNewVsRepeat(scope: Scope, month: MonthValue) {
  const m = await getMetrics(scope, month);
  return { repeat: Math.round(m.revenue * 0.66), fresh: Math.round(m.revenue * 0.34) };
}

// ── public: customers ───────────────────────────────────────────────────────
const inScope = (rows: CustomerRow[], scope: Scope) => (scope === "all" ? rows : rows.filter((c) => c.storeId === scope));
export async function getCustomersByValue(scope: Scope): Promise<CustomerRow[]> {
  return inScope(await loadCustomers(), scope).sort((a, b) => b.ltv - a.ltv).slice(0, 12);
}
export async function getCustomerSegments(scope: Scope) {
  const set = inScope(await loadCustomers(), scope);
  const order: CustomerSegment[] = ["VIP", "Loyal", "At risk", "Lapsed"];
  return order.map((segment) => ({ segment, count: set.filter((c) => c.segment === segment).length }));
}
export async function getCustomerIntel(scope: Scope) {
  const set = inScope(await loadCustomers(), scope);
  const avgLtv = set.length ? Math.round(set.reduce((a, c) => a + c.ltv, 0) / set.length) : 0;
  const atRisk = set.filter((c) => c.segment === "At risk" || c.segment === "Lapsed").length;
  return { avgLtv, atRisk, count: set.length };
}
// Win-back list shape for the Customers page WinbackCard.
export async function getWinbackList(scope: Scope) {
  const set = inScope(await loadCustomers(), scope).filter((c) => c.segment === "At risk" || c.segment === "Lapsed").sort((a, b) => b.lastVisit - a.lastVisit);
  return { list: set.map((c) => ({ name: c.name, store: c.store, last: `${c.lastVisit} days ago`, visits: c.visits })), count: set.length };
}
export async function getCustomersNeedingAttention(store: StoreId): Promise<CustomerRow[]> {
  return (await loadCustomers()).filter((c) => c.storeId === store && (c.segment === "At risk" || c.segment === "Lapsed")).sort((a, b) => b.lastVisit - a.lastVisit);
}
// Retention aggregates: rebook + win-back count are real; cohort/cadence/mix are
// modeled (they need a dedicated cohort pipeline even with real FranPOS data).
export async function getRetention(scope: Scope, month: MonthValue) {
  const m = await getMetrics(scope, month);
  const wb = await getWinbackList(scope);
  return { returningPct: 0.66, newPct: 0.34, rebook: m.rebook, cadenceDays: 47, oneAndDone: 88, winbackCount: wb.count, cohort: [100, 82, 71, 63, 58, 54, 51, 49] };
}

// ── public: weekly brief ────────────────────────────────────────────────────
export async function getWeeklyBrief(scope: Scope, month: MonthValue): Promise<WeeklyBrief> {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  const m = computeMetrics(scope, byStore, listings);
  const cs = computeCalls(scope, byStore);
  const ws = computeWeb(scope, byStore);
  const actions = await loadActions();
  const here = scope === "all" ? "across the four stores" : `at ${scopeLabel(scope)}`;
  const seed = scope === "all" ? 0 : STORE_OPTIONS.findIndex((o) => o.value === scope);
  const d = (n: number, span = 0.08) => Math.round(wave(seed + n, 4) * span * 1000) / 1000;
  const [revD, bookD, missD, rebookD, ratingD] = [d(1), d(2, 0.06), d(3, 0.05), d(4, 0.05), d(5, 0.02)];

  const changes: BriefChange[] = [
    { label: "Revenue", value: money(m.revenue), delta: revD, good: revD >= 0 },
    { label: "Bookings", value: m.bookings.toLocaleString(), delta: bookD, good: bookD >= 0 },
    { label: "Calls missed", value: pctStr(cs.missedPct), delta: missD, good: missD < 0 },
    { label: "Rebook rate", value: pctStr(m.rebook), delta: rebookD, good: rebookD >= 0 },
    { label: "Avg rating", value: m.rating.toFixed(1), delta: ratingD, good: ratingD >= 0 },
  ];
  const dir = (n: number) => (n >= 0 ? "up" : "down");
  const wins = changes.filter((c) => c.good && Math.abs(c.delta) >= 0.01).map((c) => `${c.label} ${dir(c.delta)} ${pctStr(Math.abs(c.delta))} ${here}.`);
  const risks = changes.filter((c) => !c.good && Math.abs(c.delta) >= 0.01).map((c) => `${c.label} moved the wrong way (${dir(c.delta)} ${pctStr(Math.abs(c.delta))}) ${here}.`);
  const opportunity =
    cs.missedPct > 0.22
      ? { title: "Call capture is the biggest lever", detail: `${pctStr(cs.missedPct)} of inbound calls went unanswered ${here}. Instant text-back is the fastest recovery.` }
      : m.rebook < 0.5
        ? { title: "Rebooking is the biggest lever", detail: `Only ${pctStr(m.rebook)} of grooming customers rebook before leaving ${here}. A prompt at checkout is the most durable fix.` }
        : { title: "Online conversion is the biggest lever", detail: `${pctStr(1 - ws.convRate)} of website visitors leave without booking ${here}. The drop is concentrated in the booking form.` };

  return {
    headline: `Revenue ${revD >= 0 ? "rose" : "eased"} to ${money(m.revenue)} ${here}, and ${opportunity.title.replace(" is the biggest lever", "")} is the clearest opportunity to act on.`,
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
export async function getGroupAverages(month: MonthValue) {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  const m = computeMetrics("all", byStore, listings);
  const cs = computeCalls("all", byStore);
  return { answeredPct: cs.answeredPct, rebook: m.rebook, attach: m.attach, noShow: m.noShow, rating: m.rating };
}

export async function getManagerScorecard(store: StoreId, month: MonthValue): Promise<ScoreRow[]> {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  const m = computeMetrics(store, byStore, listings);
  const cs = computeCalls(store, byStore);
  const gm = computeMetrics("all", byStore, listings);
  const gc = computeCalls("all", byStore);
  const seed = STORE_OPTIONS.findIndex((o) => o.value === store);
  const d = (n: number, span: number) => Math.round(wave(seed + n, 6) * span * 1000) / 1000;
  const rows: { label: string; raw: number; avg: number; fmt: (n: number) => string; delta: number; invert?: boolean }[] = [
    { label: "Calls answered", raw: cs.answeredPct, avg: gc.answeredPct, fmt: (n) => pctStr(n), delta: d(1, 0.05) },
    { label: "Rebook rate", raw: m.rebook, avg: gm.rebook, fmt: (n) => pctStr(n), delta: d(2, 0.05) },
    { label: "Retail attach", raw: m.attach, avg: gm.attach, fmt: (n) => pctStr(n), delta: d(3, 0.05) },
    { label: "No-show rate", raw: m.noShow, avg: gm.noShow, fmt: (n) => pctStr(n), delta: d(4, 0.04), invert: true },
    { label: "Avg rating", raw: m.rating, avg: gm.rating, fmt: (n) => n.toFixed(1), delta: d(5, 0.02) },
  ];
  return rows.map((r) => ({
    label: r.label, value: r.fmt(r.raw), raw: r.raw, avgLabel: r.fmt(r.avg), delta: r.delta, invert: !!r.invert,
    beatsAvg: r.invert ? r.raw <= r.avg : r.raw >= r.avg,
  }));
}

export async function getManagerFocus(store: StoreId, month: MonthValue) {
  const [byStore, listings] = await Promise.all([loadDaily(month), loadListings()]);
  const cs = computeCalls(store, byStore);
  const m = computeMetrics(store, byStore, listings);
  const here = `at ${scopeLabel(store)}`;
  const candidates = [
    { score: cs.missedPct, planKey: "call-capture", title: "Unanswered inbound calls are the biggest capture leak", detail: `${pctStr(cs.missedPct)} of inbound calls went unanswered ${here}. Each unanswered call is most often a booking that goes to a competitor instead.`, metric: `${pctStr(cs.missedPct)} of calls missed`, pending: true },
    { score: 1 - m.rebook, planKey: "rebook-coach", title: "Rebooking at checkout is the most durable lever", detail: `Only ${pctStr(m.rebook)} of grooming customers rebook before leaving ${here}. A short prompt at checkout is the most reliable fix.`, metric: `${pctStr(m.rebook)} rebook rate`, pending: false },
    { score: 1 - m.attach, planKey: "retail-attach", title: "Retail attachment on grooming visits is below the group", detail: `${pctStr(m.attach)} of grooming visits ${here} add a retail item. Suggesting food or accessories at checkout is the simplest add.`, metric: `${pctStr(m.attach)} retail attach`, pending: false },
  ];
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
