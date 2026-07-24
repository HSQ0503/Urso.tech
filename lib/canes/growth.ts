import { canesDb } from "@/lib/canes/supabase";
import { isDemo } from "@/lib/canes/data";
import { overheadCentsForRange } from "@/lib/canes/overhead";
import { listTeamMembers } from "@/lib/canes/payouts";
import {
  DEMO_EXPENSES,
  DEMO_INVOICES,
  DEMO_INVOICE_REWARDS,
  DEMO_JOBS,
  DEMO_PAYMENTS,
  DEMO_TEAM,
} from "@/lib/canes/fixtures";
import {
  ET,
  RECURRENCE_DAYS,
  RECURRENCE_PER_MONTH,
  type InvoiceReward,
  type InvoiceRewardKind,
  type Job,
  type JobExpense,
  type JobRecurrence,
  type Payment,
  type TeamMember,
} from "@/lib/canes/types";

// Growth readers (0015): all-time net profit, recurring-revenue insights, and
// the review leaderboard. Same contract as every other reader — demo branches
// to fixtures, money in integer cents, COLLECTED always means the payments
// ledger. Fetches are capped and report truncation instead of silently lying.

const FETCH_CAP = 5000;
// "All time" floor — the business predates nothing before this.
const EPOCH_ISO = "2020-01-01T00:00:00.000Z";

async function listAllPayments(): Promise<{ payments: Payment[]; truncated: boolean }> {
  if (isDemo()) {
    return { payments: DEMO_PAYMENTS.filter((p) => p.status === "completed"), truncated: false };
  }
  const { data, error } = await canesDb()
    .from("payments")
    .select("*")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(FETCH_CAP);
  if (error) throw new Error(`listAllPayments: ${error.message}`);
  const payments = (data ?? []) as Payment[];
  return { payments, truncated: payments.length >= FETCH_CAP };
}

async function listAllJobExpenses(): Promise<JobExpense[]> {
  if (isDemo()) return DEMO_EXPENSES;
  const { data, error } = await canesDb().from("job_expenses").select("*").limit(FETCH_CAP);
  if (error) throw new Error(`listAllJobExpenses: ${error.message}`);
  return (data ?? []) as JobExpense[];
}

// All-time jobs/invoices with the growth cap — the shared listJobs()/
// listInvoices() readers cap at 500 rows ordered for the schedule views, which
// silently drops the NEWEST history first as the business grows.
async function listAllJobs(): Promise<Job[]> {
  if (isDemo()) return DEMO_JOBS;
  const { data, error } = await canesDb().from("jobs").select("*").limit(FETCH_CAP);
  if (error) throw new Error(`growth listAllJobs: ${error.message}`);
  return (data ?? []) as Job[];
}

async function listAllInvoiceJobLinks(): Promise<{ id: string; job_id: string | null }[]> {
  if (isDemo()) return DEMO_INVOICES.map((i) => ({ id: i.id, job_id: i.job_id }));
  const { data, error } = await canesDb().from("invoices").select("id, job_id").limit(FETCH_CAP);
  if (error) throw new Error(`growth listAllInvoiceJobLinks: ${error.message}`);
  return (data ?? []) as { id: string; job_id: string | null }[];
}

// ── All-time net profit ──────────────────────────────────────────────────────
// The same waterfall the payouts page uses, over the whole ledger:
//   collected − job costs − overhead − worker labor = net profit.
// Labor uses the crew-job-duration proxy (hourly members × their crew's done
// job minutes) until real hours are intentionally migrated — matching payouts.

export type AllTimeProfit = {
  collectedCents: number;
  jobExpensesCents: number;
  overheadCents: number;
  laborCents: number;
  netProfitCents: number;
  truncated: boolean; // payment history exceeded the fetch cap — totals undercount
};

const DONE_JOB: Job["status"][] = ["completed", "invoiced", "paid"];

