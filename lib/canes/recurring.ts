import { randomBytes } from "crypto";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";
import { getSettings, isDemo } from "@/lib/canes/data";
import { ensureContact } from "@/lib/canes/customers";
import { getEstimateWithItems, getJob, listJobItems } from "@/lib/canes/estimates";
import { getInvoiceWithItems } from "@/lib/canes/invoices";
import { ET, etLocalToIso, fmtMoney, toE164 } from "@/lib/canes/types";
import type {
  Job,
  PlanCadence,
  RecurringPlan,
  RecurringPlanDetail,
  RecurringPlanItem,
  RecurringPlanVisit,
  RecurringPlanWithItems,
} from "@/lib/canes/types";
import { PLAN_CADENCE_LABEL, PLAN_VISITS_PER_YEAR, planCancellationFeeCents } from "@/lib/canes/types";

// Recurring plans (0027_recurring_plans.sql) — the contract behind repeat work.
//
// A plan holds the customer, the services and price per visit, the cadence,
// the signed agreement, and the pause/cancel state. Every visit it produces is
// an ordinary job with plan_id set, minted by generateDueVisits (cron) a
// configurable number of days ahead, so scheduling, crews, checklists,
// completion and invoicing keep working exactly as for any other work order.
//
// Reads + the mutation BODIES live here; app/CanesPressure/actions.ts wraps
// each mutation in the demo guard and the permission check, like every other
// domain. Nothing here checks who is calling.
//
// Money in integer cents. starts_on / next_due_on are ET CALENDAR DATES
// (YYYY-MM-DD). Date arithmetic runs at UTC noon on those keys — timezone
// neutral, cannot straddle DST — and only becomes an instant when a visit is
// minted, via etLocalToIso.

export type PlanResult = { ok: boolean; notice?: string };

const CADENCE_MONTHS: Record<PlanCadence, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

