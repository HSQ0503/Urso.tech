import { priceServiceLine, type ServiceLineInput } from "@urso/types";
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

const genToken = () => randomBytes(16).toString("base64url");

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
  const signed=plan.signed_at?await getSignedPlanVersion(id):null;
  return { ...plan, visits: await listPlanVisits(id), signed_cancellation_fee_cents:signed?planCancellationFeeCents(signed):0, signed_notice_days:signed?.notice_days??0, read_at:new Date().toISOString() };
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

export type PlanLineInput = ServiceLineInput;

export type CreatePlanInput = {
  contactId?: string | null;
  customerName: string;
  requestKey?: string;
  sourceTotalCents?: number;
  sourceTaxRateBps?: number;
  customerPhone?: string | null;
  customerEmail?: string | null;
  jobAddress?: string | null;
  jobName?: string | null;
  cadence: PlanCadence;
  repeatTime?: string;
  durationMinutes?: number;
  crewId?: string | null;
  agreementRequired?: boolean;
  startsOn: string; // YYYY-MM-DD
  items: PlanLineInput[];
  source?: { estimateId?: string | null; invoiceId?: string | null; jobId?: string | null };
};

function normalizeLines(items: PlanLineInput[]): Omit<RecurringPlanItem, "id" | "plan_id">[] | null {
  if (!items.length || items.length > 200) return null;
  try {
    return items.map((line, position) => {
      const price = priceServiceLine(line);
      return { position, name: line.name.trim(), description: line.description?.trim() || null,
        quantity: line.quantity, unit_price_cents: line.unitPriceCents, line_total_cents: price.lineTotalCents,
        discount_mode: line.discountMode ?? "amount", discount_value: line.discountValue ?? 0,
        discount_cents: price.discountCents, taxable: line.taxable ?? false };
    });
  } catch { return null; }
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

  const repeatTime = input.repeatTime;
  if (repeatTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(repeatTime)) return { ok: false, notice: "Choose a repeat time in HH:mm Eastern." };
  const sourceJob = input.source?.jobId ? await getJob(input.source.jobId) : null;
  if (sourceJob?.plan_id) return { ok: false, notice: "This work order already belongs to a repeat schedule." };
  const settings = await getSettings();
  const db = canesDb();
  const price = input.sourceTotalCents ?? lines.reduce((sum, line) => sum + line.line_total_cents, 0);
  const { data, error } = await db.rpc("create_canes_repeat_plan", { p_input: {
    contact_id: contactId, customer_name: customerName, customer_phone: phone, customer_email: email,
    job_address: input.jobAddress?.trim() || null, job_name: input.jobName?.trim() || `${PLAN_CADENCE_LABEL[input.cadence]} service`,
    tax_rate_bps: input.sourceTaxRateBps ?? 0,
    adjustment_cents: price-lines.reduce((sum,line)=>sum+line.line_total_cents,0)-Math.round(lines.filter(line=>line.taxable).reduce((sum,line)=>sum+line.line_total_cents,0)*(input.sourceTaxRateBps??0)/10000),
    cadence: input.cadence, price_per_visit_cents: price, starts_on: input.startsOn, repeat_time: repeatTime ?? null,
    duration_minutes: input.durationMinutes ?? sourceJob?.duration_minutes ?? 120, crew_id: input.crewId ?? sourceJob?.crew_id ?? null,
    source_job_id: input.source?.jobId ?? null, source_estimate_id: input.source?.estimateId ?? null, source_invoice_id: input.source?.invoiceId ?? null,
    terms: settings.recurring_terms, public_token: genToken(), items: lines, request_key: input.requestKey ?? null,
    agreement_required: input.agreementRequired ?? !repeatTime,
  } });
  if (error || !data?.planId) return { ok: false, notice: "The repeat schedule could not be saved. No partial visit was created." };
  return { ok: true, planId: data.planId, notice: data.duplicate ? "This source already has a repeat schedule. Opening it." : repeatTime ? "Repeat schedule saved. Its next visit is on the calendar." : "Plan saved. Set a repeat time to enable automatic scheduling." };
}

