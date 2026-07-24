// Canes Pressure Washing — shared types for the Phase 1 lead/phone funnel.
// Mirrors supabase/canes/0001_init.sql exactly.

export type LeadType = "hot" | "cold";

export type LeadStatus =
  | "new"
  | "contacted"
  | "appointment_set"
  | "confirmed"
  | "estimated"
  | "won"
  | "lost";

export type LeadSource =
  | "lead_vendor"
  | "website"
  | "referral"
  | "meta_ads"
  | "yard_sign"
  | "door_hanger"
  | "other";

export type Lead = {
  id: string;
  created_at: string;
  type: LeadType;
  status: LeadStatus;
  name: string | null;
  phone: string | null;
  email: string | null;
  contact_id: string | null;
  address: string | null;
  service: string | null;
  source: LeadSource;
  appointment_at: string | null;
  confirmed_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  raw_message: string | null;
  parse_confidence: number | null;
  opted_out: boolean;
  snoozed_until: string | null;
  last_activity_at: string;
};

export type Message = {
  id: string;
  created_at: string;
  lead_id: string | null;
  peer_phone: string;
  direction: "in" | "out";
  body: string;
  media_urls: string[];
  automated: boolean;
  twilio_sid: string | null;
  delivery_status: string | null;
};

export type Call = {
  id: string;
  created_at: string;
  lead_id: string | null;
  peer_phone: string;
  direction: "in" | "out";
  status: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  twilio_sid: string | null;
};

export type TaskKind =
  | "hold_text"
  | "confirmation"
  | "no_reply_escalation"
  | "cold_escalation"
  | "follow_up"
  | "digest"
  | "estimate_send"
  | "estimate_reminder"
  | "job_confirmation"
  | "invoice_send"
  | "invoice_reminder"
  | "confirmation_final";

export type AutomationTask = {
  id: string;
  created_at: string;
  lead_id: string | null;
  kind: TaskKind;
  dedupe_key: string;
  scheduled_for: string;
  sent_at: string | null;
  status: "pending" | "sending" | "sent" | "canceled" | "failed";
  payload: Record<string, unknown>;
};

export type LeadEvent = {
  id: string;
  created_at: string;
  lead_id: string;
  kind: string;
  detail: string | null;
  data: Record<string, unknown>;
};

export type CanesSettings = {
  quiet_hours: { start: number; end: number; timezone: string };
  confirmation_offset_hours: number;
  templates: {
    hold_text: string;
    confirmation: string;
    confirmation_ack: string;
    missed_call: string;
  };
  lead_vendor_phones: string[];
  estimate_terms: string;
  estimate_message: string;
  deposit_presets: number[];
  estimate_expiry_days: number;
  estimate_tax_rate_bps: number;
  job_confirmation_template: string;
  job_confirmation_offset_hours: number;
  invoice_terms: string;
  invoice_message: string;
  invoice_reminder_days: number[];
  // ── 0007 ops feedback: final-confirmation escalation + call greeting/whisper ──
  confirmation_final_template: string;
  confirmation_final_offset_hours: number;
  confirmation_auto_release: boolean; // opt-in: clear the appt if still unconfirmed
  call_greeting_enabled: boolean;
  call_greeting_text: string;
  call_whisper_enabled: boolean;
  call_ivr_enabled: boolean; // optional "press 1 / press 2" menu, off by default
  expense_categories: string[];
  // ── 0012 review rewards: default amounts + destination links. An empty URL
  //    means that offer is unconfigured and never seeds onto an invoice.
  review_rewards: {
    google_cents: number;
    facebook_cents: number;
    follow_cents: number;
    google_url: string;
    facebook_url: string;
    instagram_url: string;
  };
};

// vendor = the lead guy's raw feed (configured number ONLY — never a heuristic,
// so a customer thread can't be mis-pinned); customer = the phone resolves to a
// contact with job history (or a lead already linked to one); lead = everyone else.
export type ThreadKind = "vendor" | "lead" | "customer";

export type Thread = {
  peer_phone: string;
  lead: Lead | null;
  contact: Contact | null; // joined by normalized phone
  contact_id: string | null;
  kind: ThreadKind;
  display_name: string | null; // contact name wins over lead name
  last_message: Message | null; // null for call-only threads
  last_call: Call | null;
  last_activity_at: string;
  unread: boolean; // newest event is an inbound message or a missed inbound call
  message_count: number;
};