export function isPlanCadence(value: unknown): value is PlanCadence {
  return typeof value === "string" && value in PLAN_CADENCE_LABEL;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" });
export const todayEtKey = (): string => ET_DAY.format(new Date());
export const dateKeyOf = (iso: string): string => ET_DAY.format(new Date(iso));

// Same day-of-month N months on; a Jan 31 quarterly plan lands on Apr 30, not
// May 1 — clamp rather than overflow, so a "31st" plan never drifts forward.
export function addCadence(dateKey: string, cadence: PlanCadence, times = 1): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const months = CADENCE_MONTHS[cadence] * times;
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const genToken = () => randomBytes(16).toString("base64url");

async function nextPlanNumber(): Promise<string> {
  const db = canesDb();
  const { data, error } = await db.from("estimate_counters").select("next_value").eq("id", "plan").maybeSingle();
  if (error || !data) throw new Error(`nextPlanNumber: ${error?.message ?? "counter missing — run 0027"}`);
  const n = Number(data.next_value);
  const { error: advance } = await db.from("estimate_counters").update({ next_value: n + 1 }).eq("id", "plan");
  if (advance) throw new Error(`nextPlanNumber advance: ${advance.message}`);
  return `PLAN-${String(n).padStart(6, "0")}`;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listPlans(): Promise<RecurringPlan[]> {
  if (isDemo()) return [];
  const { data, error } = await canesDb()
    .from("recurring_plans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listPlans: ${error.message}`);
  return (data ?? []) as RecurringPlan[];
}

export async function getPlan(id: string): Promise<RecurringPlan | null> {
  if (isDemo()) return null;
  const { data } = await canesDb().from("recurring_plans").select("*").eq("id", id).maybeSingle();
  return (data as RecurringPlan | null) ?? null;
}

export async function getPlanByToken(token: string): Promise<RecurringPlan | null> {
  if (isDemo() || !token) return null;
  const { data } = await canesDb().from("recurring_plans").select("*").eq("public_token", token).maybeSingle();
  return (data as RecurringPlan | null) ?? null;
}

export async function listPlanItems(planId: string): Promise<RecurringPlanItem[]> {
  if (isDemo()) return [];
  const { data } = await canesDb()
    .from("recurring_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("position", { ascending: true });
  return (data ?? []) as RecurringPlanItem[];
}

export async function getPlanWithItems(id: string): Promise<RecurringPlanWithItems | null> {
  const plan = await getPlan(id);
  if (!plan) return null;
  return { ...plan, items: await listPlanItems(id) };
}

export async function listPlanVisits(planId: string): Promise<RecurringPlanVisit[]> {
  if (isDemo()) return [];
  const { data } = await canesDb()
    .from("jobs")
    .select("id, status, scheduled_at, ends_at, total_cents, plan_visit_due_on, crew_id")
    .eq("plan_id", planId)
    .order("plan_visit_due_on", { ascending: false })
    .limit(100);
  return (data ?? []) as RecurringPlanVisit[];
}

export async function getPlanDetail(id: string): Promise<RecurringPlanDetail | null> {
  const plan = await getPlanWithItems(id);
  if (!plan) return null;
  return { ...plan, visits: await listPlanVisits(id) };
}

// Collected money that belongs to plans, by ET month, for the Dashboard's
// recurring chart — every payment whose job (directly, or through its invoice)
// carries a plan_id. Last twelve months, oldest first.
export async function recurringCollectedByMonth(): Promise<{ key: string; label: string; cents: number }[]> {
  const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit" });
  const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", year: "2-digit" });
  const months: { key: string; label: string; cents: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const anchor = new Date();
    anchor.setUTCDate(15);
    anchor.setUTCMonth(anchor.getUTCMonth() - i);
    months.push({ key: monthKey.format(anchor), label: monthLabel.format(anchor), cents: 0 });
  }
  if (isDemo()) return months;
  const byKey = new Map(months.map((m) => [m.key, m]));
  const db = canesDb();
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 12);
  const [{ data: planJobs }, { data: payments }, { data: refunds }] = await Promise.all([
    db.from("jobs").select("id").not("plan_id", "is", null).limit(5000),
    db.from("payments").select("amount_cents, created_at, job_id, invoice_id").gte("created_at", since.toISOString()).limit(5000),
    db
      .from("payment_refunds")
      .select("amount_cents, created_at, payment:payments!payment_refunds_payment_id_fkey(job_id, invoice_id)")
      .gte("created_at", since.toISOString())
      .limit(5000),
  ]);
  const planJobIds = new Set((planJobs ?? []).map((j) => j.id as string));
  if (planJobIds.size === 0) return months;
  const { data: invoiceLinks } = await db.from("invoices").select("id, job_id").not("job_id", "is", null).limit(5000);
  const invoiceJob = new Map((invoiceLinks ?? []).map((i) => [i.id as string, i.job_id as string]));
  const jobOf = (p: { job_id: string | null; invoice_id: string | null }) =>
    p.job_id ?? (p.invoice_id ? invoiceJob.get(p.invoice_id) ?? null : null);
  for (const p of (payments ?? []) as { amount_cents: number; created_at: string; job_id: string | null; invoice_id: string | null }[]) {
    const jobId = jobOf(p);
    if (!jobId || !planJobIds.has(jobId)) continue;
    const m = byKey.get(monthKey.format(new Date(p.created_at)));
    if (m) m.cents += p.amount_cents;
  }
  for (const r of (refunds ?? []) as unknown as {
    amount_cents: number;
    created_at: string;
    payment: { job_id: string | null; invoice_id: string | null } | null;
  }[]) {
    const jobId = r.payment ? jobOf(r.payment) : null;
    if (!jobId || !planJobIds.has(jobId)) continue;
    const m = byKey.get(monthKey.format(new Date(r.created_at)));
    if (m) m.cents -= r.amount_cents;
  }
  return months;
}

// Σ active plans' price per visit × visits per year ÷ 12.
export function mrrCentsOf(plans: RecurringPlan[]): number {
  return Math.round(
    plans
      .filter((p) => p.status === "active")
      .reduce((sum, p) => sum + (p.price_per_visit_cents * PLAN_VISITS_PER_YEAR[p.cadence]) / 12, 0),
  );
}

// ── Creation ─────────────────────────────────────────────────────────────────

export type PlanLineInput = { name: string; description?: string | null; quantity: number; unitPriceCents: number };

export type CreatePlanInput = {
  contactId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  jobAddress?: string | null;
  jobName?: string | null;
  cadence: PlanCadence;
  startsOn: string; // YYYY-MM-DD
  items: PlanLineInput[];
  source?: { estimateId?: string | null; invoiceId?: string | null; jobId?: string | null };
};

function normalizeLines(items: PlanLineInput[]): Omit<RecurringPlanItem, "id" | "plan_id">[] | null {
  const out: Omit<RecurringPlanItem, "id" | "plan_id">[] = [];
  items.forEach((it, index) => {
    const name = it.name.trim();
    const quantity = Number(it.quantity);
    const unit = Math.round(Number(it.unitPriceCents));
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(unit) || unit < 0) return;
    out.push({
      position: index,
      name,
      description: it.description?.trim() || null,
      quantity,
      unit_price_cents: unit,
      line_total_cents: Math.round(quantity * unit),
    });
  });
  return out.length > 0 ? out : null;
}

export async function createPlan(input: CreatePlanInput): Promise<PlanResult & { planId?: string }> {
  if (!canesConfigured()) return { ok: false, notice: "Demo mode — nothing is saved." };
  const customerName = input.customerName.trim();
  if (!customerName) return { ok: false, notice: "A customer name is required." };
  if (!isPlanCadence(input.cadence)) return { ok: false, notice: "Choose how often the visits repeat." };
  if (!isDateKey(input.startsOn)) return { ok: false, notice: "Choose the date of the first visit." };
  const lines = normalizeLines(input.items);
  if (!lines) return { ok: false, notice: "A plan needs at least one priced service." };
  const phone = input.customerPhone?.trim() ? toE164(input.customerPhone) : null;
  if (input.customerPhone?.trim() && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
  const email = input.customerEmail?.trim().toLowerCase() || null;

  const contactId =
    input.contactId ??
    (await ensureContact({ name: customerName, phone, email, address: input.jobAddress ?? null }))?.id ??
    null;

  const settings = await getSettings();
  const db = canesDb();
  const number = await nextPlanNumber();
  const price = lines.reduce((s, l) => s + l.line_total_cents, 0);
  const { data, error } = await db
    .from("recurring_plans")
    .insert({
      number,
      contact_id: contactId,
      source_estimate_id: input.source?.estimateId ?? null,
      source_invoice_id: input.source?.invoiceId ?? null,
      source_job_id: input.source?.jobId ?? null,
      customer_name: customerName,
      customer_phone: phone,
      customer_email: email,
      job_address: input.jobAddress?.trim() || null,
      job_name: input.jobName?.trim() || `${PLAN_CADENCE_LABEL[input.cadence]} service`,
      cadence: input.cadence,
      price_per_visit_cents: price,
      status: "draft",
      starts_on: input.startsOn,
      next_due_on: input.startsOn,
      terms: settings.recurring_terms,
      message_to_customer: null,
      public_token: genToken(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, notice: error.message };
  const planId = data.id as string;
  const { error: itemsError } = await db
    .from("recurring_plan_items")
    .insert(lines.map((l) => ({ ...l, plan_id: planId })));
  if (itemsError) return { ok: false, notice: `Plan saved without its services: ${itemsError.message}` };

  // The source job becomes visit #1 and the plan's clock starts from it.
  if (input.source?.jobId) {
    const job = await getJob(input.source.jobId);
    if (job && !job.plan_id) {
      const firstDue = job.scheduled_at ? dateKeyOf(job.scheduled_at) : input.startsOn;
      await db.from("jobs").update({ plan_id: planId, plan_visit_due_on: firstDue }).eq("id", job.id).is("plan_id", null);
      await db
        .from("recurring_plans")
        .update({ last_generated_for: firstDue, next_due_on: addCadence(firstDue, input.cadence), starts_on: firstDue })
        .eq("id", planId);
    }
  }
  return { ok: true, planId };
}

// Lines and customer copied off the source document; the caller supplies the
// cadence and first date. Approved estimates bring their job along as visit #1.
export async function createPlanFromEstimate(
  estimateId: string,
  opts: { cadence: PlanCadence; startsOn: string },
): Promise<PlanResult & { planId?: string }> {
  const estimate = await getEstimateWithItems(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  const { data: job } = await canesDb().from("jobs").select("id").eq("estimate_id", estimate.id).maybeSingle();
  const lines = estimate.items
    .filter((it) => it.is_mandatory || !it.is_option || it.is_selected)
    .map((it) => ({ name: it.name, description: it.description, quantity: it.quantity, unitPriceCents: it.unit_price_cents }));
  return createPlan({
    contactId: estimate.contact_id,
    customerName: estimate.customer_name ?? "Customer",
    customerPhone: estimate.customer_phone,
    customerEmail: estimate.customer_email,
    jobAddress: estimate.job_address,
    jobName: estimate.job_name,
    cadence: opts.cadence,
    startsOn: opts.startsOn,
    items: lines,
    source: { estimateId: estimate.id, jobId: (job?.id as string | undefined) ?? null },
  });
}

export async function createPlanFromInvoice(
  invoiceId: string,
  opts: { cadence: PlanCadence; startsOn: string },
): Promise<PlanResult & { planId?: string }> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  const lines = invoice.items.map((it) => ({
    name: it.name,
    description: it.description,
    quantity: it.quantity,
    unitPriceCents: it.unit_price_cents,
  }));
  return createPlan({
    contactId: invoice.contact_id,
    customerName: invoice.customer_name ?? "Customer",
    customerPhone: invoice.customer_phone,
    customerEmail: invoice.customer_email,
    jobAddress: invoice.job_address,
    jobName: invoice.job_name,
    cadence: opts.cadence,
    startsOn: opts.startsOn,
    items: lines,
    source: { invoiceId: invoice.id, jobId: invoice.job_id },
  });
}

export async function createPlanFromJob(
  jobId: string,
  opts: { cadence: PlanCadence; startsOn: string },
): Promise<PlanResult & { planId?: string }> {
  const job = await getJob(jobId);
  if (!job) return { ok: false, notice: "Work order not found." };
  if (job.plan_id) return { ok: false, notice: "This work order already belongs to a recurring plan." };
  const items = (await listJobItems(jobId)).filter((it) => !it.checklist_only);
  const lines =
    items.length > 0
      ? items.map((it) => ({
          name: it.name,
          description: it.description,
          quantity: it.quantity,
          unitPriceCents: it.quantity > 0 ? Math.round(it.line_total_cents / it.quantity) : it.line_total_cents,
        }))
      : [{ name: job.job_name ?? "Service", quantity: 1, unitPriceCents: job.total_cents }];
  return createPlan({
    contactId: job.contact_id,
    customerName: job.customer_name ?? "Customer",
    customerPhone: job.customer_phone,
    customerEmail: job.customer_email,
    jobAddress: job.job_address,
    jobName: job.job_name,
    cadence: opts.cadence,
    startsOn: opts.startsOn,
    items: lines,
    source: { estimateId: job.estimate_id, jobId: job.id },
  });
}

// ── Edits ────────────────────────────────────────────────────────────────────

export type PlanPatch = {
  jobName?: string;
  customerName?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  jobAddress?: string | null;
  cadence?: PlanCadence;
  startsOn?: string; // draft only
  nextDueOn?: string; // active/paused: move the next visit
  leadDays?: number;
  noticeDays?: number;
  messageToCustomer?: string | null;
  items?: PlanLineInput[]; // replace-all; future visits only
};

export async function updatePlan(planId: string, patch: PlanPatch): Promise<PlanResult> {
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, notice: "Plan not found." };
  if (plan.status === "canceled") return { ok: false, notice: "This plan is canceled. Start a new one to change the terms." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.jobName !== undefined) update.job_name = patch.jobName.trim() || null;
  if (patch.customerName !== undefined) {
    const name = patch.customerName.trim();
    if (!name) return { ok: false, notice: "A customer name is required." };
    update.customer_name = name;
  }
  if (patch.customerPhone !== undefined) {
    const phone = patch.customerPhone?.trim() ? toE164(patch.customerPhone) : null;
    if (patch.customerPhone?.trim() && !phone) return { ok: false, notice: "That phone number doesn't look valid." };
    update.customer_phone = phone;
  }
  if (patch.customerEmail !== undefined) update.customer_email = patch.customerEmail?.trim().toLowerCase() || null;
  if (patch.jobAddress !== undefined) update.job_address = patch.jobAddress?.trim() || null;
  if (patch.cadence !== undefined) {
    if (!isPlanCadence(patch.cadence)) return { ok: false, notice: "Choose how often the visits repeat." };
    update.cadence = patch.cadence;
  }
  if (patch.startsOn !== undefined) {
    if (plan.status !== "draft") return { ok: false, notice: "The first visit is set. Move the next visit instead." };
    if (!isDateKey(patch.startsOn)) return { ok: false, notice: "Choose a real date for the first visit." };
    update.starts_on = patch.startsOn;
    update.next_due_on = patch.startsOn;
  }
  if (patch.nextDueOn !== undefined) {
    if (!isDateKey(patch.nextDueOn)) return { ok: false, notice: "Choose a real date for the next visit." };
    if (plan.last_generated_for && patch.nextDueOn <= plan.last_generated_for) {
      return { ok: false, notice: `The next visit has to come after the last one minted (${plan.last_generated_for}).` };
    }
    update.next_due_on = patch.nextDueOn;
  }
  if (patch.leadDays !== undefined) {
    if (!Number.isInteger(patch.leadDays) || patch.leadDays < 0 || patch.leadDays > 120) {
      return { ok: false, notice: "Lead time must be between 0 and 120 days." };
    }
    update.lead_days = patch.leadDays;
  }
  if (patch.noticeDays !== undefined) {
    if (!Number.isInteger(patch.noticeDays) || patch.noticeDays < 0 || patch.noticeDays > 365) {
      return { ok: false, notice: "Notice must be between 0 and 365 days." };
    }
    update.notice_days = patch.noticeDays;
  }
  if (patch.messageToCustomer !== undefined) update.message_to_customer = patch.messageToCustomer?.trim() || null;

  const db = canesDb();
  if (patch.items !== undefined) {
    const lines = normalizeLines(patch.items);
    if (!lines) return { ok: false, notice: "A plan needs at least one priced service." };
    const { error: del } = await db.from("recurring_plan_items").delete().eq("plan_id", planId);
    if (del) return { ok: false, notice: del.message };
    const { error: ins } = await db.from("recurring_plan_items").insert(lines.map((l) => ({ ...l, plan_id: planId })));
    if (ins) return { ok: false, notice: ins.message };
    update.price_per_visit_cents = lines.reduce((s, l) => s + l.line_total_cents, 0);
  }
  const { data, error } = await db.from("recurring_plans").update(update).eq("id", planId).select("id");
  if (error) return { ok: false, notice: error.message };
  if (!data?.length) return { ok: false, notice: "This plan just changed — refresh and try again." };
  return { ok: true };
}

// ── Agreement ────────────────────────────────────────────────────────────────

async function activate(plan: RecurringPlan, signature: string, source: "customer" | "in_person"): Promise<PlanResult> {
  const now = new Date().toISOString();
  const { data, error } = await canesDb()
    .from("recurring_plans")
    .update({
      status: "active",
      signed_at: now,
      signature_name: signature,
      agreement_source: source,
      next_due_on: plan.next_due_on ?? plan.starts_on,
      updated_at: now,
    })
    .eq("id", plan.id)
    .eq("status", plan.status)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!data?.length) return { ok: false, notice: "This plan just changed — refresh and try again." };
  return { ok: true };
}

export async function agreePlanInPerson(planId: string): Promise<PlanResult> {
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, notice: "Plan not found." };
  if (plan.status === "active") return { ok: true, notice: "This plan is already active." };
  if (plan.status !== "draft") return { ok: false, notice: `A ${plan.status} plan can't be agreed again.` };
  if (plan.price_per_visit_cents <= 0) return { ok: false, notice: "Add a priced service before activating the plan." };
  return activate(plan, `${plan.customer_name ?? "Customer"} (agreed in person)`, "in_person");
}

// Public, token-scoped — called from /CanesPressure/r/[token] with no session.
export async function signPlan(token: string, signatureName: string): Promise<PlanResult> {
  const plan = await getPlanByToken(token);
  if (!plan) return { ok: false, notice: "This agreement link isn't valid." };
  const signature = signatureName.trim();
  if (signature.length < 2) return { ok: false, notice: "Type your full name to sign." };
  if (plan.status === "active") return { ok: true, notice: "This agreement is already signed." };
  if (plan.status !== "draft") return { ok: false, notice: "This agreement is no longer open." };
  return activate(plan, signature, "customer");
}

export async function markPlanViewed(token: string): Promise<void> {
  const plan = await getPlanByToken(token);
  if (!plan || plan.viewed_at) return;
  await canesDb().from("recurring_plans").update({ viewed_at: new Date().toISOString() }).eq("id", plan.id).is("viewed_at", null);
}

export async function markPlanSent(planId: string): Promise<void> {
  await canesDb().from("recurring_plans").update({ sent_at: new Date().toISOString() }).eq("id", planId);
}

// ── Pause / resume / cancel ──────────────────────────────────────────────────

export async function pausePlan(planId: string): Promise<PlanResult> {
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, notice: "Plan not found." };
  if (plan.status !== "active") return { ok: false, notice: "Only an active plan can be paused." };
  const { data, error } = await canesDb()
    .from("recurring_plans")
    .update({ status: "paused", paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("status", "active")
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!data?.length) return { ok: false, notice: "This plan just changed — refresh and try again." };
  return { ok: true, notice: "Paused. No new visits will be created until you resume." };
}

export async function resumePlan(planId: string, nextDueOn?: string): Promise<PlanResult> {
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, notice: "Plan not found." };
  if (plan.status !== "paused") return { ok: false, notice: "Only a paused plan can be resumed." };
  // A plan that sat paused past its next date resumes from today, not from a
  // date in the past that would mint an overdue visit the moment it wakes.
  const today = todayEtKey();
  const next = nextDueOn ?? (plan.next_due_on && plan.next_due_on >= today ? plan.next_due_on : today);
  if (!isDateKey(next)) return { ok: false, notice: "Choose a real date for the next visit." };
  const { data, error } = await canesDb()
    .from("recurring_plans")
    .update({ status: "active", paused_at: null, next_due_on: next, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("status", "paused")
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!data?.length) return { ok: false, notice: "This plan just changed — refresh and try again." };
  return { ok: true, notice: `Resumed. Next visit due ${next}.` };
}

// The next visit already minted but not yet done: what the cancellation fee is
// 50% of, and what the notice window is measured against.
export async function nextOpenVisit(planId: string): Promise<Job | null> {
  const { data } = await canesDb()
    .from("jobs")
    .select("*")
    .eq("plan_id", planId)
    .in("status", ["unscheduled", "scheduled", "confirmed"])
    .order("plan_visit_due_on", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Job | null) ?? null;
}

// Canceling stops future visits. The already-minted next visit is canceled
// too (it is the visit the fee is about). Whether to BILL the fee is the
// owner's call, made in the wrapper — this only reports what the contract says.
export async function cancelPlan(
  planId: string,
  reason: string | null,
): Promise<PlanResult & { feeCents?: number; feeApplies?: boolean; canceledVisitId?: string | null }> {
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, notice: "Plan not found." };
  if (plan.status === "canceled") return { ok: true, notice: "This plan is already canceled.", feeCents: 0, feeApplies: false };
  const open = await nextOpenVisit(planId);
  const feeCents = planCancellationFeeCents(plan);
  // The contract term: a fee when the next visit is already on the books
  // (scheduled), unless the cancel comes with enough notice.
  let feeApplies = false;
  if (open?.scheduled_at) {
    const daysOut = Math.floor((Date.parse(open.scheduled_at) - Date.now()) / 86_400_000);
    feeApplies = feeCents > 0 && daysOut < plan.notice_days;
  } else if (open && plan.notice_days === 0) {
    feeApplies = feeCents > 0 && plan.status === "active";
  }
  const now = new Date().toISOString();
  const db = canesDb();
  const { data, error } = await db
    .from("recurring_plans")
    .update({ status: "canceled", canceled_at: now, canceled_reason: reason?.trim() || null, next_due_on: null, updated_at: now })
    .eq("id", planId)
    .neq("status", "canceled")
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!data?.length) return { ok: false, notice: "This plan just changed — refresh and try again." };
  return {
    ok: true,
    feeCents,
    feeApplies,
    canceledVisitId: open?.id ?? null,
    notice: feeApplies
      ? `Plan canceled. Per the agreement a ${fmtMoney(feeCents)} cancellation fee applies to the scheduled visit.`
      : "Plan canceled. No more visits will be created.",
  };
}

