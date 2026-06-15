// Metric-verified learning. Instead of trusting a completed action's
// self-reported result text, this measures from FranPOS whether the action's
// TARGET metric actually moved — comparing a window before vs after the action's
// completion date, respecting how long each metric takes to respond. A second
// signal (booking volume over the same windows) distinguishes "the number didn't
// move" from "nothing changed at all" — a hint the work may never have happened.
//
// Honest boundary: this confirms the needle MOVED, not that the action CAUSED it
// (a move could also be seasonality or staffing). Treat a verified win as strong
// evidence, not proof. Consumed by the weekly run (lib/ai/weekly.ts) to rank what
// to suggest next.

import { createAdminClient } from "@/lib/supabase/admin";
import { stores, type StoreId } from "@/components/dashboard/data";

type Admin = ReturnType<typeof createAdminClient>;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// A timestamptz → NY calendar date, matching how "today" is derived everywhere
// else (nyToday). Raw .slice(0,10) would take the UTC date and drift a day.
const NY_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
function nyDate(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : NY_DATE.format(d);
}

// ── Measurable metrics ───────────────────────────────────────────────────────
// Every metric here is "higher is better". `kind` decides how a move is judged:
// 'rate' compares in absolute percentage points; 'amount' compares relative %.
// `lagDays` delays the after-window when an effect takes time to appear.
// `settleDays` is how long the metric keeps changing after a visit — return rate
// is right-censored: `rebooks` only counts a customer who returns within 90 days,
// so a window isn't fully counted until 90 days after it ends. The verdict gate
// (lagDays + WINDOW_DAYS + settleDays) guarantees a full, fully-settled window
// before any verdict — so the same action's verdict is stable across runs.
type MetricKey = "returnRate" | "retailAttach" | "avgVisit" | "bookings" | "revenue";
type MetricKind = "rate" | "amount";

const METRICS: Record<MetricKey, { label: string; kind: MetricKind; lagDays: number; settleDays: number; minMove: number }> = {
  returnRate:   { label: "return rate",   kind: "rate",   lagDays: 0, settleDays: 90, minMove: 0.03 },
  retailAttach: { label: "retail attach", kind: "rate",   lagDays: 0, settleDays: 0,  minMove: 0.03 },
  avgVisit:     { label: "avg visit",     kind: "amount", lagDays: 0, settleDays: 0,  minMove: 0.05 },
  bookings:     { label: "bookings",      kind: "amount", lagDays: 0, settleDays: 0,  minMove: 0.05 },
  revenue:      { label: "revenue",       kind: "amount", lagDays: 0, settleDays: 0,  minMove: 0.05 },
};

const WINDOW_DAYS = 28; // length of the before/after comparison windows
const MIN_ACTIVITY_BOOKINGS = 40; // floor before trusting a flat-activity "may not have happened" read

// Map an action to the metric it should have moved. Honour the metric the AI
// itself cited (the schema's "the number that motivated it"); fall back to the
// playbook's domain; return null when the feed isn't live yet (Call capture /
// Reputation / Visibility → calls, reviews, web).
export function targetMetric(agent: string, metricText: string | null): MetricKey | null {
  const t = (metricText ?? "").toLowerCase();
  if (/return rate/.test(t)) return "returnRate";
  if (/retail attach|\battach\b/.test(t)) return "retailAttach";
  if (/avg visit|average visit|avg ticket|average ticket/.test(t)) return "avgVisit";
  if (/\bbookings?\b/.test(t)) return "bookings"; // \b already excludes "rebooking(s)"
  if (/revenue|sales/.test(t)) return "revenue";
  switch (agent) {
    case "Retention":
    case "Team":
      return "returnRate";
    case "Retail":
      return "retailAttach";
    case "Revenue":
      return "revenue";
    default:
      return null; // Call capture, Reputation, Visibility, anything unknown
  }
}

// ── Metric computation over a window ─────────────────────────────────────────
type Agg = { rebooks: number; identified: number; retailAttached: number; bookings: number; bookingRev: number; revenue: number };

type Row = {
  store_id: StoreId; rebooks: number; identified_bookings: number;
  retail_attached: number; bookings: number; booking_revenue: number; revenue: number;
};

// Sum the metrics_by_store rows for the given stores into one aggregate.
function sumRows(rows: Row[], storeIds: Set<StoreId>): Agg {
  const a: Agg = { rebooks: 0, identified: 0, retailAttached: 0, bookings: 0, bookingRev: 0, revenue: 0 };
  for (const r of rows) {
    if (!storeIds.has(r.store_id)) continue;
    a.rebooks += Number(r.rebooks);
    a.identified += Number(r.identified_bookings);
    a.retailAttached += Number(r.retail_attached);
    a.bookings += Number(r.bookings);
    a.bookingRev += Number(r.booking_revenue);
    a.revenue += Number(r.revenue);
  }
  return a;
}