// Lines and customer copied off the source document; the caller supplies the
// cadence and first date. Approved estimates bring their job along as visit #1.
export async function createPlanFromEstimate(
  estimateId: string,
  opts: { cadence: PlanCadence; startsOn: string; repeatTime?: string },
): Promise<PlanResult & { planId?: string }> {
  const estimate = await getEstimateWithItems(estimateId);
  if (!estimate) return { ok: false, notice: "Estimate not found." };
  const { data: job } = await canesDb().from("jobs").select("id").eq("estimate_id", estimate.id).maybeSingle();
  const lines = estimate.items
    .filter((it) => it.is_mandatory || !it.is_option || it.is_selected)
    .map((it) => ({ name: it.name, description: it.description, quantity: it.quantity, unitPriceCents: it.unit_price_cents ?? (it.quantity > 0 ? Math.round(it.line_total_cents / it.quantity) : it.line_total_cents), discountMode: it.discount_mode, discountValue: it.discount_value ?? it.discount_cents ?? 0, taxable: it.taxable }));
  return createPlan({
    sourceTotalCents: estimate.total_cents, sourceTaxRateBps:estimate.tax_rate_bps,
    contactId: estimate.contact_id,
    customerName: estimate.customer_name ?? "Customer",
    customerPhone: estimate.customer_phone,
    customerEmail: estimate.customer_email,
    jobAddress: estimate.job_address,
    jobName: estimate.job_name,
    repeatTime: opts.repeatTime,
    cadence: opts.cadence,
    startsOn: opts.startsOn,
    items: lines,
    source: { estimateId: estimate.id, jobId: (job?.id as string | undefined) ?? null },
  });
}

export async function createPlanFromInvoice(
  invoiceId: string,
  opts: { cadence: PlanCadence; startsOn: string; repeatTime?: string },
): Promise<PlanResult & { planId?: string }> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) return { ok: false, notice: "Invoice not found." };
  const lines = invoice.items.map((it) => ({
    name: it.name,
    description: it.description,
    quantity: it.quantity,
    unitPriceCents: it.unit_price_cents ?? (it.quantity > 0 ? Math.round(it.line_total_cents / it.quantity) : it.line_total_cents), discountMode: it.discount_mode, discountValue: it.discount_value ?? it.discount_cents ?? 0, taxable: it.taxable,
  }));
  return createPlan({
    sourceTotalCents: invoice.total_cents, sourceTaxRateBps:invoice.tax_rate_bps,
    contactId: invoice.contact_id,
    customerName: invoice.customer_name ?? "Customer",
    customerPhone: invoice.customer_phone,
    customerEmail: invoice.customer_email,
    jobAddress: invoice.job_address,
    jobName: invoice.job_name,
    repeatTime: opts.repeatTime,
    cadence: opts.cadence,
    startsOn: opts.startsOn,
    items: lines,
    source: { invoiceId: invoice.id, jobId: invoice.job_id },
  });
}

export async function createPlanFromJob(
  jobId: string,
  opts: { cadence: PlanCadence; startsOn: string; repeatTime?: string },
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
          unitPriceCents: it.unit_price_cents ?? (it.quantity > 0 ? Math.round(it.line_total_cents / it.quantity) : it.line_total_cents), discountMode: it.discount_mode, discountValue: it.discount_value ?? it.discount_cents ?? 0, taxable: it.taxable,
        }))
      : [{ name: job.job_name ?? "Service", quantity: 1, unitPriceCents: job.total_cents }];
  return createPlan({
    sourceTotalCents: job.total_cents, sourceTaxRateBps:job.tax_rate_bps??0,
    contactId: job.contact_id,
    customerName: job.customer_name ?? "Customer",
    customerPhone: job.customer_phone,
    customerEmail: job.customer_email,
    jobAddress: job.job_address,
    jobName: job.job_name,
    repeatTime: opts.repeatTime,
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
  repeatTime?: string;
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
  if (patch.repeatTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.repeatTime)) return { ok: false, notice: "Choose a valid Eastern repeat time." };
    update.repeat_time = patch.repeatTime; update.scheduling_enabled = true;
    update.anchor_day = plan.anchor_day ?? Number(plan.starts_on.slice(-2));
  }
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

  const lines = patch.items === undefined ? null : normalizeLines(patch.items);
  if (patch.items !== undefined && !lines) return {ok:false,notice:"A plan needs valid priced services."};
  if (lines) update.price_per_visit_cents = lines.reduce((sum,line)=>sum+line.line_total_cents,0);
  const {data,error}=await canesDb().rpc("edit_canes_repeat_plan",{p_id:planId,p_updated:plan.updated_at,p_patch:update,p_items:lines});
  if (error || data !== "saved") return {ok:false,notice:"The plan changed or its services could not be saved. Refresh and try again."};
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
    .eq("updated_at", plan.updated_at)
    .select("id");
  if (error) return { ok: false, notice: error.message };
  if (!data?.length) return { ok: false, notice: "This plan just changed — refresh and try again." };
  return { ok: true };
}