// A vendor thread is the lead guy's raw feed, never a customer conversation:
// either a configured vendor number, or (fallback, before the number is
// configured) unattributed inbound with no lead record on the phone.
export function isVendorThread(t: Thread, vendorPhones: string[]): boolean {
  return (
    vendorPhones.includes(t.peer_phone) ||
    (!t.lead && t.last_message?.direction === "in" && t.last_message.lead_id === null)
  );
}

// A call that rang out without an answer — missed from the caller's side,
// voicemail from ours when a recording or transcript exists.
export function isMissedCall(c: Call): boolean {
  return c.direction === "in" && c.status !== "completed";
}

export function fmtCallDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Display maps (single source of truth for labels + the .cp-* class names
//    defined in app/CanesPressure/canes.css) ──────────────────────────────────

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  appointment_set: "Appointment set",
  confirmed: "Confirmed",
  estimated: "Estimated",
  won: "Won",
  lost: "Lost",
};

export const STATUS_CLASS: Record<LeadStatus, string> = {
  new: "cp-status-new",
  contacted: "cp-status-contacted",
  appointment_set: "cp-status-appt",
  confirmed: "cp-status-confirmed",
  estimated: "cp-status-estimated",
  won: "cp-status-won",
  lost: "cp-status-lost",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  lead_vendor: "Lead vendor",
  website: "Website",
  referral: "Referral",
  meta_ads: "Meta ads",
  yard_sign: "Yard sign",
  door_hanger: "Door hanger",
  other: "Other",
};

export const ET = "America/New_York";

export function fmtEt(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: ET }).format(new Date(iso));
}

// Compact ET time range for job cards — "9:00–11:30 AM", crossing meridiems
// as "9:00 AM–12:30 PM". Start alone when there is no end.
export function fmtEtTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  if (!startIso) return "—";
  const t = (iso: string) => fmtEt(iso, { hour: "numeric", minute: "2-digit" });
  const start = t(startIso);
  if (!endIso) return start;
  const end = t(endIso);
  const meridiem = start.slice(-2);
  return meridiem === end.slice(-2)
    ? `${start.slice(0, -3)}–${end}`
    : `${start}–${end}`;
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

// What ET wall-clock time does this instant show, expressed as a fake-UTC
// epoch so it can be compared against the intended wall time.
function etWallClockAsUtcMs(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour"); // some engines render midnight as 24
  return Date.parse(`${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}Z`);
}

// Interpret a datetime-local value ("YYYY-MM-DDTHH:mm") as America/New_York
// wall time no matter what timezone the device is in. Two-pass offset
// technique: guess the instant as if the input were UTC, see what ET wall time
// that instant shows, shift by the difference; the second pass settles DST
// edges.
export function etLocalToIso(naive: string): string {
  const full = /T\d{2}:\d{2}$/.test(naive) ? `${naive}:00` : naive; // pickers may omit seconds
  const intended = Date.parse(`${full}Z`);
  if (Number.isNaN(intended)) return naive; // let the server reject it
  let guess = intended;
  for (let i = 0; i < 2; i++) {
    guess += intended - etWallClockAsUtcMs(new Date(guess));
  }
  return new Date(guess).toISOString();
}

// Normalize a US phone into E.164 (+1XXXXXXXXXX); returns null if hopeless.
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length > 10) return `+${digits}`;
  return null;
}