// One metric's value from an aggregate. null when the denominator is empty
// (a rate over zero grooming visits) — the caller treats that as insufficient
// data, never as zero.
function metricValue(key: MetricKey, a: Agg): number | null {
  switch (key) {
    case "returnRate":   return a.identified > 0 ? a.rebooks / a.identified : null;
    case "retailAttach": return a.bookings > 0 ? a.retailAttached / a.bookings : null;
    case "avgVisit":     return a.bookings > 0 ? a.bookingRev / a.bookings : null;
    case "bookings":     return a.bookings; // 0 is a real value here, not "missing"
    case "revenue":      return a.revenue;
  }
}

// Direction of a move given the metric's kind and its noise floor.
function classifyMove(key: MetricKey, before: number, after: number): "improved" | "worsened" | "flat" {
  const { kind, minMove } = METRICS[key];
  if (kind === "rate") {
    const d = after - before;
    return d >= minMove ? "improved" : d <= -minMove ? "worsened" : "flat";
  }
  if (before <= 0) return after > 0 ? "improved" : "flat"; // no baseline to compare against
  const rel = (after - before) / before;
  return rel >= minMove ? "improved" : rel <= -minMove ? "worsened" : "flat";
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtVal = (key: MetricKey, n: number) =>
  METRICS[key].kind === "rate" ? pct(n) : key === "bookings" ? Math.round(n).toLocaleString() : money(n);

// ── The verification ─────────────────────────────────────────────────────────
export type Verdict = "worked" | "backfired" | "no_effect" | "no_signal" | "pending" | "unverifiable" | "insufficient_data";

export type VerifiedOutcome = {
  title: string; agent: string; store: string; completedOn: string;
  metric: MetricKey | null; verdict: Verdict;
  before: number | null; after: number | null; detail: string;
};

type CompletedAction = {
  id: string; title: string; agent: string; storeLabel: string; storeId: StoreId | null; metric: string | null; completedOn: string;
};

// metrics_by_store memoised per (start,end) so repeated windows hit the RPC once.
function makeWindowReader(supabase: Admin) {
  const cache = new Map<string, Promise<Row[]>>();
  return (start: string, endExclusive: string): Promise<Row[]> => {
    const cacheKey = `${start}|${endExclusive}`;
    let p = cache.get(cacheKey);
    if (!p) {
      p = (async () => {
        const { data, error } = await supabase.rpc("metrics_by_store", { p_start: start, p_end: endExclusive });
        if (error) throw new Error(`metrics_by_store failed: ${error.message}`);
        return (data ?? []) as Row[];
      })();
      cache.set(cacheKey, p);
    }
    return p;
  };
}

async function verifyOne(read: ReturnType<typeof makeWindowReader>, a: CompletedAction, today: string): Promise<VerifiedOutcome> {
  const base = { title: a.title, agent: a.agent, store: a.storeLabel, completedOn: a.completedOn };
  const key = targetMetric(a.agent, a.metric);
  if (!key) {
    return { ...base, metric: null, verdict: "unverifiable", before: null, after: null,
      detail: "target isn't a tracked POS metric yet (calls / reviews / web)" };
  }

  const { lagDays, settleDays, label } = METRICS[key];
  const daysAfter = daysBetween(a.completedOn, today);
  // Only judge once a FULL window exists past the lag AND its forward counts have
  // settled — so windows are always the same length and fully counted (stable
  // verdicts across runs; no right-censoring on return rate).
  const minAge = lagDays + WINDOW_DAYS + settleDays;
  if (daysAfter < minAge) {
    return { ...base, metric: key, verdict: "pending", before: null, after: null,
      detail: `${label}: too soon — ${daysAfter}/${minAge} days since completion` };
  }

  const beforeStart = addDays(a.completedOn, -WINDOW_DAYS);
  const afterStart = addDays(a.completedOn, lagDays);
  const afterEnd = addDays(afterStart, WINDOW_DAYS); // ≤ today − settleDays, guaranteed by the gate
  const storeIds = new Set<StoreId>(a.storeId ? [a.storeId] : stores.map((s) => s.id));

  const [beforeRows, afterRows] = await Promise.all([read(beforeStart, a.completedOn), read(afterStart, afterEnd)]);
  const beforeAgg = sumRows(beforeRows, storeIds);
  const afterAgg = sumRows(afterRows, storeIds);

  const before = metricValue(key, beforeAgg);
  const after = metricValue(key, afterAgg);
  if (before === null || after === null) {
    return { ...base, metric: key, verdict: "insufficient_data", before, after,
      detail: `${label}: not enough grooming volume to compute it in one window` };
  }

  const dir = classifyMove(key, before, after);
  const move = `${fmtVal(key, before)} → ${fmtVal(key, after)}`;
  if (dir === "improved") {
    return { ...base, metric: key, verdict: "worked", before, after, detail: `${label} ${move} after the action` };
  }
  if (dir === "worsened") {
    return { ...base, metric: key, verdict: "backfired", before, after, detail: `${label} ${move} — wrong direction after the action` };
  }
  // Flat outcome: a flat activity signal hints the work wasn't carried out — but
  // only trust that on enough booking volume; otherwise just call it no effect.
  const afterBookings = metricValue("bookings", afterAgg)!;
  const activity = classifyMove("bookings", metricValue("bookings", beforeAgg)!, afterBookings);
  if (activity === "flat" && afterBookings >= MIN_ACTIVITY_BOOKINGS) {
    return { ...base, metric: key, verdict: "no_signal", before, after,
      detail: `${label} held (${move}) and store activity was flat too — the work may not have happened` };
  }
  return { ...base, metric: key, verdict: "no_effect", before, after,
    detail: `${label} held (${move}) — no measurable lift` };
}

const COMPLETED_LOOKBACK_DAYS = 240; // long enough for return rate (118d to settle) to mature and stay visible
const MAX_VERIFY = 15;

export async function gatherVerifiedOutcomes(supabase: Admin, today: string): Promise<VerifiedOutcome[]> {
  const { data: acts, error } = await supabase
    .from("agent_actions")
    .select("id, title, agent, store_label, store_id, metric, updated_at")
    .eq("status", "completed");
  if (error) throw new Error(`completed actions read failed: ${error.message}`);
  const rows = (acts ?? []) as {
    id: string; title: string; agent: string; store_label: string; store_id: StoreId | null; metric: string | null; updated_at: string | null;
  }[];
  if (!rows.length) return [];

  // Exact completion date from the audit trail; fall back to updated_at for
  // actions completed before the trail existed (seeds / legacy rows).
  const { data: evs } = await supabase
    .from("action_events")
    .select("action_id, created_at")
    .eq("to_status", "completed")
    .order("created_at", { ascending: false });
  const completedOn = new Map<string, string>();
  for (const e of (evs ?? []) as { action_id: string; created_at: string }[]) {
    if (!completedOn.has(e.action_id)) completedOn.set(e.action_id, nyDate(e.created_at)); // most recent completion wins
  }

  const cutoff = addDays(today, -COMPLETED_LOOKBACK_DAYS);
  const completed: CompletedAction[] = rows
    .map((r) => ({
      id: r.id, title: r.title, agent: r.agent, storeLabel: r.store_label,
      storeId: r.store_id, metric: r.metric,
      completedOn: completedOn.get(r.id) ?? (r.updated_at ? nyDate(r.updated_at) : today),
    }))
    .filter((a) => a.completedOn >= cutoff && a.completedOn <= today)
    .sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1)) // most recent first
    .slice(0, MAX_VERIFY);

  const read = makeWindowReader(supabase);
  return Promise.all(completed.map((a) => verifyOne(read, a, today)));
}

