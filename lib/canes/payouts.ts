import { canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { listJobs } from "@/lib/canes/estimates";
import { listJobExpensesInRange } from "@/lib/canes/expenses";
import { overheadCentsForRange } from "@/lib/canes/overhead";
import { DEMO_TEAM, DEMO_PAYMENTS } from "@/lib/canes/fixtures";
import { ET, etLocalToIso, fmtEt, fmtMoney } from "@/lib/canes/types";
import type {
  Payment,
  TeamMember,
  PayoutRangeKey,
  PayoutSummary,
  PayoutLine,
} from "@/lib/canes/types";

// Payouts (0008_growth.sql). The waterfall for a calendar period:
//   collected (payments) − job expenses − overhead − worker labor = gross profit
//   gross − ops-manager profit share (a % of gross)              = distributable
//   distributable is split among owner/partner by comp_bps (60/40 default).
// Worker labor is a PROXY until worker check-in/out ships: a worker's hours are
// the sum of the durations of their crew's jobs completed in the period. Money in
// integer cents; ET calendar boundaries so "this month" means the ET month.

const DONE: string[] = ["completed", "invoiced", "paid"];

export function parsePayoutRange(raw?: string): PayoutRangeKey {
  return raw === "day" || raw === "week" || raw === "year" ? raw : "month";
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  if (isDemo()) return [...DEMO_TEAM].sort((a, b) => a.sort - b.sort);
  const { data, error } = await canesDb()
    .from("team_members")
    .select("*")
    .eq("active", true)
    .order("sort", { ascending: true });
  if (error) throw new Error(`listTeamMembers: ${error.message}`);
  return (data ?? []) as TeamMember[];
}

async function completedPaymentsSince(sinceIso: string): Promise<Payment[]> {
  if (isDemo()) {
    return DEMO_PAYMENTS.filter((p) => p.status === "completed" && p.created_at >= sinceIso);
  }
  const { data, error } = await canesDb()
    .from("payments")
    .select("*")
    .eq("status", "completed")
    .gte("created_at", sinceIso);
  if (error) throw new Error(`completedPaymentsSince: ${error.message}`);
  return (data ?? []) as Payment[];
}

// ── ET calendar boundaries for the period containing "now" ──────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function etParts(ms: number): { y: number; m: number; d: number; wd: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), wd: wd[get("weekday")] ?? 0 };
}

// ET midnight of a Y-M-D as a real instant (DST-safe via etLocalToIso).
const etMidnight = (y: number, m: number, d: number) => etLocalToIso(`${y}-${pad(m)}-${pad(d)}T00:00`);

// Add days to a Y-M-D using UTC calendar arithmetic (avoids DST drift).
function addDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function rangeBounds(key: PayoutRangeKey): { startIso: string; endIso: string; label: string } {
  const t = etParts(Date.now());
  if (key === "day") {
    const start = etMidnight(t.y, t.m, t.d);
    const nx = addDays(t.y, t.m, t.d, 1);
    return { startIso: start, endIso: etMidnight(nx.y, nx.m, nx.d), label: fmtEt(start, { weekday: "long", month: "long", day: "numeric" }) };
  }
  if (key === "week") {
    const back = (t.wd + 6) % 7; // Monday-start, matching the calendar board
    const s = addDays(t.y, t.m, t.d, -back);
    const e = addDays(s.y, s.m, s.d, 7);
    const startIso = etMidnight(s.y, s.m, s.d);
    return { startIso, endIso: etMidnight(e.y, e.m, e.d), label: `Week of ${fmtEt(startIso, { month: "short", day: "numeric" })}` };
  }
  if (key === "year") {
    return { startIso: etMidnight(t.y, 1, 1), endIso: etMidnight(t.y + 1, 1, 1), label: String(t.y) };
  }
  const startIso = etMidnight(t.y, t.m, 1);
  const nm = t.m === 12 ? { y: t.y + 1, m: 1 } : { y: t.y, m: t.m + 1 };
  return { startIso, endIso: etMidnight(nm.y, nm.m, 1), label: fmtEt(startIso, { month: "long", year: "numeric" }) };
}