export async function getAllTimeProfit(): Promise<AllTimeProfit> {
  const nowIso = new Date().toISOString();
  const [{ payments, truncated }, jobExpenses, overheadCents, jobs, team] = await Promise.all([
    listAllPayments(),
    listAllJobExpenses(),
    overheadCentsForRange(EPOCH_ISO, nowIso),
    listAllJobs(),
    listTeamMembers(),
  ]);

  const collectedCents = payments.reduce((s, p) => s + p.amount_cents, 0);
  const jobExpensesCents = jobExpenses.reduce((s, e) => s + e.amount_cents, 0);

  const crewMinutes = new Map<string, number>();
  for (const j of jobs) {
    if (!DONE_JOB.includes(j.status) || !j.crew_id) continue;
    crewMinutes.set(j.crew_id, (crewMinutes.get(j.crew_id) ?? 0) + (j.duration_minutes || 0));
  }
  let laborCents = 0;
  for (const m of team) {
    if (m.comp_type !== "hourly") continue;
    const minutes = m.crew_id ? crewMinutes.get(m.crew_id) ?? 0 : 0;
    laborCents += Math.round((minutes / 60) * m.hourly_cents);
  }

  return {
    collectedCents,
    jobExpensesCents,
    overheadCents,
    laborCents,
    netProfitCents: collectedCents - jobExpensesCents - overheadCents - laborCents,
    truncated,
  };
}

// ── Recurring revenue ────────────────────────────────────────────────────────

export type RecurringJobRow = {
  job: Job;
  recurrence: JobRecurrence;
  // Next visit: the scheduled slot if it's in the future, else last slot +
  // cadence. Null when the job has never been scheduled.
  nextDueIso: string | null;
  overdue: boolean;
};

export type RecurringInsights = {
  rows: RecurringJobRow[]; // active recurring plans, soonest-due first
  mrrCents: number;        // Σ job value × visits-per-month across active plans
  months: { key: string; label: string; cents: number }[]; // collected on recurring jobs, last 12 ET months
  recurringCustomerIds: string[]; // contact ids with at least one active plan
};

const ET_MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", year: "2-digit" });

export async function getRecurringInsights(): Promise<RecurringInsights> {
  const [jobs, invoiceLinks, { payments }] = await Promise.all([
    listAllJobs(),
    listAllInvoiceJobLinks(),
    listAllPayments(),
  ]);

  const flagged = jobs.filter(
    (j) => (j.recurrence ?? "none") !== "none" && j.status !== "canceled",
  );
  // One PLAN per customer: when several of a customer's jobs carry the flag
  // (each repeat visit re-flagged), only the newest counts toward MRR and the
  // plan list — otherwise every past visit would inflate recurring revenue
  // forever. Jobs with no contact can't be correlated and count individually.
  const newestByContact = new Map<string, Job>();
  const uncorrelated: Job[] = [];
  for (const j of flagged) {
    if (!j.contact_id) {
      uncorrelated.push(j);
      continue;
    }
    const seen = newestByContact.get(j.contact_id);
    if (!seen || j.created_at > seen.created_at) newestByContact.set(j.contact_id, j);
  }
  const active = [...newestByContact.values(), ...uncorrelated];

  const nowMs = Date.now();
  const rows: RecurringJobRow[] = active
    .map((job) => {
      const recurrence = (job.recurrence ?? "none") as JobRecurrence;
      const cadenceDays = RECURRENCE_DAYS[recurrence];
      let nextDueIso: string | null = null;
      if (job.scheduled_at) {
        const t = Date.parse(job.scheduled_at);
        nextDueIso =
          t >= nowMs || !cadenceDays
            ? job.scheduled_at
            : new Date(t + cadenceDays * 86_400_000).toISOString();
      }
      return {
        job,
        recurrence,
        nextDueIso,
        overdue: nextDueIso !== null && Date.parse(nextDueIso) < nowMs,
      };
    })
    .sort((a, b) => (a.nextDueIso ?? "9999").localeCompare(b.nextDueIso ?? "9999"));

  const mrrCents = Math.round(
    active.reduce(
      (s, j) => s + j.total_cents * RECURRENCE_PER_MONTH[(j.recurrence ?? "none") as JobRecurrence],
      0,
    ),
  );

  // Collected on recurring jobs per ET month: payment → job (directly or via
  // its invoice) → recurrence flag. ALL flagged jobs count here (money already
  // collected on past repeat visits is recurring revenue even after the plan
  // dedupe above). Last 12 months, oldest first.
  const recurringJobIds = new Set(flagged.map((j) => j.id));
  const invoiceJob = new Map(
    invoiceLinks.filter((i) => i.job_id).map((i) => [i.id, i.job_id as string]),
  );
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const anchor = new Date();
    anchor.setUTCDate(15);
    anchor.setUTCMonth(anchor.getUTCMonth() - i);
    monthKeys.push({ key: ET_MONTH.format(anchor), label: MONTH_LABEL.format(anchor) });
  }
  const byMonth = new Map(monthKeys.map((m) => [m.key, 0]));
  for (const p of payments) {
    const jobId = p.job_id ?? (p.invoice_id ? invoiceJob.get(p.invoice_id) ?? null : null);
    if (!jobId || !recurringJobIds.has(jobId)) continue;
    const key = ET_MONTH.format(new Date(p.created_at));
    if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + p.amount_cents);
  }

  return {
    rows,
    mrrCents,
    months: monthKeys.map((m) => ({ ...m, cents: byMonth.get(m.key) ?? 0 })),
    recurringCustomerIds: [
      ...new Set(active.map((j) => j.contact_id).filter((id): id is string => Boolean(id))),
    ],
  };
}