export async function agreePlanInPerson(planId: string): Promise<PlanResult> {
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, notice: "Plan not found." };
  if (plan.status === "active" && plan.signed_at) return { ok: true, notice: "This agreement is already signed." };
  if (!["draft", "active"].includes(plan.status)) return { ok: false, notice: `A ${plan.status} plan cannot be agreed again.` };
  if (plan.price_per_visit_cents <= 0) return { ok: false, notice: "Add a priced service before activating the plan." };
  return activate(plan, `${plan.customer_name ?? "Customer"} (agreed in person)`, "in_person");
}

// Public, token-scoped — called from /CanesPressure/r/[token] with no session.
export async function signPlan(token: string, signatureName: string, expectedUpdatedAt: string): Promise<PlanResult> {
  const plan = await getPlanByToken(token);
  if (!plan) return { ok: false, notice: "This agreement link isn't valid." };
  if (plan.updated_at !== expectedUpdatedAt) return {ok:false,notice:"This agreement changed. Refresh and review it before signing."};
  const signature = signatureName.trim();
  if (signature.length < 2) return { ok: false, notice: "Type your full name to sign." };
  if (plan.status === "active" && plan.signed_at) return { ok: true, notice: "This agreement is already signed." };
  if (!["draft", "active"].includes(plan.status)) return { ok: false, notice: "This agreement is no longer open." };
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
  const scheduled = await canesDb().rpc("mint_scheduled_plan_visit", { p_plan_id: planId });
  return { ok: true, notice: scheduled.error ? "Resumed. The next visit needs scheduling recovery; refresh the calendar before booking." : `Resumed. Next visit due ${next}.` };
}

// The next visit already minted but not yet done: what the cancellation fee is
// 50% of, and what the notice window is measured against.
export async function nextOpenVisit(planId: string): Promise<Job | null> {
  const { data } = await canesDb()
    .from("jobs")
    .select("*")
    .eq("plan_id", planId)
    .is("archived_at",null)
    .or(`scheduled_at.is.null,scheduled_at.gt.${new Date().toISOString()}`)
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
  const signed=plan.signed_at?await getSignedPlanVersion(planId):null;
  const feeCents = signed?planCancellationFeeCents(signed):0;
  // The contract term: a fee when the next visit is already on the books
  // (scheduled). notice_days = 0 means it applies to any such cancel; a
  // positive value waives it when the cancel comes that many days ahead.
  let feeApplies = false;
  if (open?.scheduled_at && feeCents > 0) {
    const daysOut = Math.floor((Date.parse(open.scheduled_at) - Date.now()) / 86_400_000);
    feeApplies = !!signed && (signed.notice_days === 0 || daysOut < signed.notice_days);
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
// The database advances each schedule and creates its next future visit atomically.
export async function generateDueVisits(): Promise<{ minted: number; skipped: number; errors: string[] }> {
  if (!canesConfigured()) return { minted: 0, skipped: 0, errors: [] };
  const db = canesDb();
  const { data, error } = await db.from("recurring_plans").select("id").eq("status", "active").eq("scheduling_enabled", true).limit(500);
  if (error) return { minted: 0, skipped: 0, errors: ["Repeat schedules could not be loaded."] };
  const result = { minted: 0, skipped: 0, errors: [] as string[] };
  for (const plan of data ?? []) {
    const response = await db.rpc("mint_scheduled_plan_visit", { p_plan_id: plan.id });
    if (response.error) result.errors.push(`The next visit for ${plan.id} could not be scheduled.`);
    else if (response.data?.[0]?.job_id) result.minted++;
    else result.skipped++;
  }
  return result;
}

// A visit's due date as an ET instant (noon), for anything that needs one.
export const dueInstant = (dateKey: string): string => etLocalToIso(`${dateKey}T12:00`);

export async function getSignedPlanVersion(planId: string): Promise<RecurringPlanWithItems | null> {
  if (isDemo()) return null;
  const {data,error}=await canesDb().from("recurring_agreement_versions").select("snapshot").eq("plan_id",planId).order("signed_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error("The signed agreement could not be loaded.");
  return data?.snapshot as RecurringPlanWithItems | null ?? null;
}