export function fmtPhone(e164: string | null): string {
  if (!e164) return "—";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// ── Phase 2: estimates + jobs (mirrors supabase/canes/0002_estimates.sql) ─────

export type EstimateType = "standard" | "options" | "packages";
export type EstimateStatus = "draft" | "sent" | "viewed" | "approved" | "declined" | "expired";
export type CatalogKind = "service" | "product";

export type Contact = {
  id: string; created_at: string; name: string | null; phone: string | null;
  email: string | null; source: LeadSource; notes: string | null;
  archived: boolean; last_activity_at: string;
};

export type Address = {
  id: string; created_at: string; contact_id: string | null; line: string;
  site_notes: string | null; is_primary: boolean;
};

// One row of the customers list: the contact plus the aggregates the table shows.
export type CustomerSummary = Contact & {
  primary_address: string | null;
  jobs_count: number;
  last_job_at: string | null;
  lifetime_cents: number; // completed payments, joined through the contact's invoices
  open_balance_cents: number; // sum(total - paid) over sent/viewed invoices
};

// Everything the customer detail page renders in one object.
export type CustomerDetail = {
  contact: Contact;
  addresses: Address[];
  lead: Lead | null;
  estimates: Estimate[];
  jobs: Job[];
  invoices: Invoice[];
  payments_total_cents: number;
  open_balance_cents: number;
};

export type CatalogItem = {
  id: string; created_at: string; name: string; description: string | null; kind: CatalogKind;
  default_price_cents: number; unit: string; taxable: boolean; active: boolean; position: number;
};

export type Estimate = {
  id: string; created_at: string; updated_at: string;
  lead_id: string | null; contact_id: string | null; address_id: string | null;
  number: string; estimate_type: EstimateType; status: EstimateStatus;
  customer_name: string | null; customer_phone: string | null; customer_email: string | null;
  job_address: string | null; job_name: string | null;
  subtotal_cents: number; discount_cents: number; adjustment_cents: number;
  tax_cents: number; tax_rate_bps: number; total_cents: number; deposit_percent: number; deposit_cents: number;
  message_to_customer: string | null; terms: string | null; internal_notes: string | null;
  expires_at: string | null; public_token: string;
  sent_at: string | null; viewed_at: string | null; approved_at: string | null;
  declined_at: string | null; decline_reason: string | null; signature_name: string | null;
  employee: string | null;
};

export type EstimateItem = {
  id: string; estimate_id: string; catalog_id: string | null; position: number;
  name: string; description: string | null; kind: CatalogKind; quantity: number;
  unit_price_cents: number; discount_cents: number; taxable: boolean; line_total_cents: number;
  is_option: boolean; is_mandatory: boolean; is_selected: boolean; package_group: string | null;
};

export type JobStatus =
  | "unscheduled" | "scheduled" | "confirmed" | "in_progress"
  | "completed" | "invoiced" | "paid" | "canceled";

export type Job = {
  id: string; created_at: string; estimate_id: string | null; lead_id: string | null;
  contact_id: string | null; status: JobStatus; customer_name: string | null;
  job_address: string | null; total_cents: number; deposit_cents: number;
  scheduled_at: string | null; assigned_to: string | null; notes: string | null;
  // ── scheduler additions (0004_scheduler.sql) ──
  duration_minutes: number;
  ends_at: string | null;
  arrival_window_minutes: number;
  crew_id: string | null;
  confirmed_at: string | null;
  customer_phone: string | null;
  job_name: string | null;
  gate_code: string | null;
  site_notes: string | null;
  canceled_reason: string | null;
  // ── customers additions (0006_customers.sql) ──
  customer_email: string | null;
  // ── deposit-link additions (0013_deposits.sql); optional so fixtures compile ──
  deposit_order_id?: string | null;
  deposit_link_id?: string | null;
  deposit_link_url?: string | null;
  deposit_paid_at?: string | null;
};

export type Crew = {
  id: string; created_at: string; name: string;
  color: string; active: boolean; sort: number;
};

export type JobItem = {
  id: string; job_id: string; estimate_item_id: string | null;
  position: number; name: string; description: string | null;
  quantity: number; line_total_cents: number; done: boolean;
  required?: boolean; technician_note?: string | null; blocked?: boolean;
  completed_at?: string | null; checklist_only?: boolean;
};

// Per-job cost (materials, gas, dump fee, sub) — 0007_ops_feedback.sql. Money in
// integer cents; category is free text seeded from settings.expense_categories.
// Crew is snapshotted so per-crew margin survives a later crew reassignment.
export type JobExpense = {
  id: string; created_at: string; job_id: string;
  amount_cents: number; category: string; note: string | null;
  crew_id: string | null; created_by: string | null;
};

// Projected cost on an estimate (0014) — the quote-time cost model. Approval
// copies these onto the job as job_expenses seeds.
export type EstimateExpense = {
  id: string; created_at: string; estimate_id: string;
  amount_cents: number; category: string; note: string | null;
  created_by: string | null;
};

// ── Phase 5: business overhead expenses + payouts (0008_growth.sql) ───────────

export type ExpenseFrequency = "one_time" | "monthly" | "yearly";

// A cost NOT tied to a job — subscriptions, insurance, truck, marketing. A
// recurring row (monthly/yearly) counts every period it is active between
// incurred_on and ends_on; a one_time row counts once, on incurred_on.
export type BusinessExpense = {
  id: string; created_at: string; name: string;
  amount_cents: number; category: string;
  recurring: boolean; frequency: ExpenseFrequency;
  incurred_on: string;    // "YYYY-MM-DD" (ET); recurring start
  ends_on: string | null; // recurring end, null = ongoing
  active: boolean; note: string | null;
};

export type TeamRole = "owner" | "partner" | "ops_manager" | "worker";

// How a team member is paid. profit_split = a share of the distributable profit
// after everyone else is paid (owner/partner); profit_share = a % of gross profit
// taken before the split (ops manager); hourly = rate x hours worked; none =
// tracked but not paid through this waterfall.
export type CompType = "profit_split" | "profit_share" | "hourly" | "none";

export type TeamMember = {
  id: string; created_at: string; name: string; role: TeamRole;
  comp_type: CompType;
  comp_bps: number;     // profit_split / profit_share: basis points (6000 = 60%)
  hourly_cents: number; // hourly workers, cents per hour
  crew_id: string | null; // worker -> crew, for the labor-hours proxy
  active: boolean; sort: number;
};

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  partner: "Partner",
  ops_manager: "Operations manager",
  worker: "Worker",
};