// Prompt fragment for the weekly run: only the actually-measured verdicts, plus a
// per-playbook scoreboard. Pending / unverifiable / insufficient are left out —
// they aren't actionable signal for ranking.
export function verifiedOutcomesBlock(outcomes: VerifiedOutcome[]): string {
  const measured = outcomes.filter(
    (o) => o.verdict === "worked" || o.verdict === "backfired" || o.verdict === "no_effect" || o.verdict === "no_signal",
  );
  if (!measured.length) return "";

  const tag: Record<Verdict, string> = {
    worked: "WORKED", backfired: "BACKFIRED", no_effect: "no measurable effect",
    no_signal: "no signal (may not have been done)", pending: "", unverifiable: "", insufficient_data: "",
  };
  const lines = measured.map((o) => `- ${o.agent} · "${o.title}" (${o.store}): ${tag[o.verdict]} — ${o.detail}`);

  const score = new Map<string, { worked: number; failed: number }>();
  for (const o of measured) {
    const t = score.get(o.agent) ?? { worked: 0, failed: 0 };
    if (o.verdict === "worked") t.worked++;
    else if (o.verdict === "backfired" || o.verdict === "no_effect") t.failed++;
    score.set(o.agent, t);
  }
  const tally = [...score.entries()].map(([ag, t]) => `${ag}: ${t.worked} worked / ${t.failed} didn't`).join(" · ");

  return `\n\n--- Measured results of past actions (from POS data — what actually moved, not self-reported) ---\n${lines.join("\n")}\nPlaybook scoreboard: ${tally}`;
}