const pctLabel = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

export async function computePayouts(key: PayoutRangeKey): Promise<PayoutSummary> {
  const { startIso, endIso, label } = rangeBounds(key);
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= startMs && t < endMs;
  };

  const [team, payments, jobExpenses, overheadCents, jobs] = await Promise.all([
    listTeamMembers(),
    completedPaymentsSince(startIso),
    listJobExpensesInRange(startIso, endIso),
    overheadCentsForRange(startIso, endIso),
    listJobs(),
  ]);

  const collectedCents = payments.filter((p) => inRange(p.created_at)).reduce((s, p) => s + p.amount_cents, 0);
  const jobExpensesCents = jobExpenses.reduce((s, e) => s + e.amount_cents, 0);

  // Worker labor: a crew's job-minutes in the period, charged to every worker on
  // that crew at their hourly rate (two crew members each earn the full job).
  const crewMinutes = new Map<string, number>();
  for (const j of jobs) {
    if (!DONE.includes(j.status) || !j.crew_id || !inRange(j.scheduled_at)) continue;
    crewMinutes.set(j.crew_id, (crewMinutes.get(j.crew_id) ?? 0) + (j.duration_minutes || 0));
  }
  const laborByMember = new Map<string, { cents: number; hours: number }>();
  let laborCents = 0;
  for (const m of team) {
    if (m.comp_type !== "hourly") continue;
    const minutes = m.crew_id ? crewMinutes.get(m.crew_id) ?? 0 : 0;
    const hours = minutes / 60;
    const cents = Math.round(hours * m.hourly_cents);
    laborByMember.set(m.id, { cents, hours });
    laborCents += cents;
  }

  const grossProfitCents = collectedCents - jobExpensesCents - overheadCents - laborCents;

  // Ops-manager profit share is taken off gross (never negative gross).
  const grossForShare = Math.max(0, grossProfitCents);
  const opsByMember = new Map<string, number>();
  let opsShareCents = 0;
  for (const m of team) {
    if (m.comp_type !== "profit_share") continue;
    const cents = Math.round(grossForShare * (m.comp_bps / 10_000));
    opsByMember.set(m.id, cents);
    opsShareCents += cents;
  }

  const distributableCents = grossProfitCents - opsShareCents;

  // Owner/partner split — normalized to the sum of their bps so it always
  // distributes 100% even if the configured shares do not total exactly 10000.
  const totalSplitBps = team
    .filter((m) => m.comp_type === "profit_split")
    .reduce((s, m) => s + m.comp_bps, 0);

  const lines: PayoutLine[] = team.map((m) => {
    const base = { member_id: m.id, name: m.name, role: m.role, comp_type: m.comp_type };
    if (m.comp_type === "profit_split") {
      const cents = totalSplitBps > 0 ? Math.round(distributableCents * (m.comp_bps / totalSplitBps)) : 0;
      return { ...base, amount_cents: cents, basis: `${pctLabel(m.comp_bps)} of ${fmtMoney(distributableCents)}` };
    }
    if (m.comp_type === "profit_share") {
      return { ...base, amount_cents: opsByMember.get(m.id) ?? 0, basis: `${pctLabel(m.comp_bps)} of ${fmtMoney(grossForShare)} profit` };
    }
    if (m.comp_type === "hourly") {
      const l = laborByMember.get(m.id) ?? { cents: 0, hours: 0 };
      return { ...base, amount_cents: l.cents, basis: `${l.hours.toFixed(1)}h x ${fmtMoney(m.hourly_cents)}/hr` };
    }
    return { ...base, amount_cents: 0, basis: "Not paid here" };
  });

  return {
    rangeKey: key,
    rangeLabel: label,
    collectedCents,
    jobExpensesCents,
    overheadCents,
    laborCents,
    grossProfitCents,
    opsShareCents,
    distributableCents,
    lines,
  };
}
