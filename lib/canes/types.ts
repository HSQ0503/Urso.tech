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

export type LeadSource = "lead_vendor" | "website" | "referral" | "other";

export type Lead = {
  id: string;
  created_at: string;
  type: LeadType;
  status: LeadStatus;
  name: string | null;
  phone: string | null;
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
  | "estimate_reminder";

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
};

export type Thread = {
  peer_phone: string;
  lead: Lead | null;
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
  email: string | null; source: LeadSource; notes: string | null; last_activity_at: string;
};

export type Address = {
  id: string; created_at: string; contact_id: string | null; line: string;
  site_notes: string | null; is_primary: boolean;
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
};

export type EstimateWithItems = Estimate & { items: EstimateItem[] };

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