// One line of the payouts view — a person and what they are owed for the period.
export type PayoutLine = {
  member_id: string; name: string; role: TeamRole; comp_type: CompType;
  amount_cents: number;
  basis: string; // human-readable: "60% of $4,200", "18.5h x $20/hr"
};

export type PayoutRangeKey = "day" | "week" | "month" | "year";

// The full payouts waterfall for a period. Every figure in integer cents.
export type PayoutSummary = {
  rangeKey: PayoutRangeKey;
  rangeLabel: string;
  collectedCents: number;
  jobExpensesCents: number;
  overheadCents: number;
  laborCents: number;
  grossProfitCents: number;   // collected - job expenses - overhead - labor
  opsShareCents: number;      // ops-manager profit share (of gross)
  distributableCents: number; // gross - opsShare, split among owner/partner
  lines: PayoutLine[];        // per person
};

export type CalendarEventKind = "block" | "time_off" | "holiday" | "note";

export type CalendarEvent = {
  id: string; created_at: string; title: string;
  starts_at: string; ends_at: string; all_day: boolean;
  crew_id: string | null; kind: CalendarEventKind; notes: string | null;
};

// A job joined to its line-item snapshot and its assigned crew. The shape every
// scheduler reader/UI passes around, so the calendar can render a block, its
// crew color, and the run-sheet checklist from one object.
export type JobWithItems = Job & { items: JobItem[]; crew: Crew | null };

// ── Crew Phase C: private per-job photos (0011_job_media.sql) ─────────────────

export type JobMediaCategory = "before" | "after" | "walkthrough" | "reference" | "issue";
export type JobMediaVisibility = "internal" | "assigned_crew" | "customer";

// One photo attached to a job, mapped for the gallery UIs. The URLs are
// short-lived signed links minted after a job-access check — render them
// immediately, never store them.
export type JobMediaItem = {
  id: string;
  jobId: string;
  mediaType: "photo" | "video";
  category: JobMediaCategory;
  visibility: JobMediaVisibility;
  caption: string | null;
  capturedAt: string | null;
  createdAt: string;
  width: number | null;
  height: number | null;
  uploadedBy: string | null; // technician name; null = office upload
  approvedAt: string | null;
  thumbnailUrl: string | null;
  fullUrl: string | null;
};

export const MEDIA_CATEGORY_LABEL: Record<JobMediaCategory, string> = {
  before: "Before",
  after: "After",
  walkthrough: "Walkthrough",
  reference: "Reference",
  issue: "Issue",
};

export type EstimateWithItems = Estimate & { items: EstimateItem[] };

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  unscheduled: "Unscheduled", scheduled: "Scheduled", confirmed: "Confirmed",
  in_progress: "In progress", completed: "Completed", invoiced: "Invoiced",
  paid: "Paid", canceled: "Canceled",
};

export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed",
  approved: "Approved", declined: "Declined", expired: "Expired",
};
export const ESTIMATE_STATUS_CLASS: Record<EstimateStatus, string> = {
  draft: "cp-status-new", sent: "cp-status-contacted", viewed: "cp-status-estimated",
  approved: "cp-status-won", declined: "cp-status-lost", expired: "cp-status-lost",
};
export const ESTIMATE_TYPE_LABEL: Record<EstimateType, string> = {
  standard: "Standard", options: "Options", packages: "Packages",
};