// ── Review leaderboard ───────────────────────────────────────────────────────
// Approved rewards only — an approval means the owner verified the review
// actually exists. Grouped by the credited team member (0015 attribution).

export type ReviewLeaderboardRow = {
  memberId: string | null; // null = approved but never credited to anyone
  name: string;
  counts: Record<InvoiceRewardKind, number>;
  totalCount: number;
  rewardCents: number; // customer discounts given for this member's reviews
};

export type ReviewLeaderboard = {
  rows: ReviewLeaderboardRow[]; // most reviews first
  totalApproved: number;
};

async function listApprovedRewards(): Promise<InvoiceReward[]> {
  if (isDemo()) return DEMO_INVOICE_REWARDS.filter((r) => r.status === "approved");
  const { data, error } = await canesDb()
    .from("invoice_rewards")
    .select("*")
    .eq("status", "approved")
    .limit(FETCH_CAP);
  if (error) throw new Error(`listApprovedRewards: ${error.message}`);
  return (data ?? []) as InvoiceReward[];
}

// Roster including inactive members — history keeps its names after someone
// leaves. Demo falls back to the fixture team.
async function listAllTeamMembers(): Promise<TeamMember[]> {
  if (isDemo()) return DEMO_TEAM;
  const { data, error } = await canesDb().from("team_members").select("*");
  if (error) throw new Error(`listAllTeamMembers: ${error.message}`);
  return (data ?? []) as TeamMember[];
}

export async function getReviewLeaderboard(): Promise<ReviewLeaderboard> {
  const [rewards, team] = await Promise.all([listApprovedRewards(), listAllTeamMembers()]);
  const nameById = new Map(team.map((m) => [m.id, m.name]));

  const emptyCounts = (): Record<InvoiceRewardKind, number> => ({
    google_review: 0,
    facebook_review: 0,
    social_follow: 0,
  });

  const byMember = new Map<string | null, ReviewLeaderboardRow>();
  for (const r of rewards) {
    const memberId = r.attributed_member_id ?? null;
    const row =
      byMember.get(memberId) ??
      {
        memberId,
        name: memberId ? nameById.get(memberId) ?? "Former team member" : "Not credited",
        counts: emptyCounts(),
        totalCount: 0,
        rewardCents: 0,
      };
    row.counts[r.kind] += 1;
    row.totalCount += 1;
    row.rewardCents += r.amount_cents;
    byMember.set(memberId, row);
  }

  const rows = [...byMember.values()].sort(
    (a, b) => b.totalCount - a.totalCount || b.rewardCents - a.rewardCents,
  );
  return { rows, totalApproved: rewards.length };
}