export async function recordPlanFeeInvoice(planId: string, invoiceId: string): Promise<void> {
  await canesDb().from("recurring_plans").update({ cancellation_fee_invoice_id: invoiceId }).eq("id", planId);
}

// ── The generator (cron) ─────────────────────────────────────────────────────
//
// For every active plan whose next visit falls within lead_days of today (ET),
// mint that visit as an unscheduled job — the owner books the actual slot from
// Work orders — and advance the plan's clock. Idempotent two ways: the plan's
// last_generated_for is checked, and jobs_plan_visit_idx refuses a duplicate
// (plan_id, plan_visit_due_on) outright, so a cron retry after a half-run
// cannot create a second visit.
export async function generateDueVisits(): Promise<{ minted: number; skipped: number; errors: string[] }> {
  if (!canesConfigured()) return { minted: 0, skipped: 0, errors: [] };
  const db = canesDb();
  const today = todayEtKey();
  const { data, error } = await db
    .from("recurring_plans")
    .select("*")
    .eq("status", "active")
    .not("next_due_on", "is", null)
    .limit(500);
  if (error) return { minted: 0, skipped: 0, errors: [`plans: ${error.message}`] };
  let minted = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const plan of (data ?? []) as RecurringPlan[]) {
    const due = plan.next_due_on as string;
    if (addDays(due, -plan.lead_days) > today) continue; // not yet inside the window
    if (plan.last_generated_for && plan.last_generated_for >= due) {
      // Clock never advanced after a mint — repair it rather than re-mint.
      await db.from("recurring_plans").update({ next_due_on: addCadence(due, plan.cadence) }).eq("id", plan.id);
      skipped += 1;
      continue;
    }
    const items = await listPlanItems(plan.id);
    const { data: job, error: insert } = await db
      .from("jobs")
      .insert({
        estimate_id: null,
        lead_id: null,
        contact_id: plan.contact_id,
        plan_id: plan.id,
        plan_visit_due_on: due,
        status: "unscheduled",
        customer_name: plan.customer_name,
        customer_phone: plan.customer_phone,
        customer_email: plan.customer_email,
        job_name: plan.job_name ?? `${PLAN_CADENCE_LABEL[plan.cadence]} service`,
        job_address: plan.job_address,
        total_cents: plan.price_per_visit_cents,
        deposit_cents: 0,
        scheduled_at: null,
        ends_at: null,
        duration_minutes: 120,
        recurrence: "none",
        notes: `Visit due ${due} · ${plan.number} (${PLAN_CADENCE_LABEL[plan.cadence].toLowerCase()})`,
      })
      .select("id")
      .single();
    if (insert) {
      // 23505 = the partial unique index: the visit exists already. Advance and move on.
      if (insert.code === "23505") {
        await db
          .from("recurring_plans")
          .update({ last_generated_for: due, next_due_on: addCadence(due, plan.cadence), updated_at: new Date().toISOString() })
          .eq("id", plan.id);
        skipped += 1;
        continue;
      }
      errors.push(`${plan.number}: ${insert.message}`);
      continue;
    }
    if (items.length > 0) {
      await db.from("job_items").insert(
        items.map((it, index) => ({
          job_id: job.id,
          position: index,
          name: it.name,
          description: it.description,
          quantity: it.quantity,
          line_total_cents: it.line_total_cents,
        })),
      );
    } else {
      await db.from("job_items").insert({
        job_id: job.id,
        position: 0,
        name: plan.job_name ?? "Service",
        quantity: 1,
        line_total_cents: plan.price_per_visit_cents,
      });
    }
    await db
      .from("recurring_plans")
      .update({ last_generated_for: due, next_due_on: addCadence(due, plan.cadence), updated_at: new Date().toISOString() })
      .eq("id", plan.id);
    minted += 1;
  }
  return { minted, skipped, errors };
}

// A visit's due date as an ET instant (noon), for anything that needs one.
export const dueInstant = (dateKey: string): string => etLocalToIso(`${dateKey}T12:00`);