export function fmtMoney(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ── Phase 2.5: invoices + payments (mirrors supabase/canes/0005_invoicing.sql) ─

export type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "void";
export type PaymentMethod = "cash" | "card" | "other";
export type PaymentSource = "manual" | "square_webhook";
// A booking deposit collected at estimate approval vs the final balance (0013).
export type PaymentKind = "deposit" | "balance";

export type Invoice = {
  id: string; created_at: string; updated_at: string;
  job_id: string | null; estimate_id: string | null; lead_id: string | null; contact_id: string | null;
  number: string; status: InvoiceStatus;
  customer_name: string | null; customer_phone: string | null; customer_email: string | null;
  job_address: string | null; job_name: string | null;
  subtotal_cents: number; adjustment_cents: number; tax_cents: number; tax_rate_bps: number;
  total_cents: number; amount_paid_cents: number;
  message_to_customer: string | null; terms: string | null; internal_notes: string | null;
  public_token: string;
  square_invoice_id: string | null; square_order_id: string | null; hosted_payment_url: string | null;
  sent_at: string | null; viewed_at: string | null; paid_at: string | null; voided_at: string | null;
  employee: string | null;
};

export type InvoiceItem = {
  id: string; invoice_id: string; job_item_id: string | null; position: number;
  name: string; description: string | null; quantity: number;
  unit_price_cents: number; line_total_cents: number;
};

export type Payment = {
  id: string; created_at: string; invoice_id: string | null; job_id: string | null;
  amount_cents: number; currency: string; method: PaymentMethod; source: PaymentSource;
  status: "completed" | "refunded"; square_payment_id: string | null;
  external_event_id: string | null; recorded_by: string | null; note: string | null;
  // ── 0013 deposits; optional so fixtures compile ──
  kind?: PaymentKind; square_order_id?: string | null;
};

export type InvoiceWithItems = Invoice & { items: InvoiceItem[]; payments: Payment[] };

// A slim, token-free invoice view safe to pass into client components (the
// schedule board, the job sheet). Never carries public_token or Square ids.
export type JobInvoiceSummary = {
  id: string;
  number: string;
  status: InvoiceStatus;
  total_cents: number;
  amount_paid_cents: number;
};

// Balance still owed on an invoice — never below zero.
export function invoiceBalanceCents(inv: Pick<Invoice, "total_cents" | "amount_paid_cents">): number {
  return Math.max(0, inv.total_cents - inv.amount_paid_cents);
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", paid: "Paid", void: "Void",
};
export const INVOICE_STATUS_CLASS: Record<InvoiceStatus, string> = {
  draft: "cp-status-new", sent: "cp-status-contacted", viewed: "cp-status-estimated",
  paid: "cp-status-won", void: "cp-status-lost",
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash", card: "Card", other: "Other",
};

// ── 0012: review rewards (mirrors supabase/canes/0012_invoice_rewards.sql) ────
//
// Money-off offers riding on an invoice: the customer claims on the public
// page, the owner verifies the review/follow actually exists and approves, and
// the approval subtracts the reward inside recomputeInvoiceTotals. A reward is
// a reduction of what's BILLED (total_cents), never a payments-ledger row —
// collected-revenue analytics stay truthful.

export type InvoiceRewardKind = "google_review" | "facebook_review" | "social_follow";
export type InvoiceRewardStatus = "offered" | "claimed" | "approved" | "declined";

export type InvoiceReward = {
  id: string; created_at: string; updated_at: string;
  invoice_id: string;
  kind: InvoiceRewardKind;
  label: string;          // snapshot at offer time
  amount_cents: number;   // snapshot at offer time
  status: InvoiceRewardStatus;
  claimed_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

export const REWARD_KIND_LABEL: Record<InvoiceRewardKind, string> = {
  google_review: "Google review",
  facebook_review: "Facebook review",
  social_follow: "Instagram + Facebook follow",
};

// Sum of rewards actually applied to the bill (approved only).
export function approvedRewardCents(
  rewards: Pick<InvoiceReward, "status" | "amount_cents">[],
): number {
  return rewards
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + r.amount_cents, 0);
}
