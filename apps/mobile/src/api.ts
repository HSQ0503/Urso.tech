import type {
  Agenda,
  BusinessExpense,
  Call,
  CanesSettings,
  Crew,
  CrewAccountRole,
  CatalogItem,
  CrewPermissions,
  CustomerDetail,
  CustomerSummary,
  Estimate,
  EstimateWithItems,
  Invoice,
  InvoiceReward,
  InvoiceWithItems,
  Job,
  JobWithItems,
  Lead,
  LeadEvent,
  LeadSource,
  Message,
  Overview,
  PayoutSummary,
  TeamMember,
  TodayReport,
  TechnicianJob,
  TechnicianWeek,
  Thread,
} from "@urso/types";
import { getAccessToken, signOut } from "./auth";
import { getAdminToken } from "./session";

// Typed client for /api/v1. Mirrors the server envelope exactly:
//   success →  { ok: true,  data: T }
//   refusal →  { ok: false, notice: string }
//
// The server returns that same shape for reads AND writes, so there is one
// result type in the whole app. A refusal is not an exception: a technician
// checking into a job someone else just cancelled gets ok:false with a sentence
// written for them, and the screen shows it verbatim. Only genuine transport
// failures throw.

// Static dot notation is required for the build-time inline (see auth.ts).
// Defaults to production so a release build without a .env still points at the
// real API rather than silently at localhost.
export const API_BASE: string = process.env.EXPO_PUBLIC_API_BASE ?? "https://urso.ws";

// `transient` marks the two transport failures (no connection, unparseable
// response) — the only refusals it is ever correct to retry. A server refusal
// is a sentence written for the reader and retrying it would just repeat the
// sentence; the query layer keys its retry policy off this flag.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; notice: string; transient?: true };

export class SessionExpiredError extends Error {
  constructor() {
    super("Sign in again.");
    this.name = "SessionExpiredError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  // Admin token first. An owner is not a Supabase user at all, so falling back
  // to getAccessToken() for them would find nothing; a technician has no admin
  // token, so the reverse holds. Whichever exists is the caller's identity, and
  // the server resolves the same actor either way.
  const token = (await getAdminToken()) ?? (await getAccessToken());
  if (!token) throw new SessionExpiredError();

  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    // No signal in a yard is the normal case, not an error state. Callers show
    // cached data and this notice rather than an alarming failure screen.
    return { ok: false, notice: "No connection. Showing the last update.", transient: true };
  }

  // 401 means the Supabase session is gone (expired, revoked, account
  // deactivated). Clear it so the app routes back to login instead of looping
  // on a token the server will never accept again.
  if (res.status === 401) {
    await signOut();
    throw new SessionExpiredError();
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, notice: "The server sent something unexpected.", transient: true };
  }

  const body = payload as { ok?: boolean; data?: T; notice?: string } | null;
  if (body && body.ok === true) return { ok: true, data: body.data as T };
  return { ok: false, notice: body?.notice ?? "That didn't go through — try again." };
}

// ── Crew endpoints (M2) ──────────────────────────────────────────────────────

export type CrewMe = {
  accountId: string;
  teamMemberId: string;
  email: string;
  name: string;
  phone: string | null;
  role: CrewAccountRole;
  permissions: CrewPermissions;
  crewIds: string[];
  crewNames: string[];
};

export const api = {
  me: () => request<CrewMe>("/canes/crew/me"),

  // No date parameter — the server computes the week from the business
  // calendar so the app and the web console always agree on its bounds.
  week: () => request<TechnicianWeek>("/canes/crew/week"),

  job: (jobId: string) => request<TechnicianJob>(`/canes/crew/jobs/${jobId}`),

  checkIn: (jobId: string) =>
    request<Record<string, never>>(`/canes/crew/jobs/${jobId}/check-in`, { method: "POST" }),

  checkOut: (jobId: string) =>
    request<Record<string, never>>(`/canes/crew/jobs/${jobId}/check-out`, { method: "POST" }),

  complete: (jobId: string) =>
    request<Record<string, never>>(`/canes/crew/jobs/${jobId}/complete`, { method: "POST" }),

  // Exactly one field per call — the server rejects zero or multiple with 422.
  setItemDone: (itemId: string, done: boolean) =>
    request<Record<string, never>>(`/canes/crew/items/${itemId}`, {
      method: "PATCH",
      body: { done },
    }),

  setItemBlocked: (itemId: string, blocked: boolean) =>
    request<Record<string, never>>(`/canes/crew/items/${itemId}`, {
      method: "PATCH",
      body: { blocked },
    }),

  setItemNote: (itemId: string, note: string) =>
    request<Record<string, never>>(`/canes/crew/items/${itemId}`, {
      method: "PATCH",
      body: { note },
    }),
};

// ── Owner endpoints (M6b) ────────────────────────────────────────────────────
//
// Reads only for now. Every one is permission-guarded server-side, so a call the
// signed-in account may not make comes back as ok:false with a sentence written
// for them — the screen shows it and moves on rather than treating it as a fault.

export type ScheduleJob = Job & { crew: Crew | null };

export type InsightsRange = "7d" | "30d" | "90d" | "12m";
export type OwnerInsights = {
  rangeKey: InsightsRange;
  rangeLabel: string;
  kpis: {
    collectedCents: number;
    collectedPrevCents: number;
    outstandingCents: number;
    outstandingCount: number;
    wonCents: number;
    wonCount: number;
    avgJobCents: number | null;
    paidJobs: number;
  };
  methodShare: { cash: number; card: number; other: number };
  expensesCents: number;
  marginCents: number;
  topServices: { name: string; cents: number; count: number }[];
  funnel: { label: string; count: number }[];
  revenueByCrew: {
    name: string;
    color: string;
    cents: number;
    jobs: number;
    expenseCents: number;
    marginCents: number;
  }[];
};

export const owner = {
  overview: () => request<Overview>("/canes/overview"),
  agenda: () => request<Agenda>("/canes/agenda"),

  // The Dashboard's report grid. Separate from overview because its window is
  // the ET CALENDAR DAY, not overview's rolling seven — a "today" card fed a
  // week's number is the exact mistake one shared payload would invite.
  todayReport: () => request<TodayReport>("/canes/today-report"),

  threads: () => request<Thread[]>("/canes/threads"),
  threadMessages: (phone: string) =>
    request<Message[]>(`/canes/threads/${encodeURIComponent(phone)}/messages`),
  threadCalls: (phone: string) =>
    request<Call[]>(`/canes/threads/${encodeURIComponent(phone)}/calls`),

  leads: () => request<Lead[]>("/canes/leads"),
  lead: (id: string) => request<Lead>(`/canes/leads/${id}`),
  leadEvents: (id: string) => request<LeadEvent[]>(`/canes/leads/${id}/events`),
  leadCalls: (id: string) => request<Call[]>(`/canes/leads/${id}/calls`),

  customers: () => request<CustomerSummary[]>("/canes/customers"),
  customer: (id: string) => request<CustomerDetail>(`/canes/customers/${id}`),

  estimates: () => request<Estimate[]>("/canes/estimates"),
  estimate: (id: string) => request<EstimateWithItems>(`/canes/estimates/${id}`),
  invoices: () => request<Invoice[]>("/canes/invoices"),
  invoice: (id: string) => request<InvoiceWithItems>(`/canes/invoices/${id}`),
  invoiceRewards: (id: string) => request<InvoiceReward[]>(`/canes/invoices/${id}/rewards`),

  // The board is the owner's dispatch view; crews come with it so a job can be
  // shown with its assignment without a second round trip.
  scheduleBoard: (fromIso: string, toIso: string) =>
    request<unknown>(
      `/canes/schedule/board?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    ),
  unscheduled: () => request<Job[]>("/canes/schedule/unscheduled"),

  // Every job — the Work Orders list. There is no web equivalent: on that
  // surface a job is only reachable through the schedule or its customer.
  jobs: () => request<Job[]>("/canes/jobs"),
  crews: () => request<Crew[]>("/canes/crews"),

  job: (id: string) => request<JobWithItems>(`/canes/jobs/${id}`),

  // OWNER ONLY server-side (the roster carries pay terms). Fetched lazily at
  // the moments that need a name — never on screen mount — so an ops manager
  // simply proceeds without it instead of reading a refusal about payroll.
  team: () => request<TeamMember[]>("/canes/team"),

  // The service catalog behind both builders — quick-add without typing a
  // price from memory.
  catalog: () => request<CatalogItem[]>("/canes/catalog"),
  expenses: () => request<BusinessExpense[]>("/canes/expenses"),
  payouts: (range: "day" | "week" | "month" | "year") =>
    request<PayoutSummary>(`/canes/payouts?range=${range}`),
  insights: (range: InsightsRange) =>
    request<OwnerInsights>(`/canes/insights?range=${range}`),
  settings: () => request<CanesSettings>("/canes/settings"),
};

// ── Owner mutations (O1) ─────────────────────────────────────────────────────
//
// One function per dispatchable action, posting { action, ...params } to the
// resource's actions route. Param shapes mirror the ROUTE's validation exactly
// (see app/api/v1/canes/*/actions/route.ts) — the route refuses shape, the
// action refuses meaning, and both refusals arrive as a sentence the screen
// shows verbatim. Nothing here re-validates: a second copy of a rule is a
// second copy to drift.
//
// Money is integer cents in these signatures, always. The dollars-to-cents
// conversion belongs to the input component at the edge, nowhere else.

const act = <T = Record<string, never>>(path: string, body: Record<string, unknown>) =>
  request<T>(path, { method: "POST", body });

export type LeadPatch = Partial<
  Record<"name" | "phone" | "email" | "address" | "service" | "notes" | "source", string>
>;
export type CustomerPatch = Partial<
  Record<"name" | "phone" | "email" | "notes", string> & { archived: boolean }
>;
export type JobDetailsPatch = Partial<Record<"notes" | "gateCode" | "siteNotes", string>>;
export type CallOutcome = "closed" | "follow_up" | "no_answer" | "lost";

// Click-to-call through the Twilio bridge. NOT a tel: link: this rings
// Sebastian first and dials the customer with the BUSINESS number as caller ID,
// writing a call row and a lead event. The explicitly labelled direct-dial
// fallback remains available when the bridge itself is unavailable.
export const callActions = {
  bridge: (phone: string, leadId?: string) =>
    act("/canes/calls/bridge", { phone, leadId }),
};

export const expenseActions = {
  addBusiness: (input: {
    name: string;
    amountCents: number;
    category: string;
    recurring: boolean;
    frequency: string;
    note?: string;
  }) => act("/canes/expenses", { action: "addBusiness", ...input }),
  deleteBusiness: (id: string) => act("/canes/expenses", { action: "deleteBusiness", id }),
};

export const catalogActions = {
  upsert: (input: {
    id?: string;
    name: string;
    kind: "service" | "product";
    defaultPriceCents: number;
    description?: string | null;
    unit?: string;
    taxable?: boolean;
    active?: boolean;
    position?: number;
  }) => act("/canes/catalog/actions", { action: "upsert", ...input }),
  delete: (id: string) => act("/canes/catalog/actions", { action: "delete", id }),
};

export const settingsActions = {
  save: (settings: Record<string, unknown>) =>
    act("/canes/settings/actions", { action: "save", settings }),
};

// Creating a lead and creating a customer post to the COLLECTION, not to a
// resource's actions route, because there is no resource yet — the same shape
// jobActions.createManual uses. Both return the new id so the caller can land
// on the record instead of on a list the owner then has to search.
//
// Field names mirror the routes' own validation exactly (leads/route.ts and
// customers/route.ts): the route refuses shape, the action refuses meaning, and
// nothing here re-validates.
export const leadActions = {
  create: (input: {
    name: string;
    phone: string;
    type: "hot" | "cold";
    source: LeadSource;
    email?: string;
    service?: string;
    address?: string;
  }) => act<{ leadId?: string }>("/canes/leads", { action: "create", ...input }),
  setStatus: (id: string, status: string, lostReason?: string) =>
    act(`/canes/leads/${id}/actions`, { action: "setStatus", status, lostReason }),
  snooze: (id: string, untilIso: string) =>
    act(`/canes/leads/${id}/actions`, { action: "snooze", untilIso }),
  update: (id: string, fields: LeadPatch) =>
    act(`/canes/leads/${id}/actions`, { action: "update", fields }),
  setAppointment: (id: string, appointmentIso: string) =>
    act(`/canes/leads/${id}/actions`, { action: "setAppointment", appointmentIso }),
  logCallOutcome: (id: string, outcome: CallOutcome, detail?: string) =>
    act(`/canes/leads/${id}/actions`, { action: "logCallOutcome", outcome, detail }),
  // The peer phone rides in the body because the thread key IS the peer phone —
  // the web composer is handed it the same way, so mobile can never text a
  // different number than web does for the same thread.
  sendMessage: (id: string, phone: string, message: string) =>
    act(`/canes/leads/${id}/actions`, { action: "sendMessage", phone, message }),
  sendConfirmationNow: (id: string) =>
    act(`/canes/leads/${id}/actions`, { action: "sendConfirmationNow" }),
  delete: (id: string) => act(`/canes/leads/${id}/actions`, { action: "delete" }),
};

// Texting a thread that has NO lead. The lead route carries the lead id as a
// path segment, so it cannot express this send at all — but the web composer
// makes it on any thread, and a contact created outside the lead flow (or one
// whose lead was deleted) is a real conversation. Same server action either
// way; only the lead-side bookkeeping differs, which is why the two calls stay
// separate rather than one call with a nullable id.
export const threadActions = {
  sendMessage: (phone: string, message: string) =>
    act(`/canes/threads/${encodeURIComponent(phone)}/messages`, { message }),
};

export const customerActions = {
  create: (input: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    source?: LeadSource;
  }) => act<{ contactId?: string }>("/canes/customers", { action: "create", ...input }),
  update: (id: string, fields: CustomerPatch) =>
    act(`/canes/customers/${id}/actions`, { action: "update", fields }),
  addAddress: (id: string, line: string, siteNotes?: string) =>
    act(`/canes/customers/${id}/actions`, { action: "addAddress", line, siteNotes }),
  setPrimaryAddress: (id: string, addressId: string) =>
    act(`/canes/customers/${id}/actions`, { action: "setPrimaryAddress", addressId }),
  delete: (id: string) => act(`/canes/customers/${id}/actions`, { action: "delete" }),
};

export const jobActions = {
  // crewId is REQUIRED and explicitly nullable on schedule: the action has no
  // "keep the crew" value here, so an absent key would quietly unassign. `move`
  // is the one that can leave the crew alone by omitting it.
  schedule: (id: string, scheduledIso: string, durationMinutes: number, crewId: string | null) =>
    act(`/canes/jobs/${id}/actions`, { action: "schedule", scheduledIso, durationMinutes, crewId }),
  move: (
    id: string,
    scheduledIso: string | null,
    opts?: { durationMinutes?: number; crewId?: string | null },
  ) => act(`/canes/jobs/${id}/actions`, { action: "move", scheduledIso, ...opts }),
  unschedule: (id: string) => act(`/canes/jobs/${id}/actions`, { action: "unschedule" }),
  assign: (id: string, crewId: string | null) =>
    act(`/canes/jobs/${id}/actions`, { action: "assign", crewId }),
  setStatus: (id: string, status: string, reason?: string) =>
    act(`/canes/jobs/${id}/actions`, { action: "setStatus", status, reason }),
  updateDetails: (id: string, fields: JobDetailsPatch) =>
    act(`/canes/jobs/${id}/actions`, { action: "updateDetails", fields }),
  setRecurrence: (id: string, recurrence: string) =>
    act(`/canes/jobs/${id}/actions`, { action: "setRecurrence", recurrence }),
  addChecklistItem: (id: string, name: string, required: boolean) =>
    act(`/canes/jobs/${id}/items`, { action: "add", name, required }),
  removeChecklistItem: (id: string, itemId: string) =>
    act(`/canes/jobs/${id}/items`, { action: "remove", itemId }),
  start: (id: string) => act(`/canes/jobs/${id}/actions`, { action: "start" }),
  // On success the payload carries invoiceId — completing a job mints its bill.
  complete: (id: string) =>
    act<{ invoiceId?: string }>(`/canes/jobs/${id}/actions`, { action: "complete" }),
  reopen: (id: string) => act(`/canes/jobs/${id}/actions`, { action: "reopen" }),
  delete: (id: string) => act(`/canes/jobs/${id}/actions`, { action: "delete" }),
  recordDeposit: (id: string, amountCents: number, method: string) =>
    act(`/canes/jobs/${id}/actions`, { action: "recordDeposit", amountCents, method }),
  // A job with no estimate behind it — the neighbour who walks up mid-driveway.
  // Posts to the jobs COLLECTION, not a job's actions, because there is no job
  // yet. Returns the new id so the caller can land on its sheet.
  createManual: (input: {
    contactId?: string;
    customerName: string;
    customerPhone?: string;
    jobAddress?: string;
    jobName: string;
    totalCents: number;
    scheduledAtIso?: string;
    crewId?: string;
    notes?: string;
  }) => act<{ jobId?: string }>("/canes/jobs", { action: "createManual", ...input }),
};

export type InvoiceLineInput = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceCents: number;
};

export const invoiceActions = {
  // A bill for work that never went through the schedule — a repeat customer, a
  // fix-up, a referral he did on a Saturday. Until this existed the phone could
  // only mint an invoice as a side effect of completing a job, so any billing
  // that skipped the board meant walking to a desk.
  createManual: (input: {
    customerName: string;
    jobName: string;
    totalCents: number;
    contactId?: string;
    customerPhone?: string;
    customerEmail?: string;
    jobAddress?: string;
  }) => act<{ invoiceId?: string }>("/canes/invoices", { action: "createManual", ...input }),
  // Insert-only against the partial unique index on job_id, so a second call
  // returns the existing bill rather than a duplicate.
  createFromJob: (jobId: string) =>
    act<{ invoiceId?: string }>("/canes/invoices", { action: "createFromJob", jobId }),
  // Replace-all, but NEVER to empty and never once money or Square has touched
  // the bill — the action owns those refusals. New in O3c: invoice_items were
  // write-once until now.
  saveItems: (id: string, items: InvoiceLineInput[]) =>
    act(`/canes/invoices/${id}/actions`, { action: "saveItems", items }),
  // Draft-only (contact fields excepted) is the action's rule; the patch is
  // built field-by-field at the route so absent ≠ empty.
  update: (
    id: string,
    patch: Partial<{
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      contactId: string | null;
      jobName: string;
      jobAddress: string;
      adjustmentCents: number;
      messageToCustomer: string;
      terms: string;
      internalNotes: string;
    }>,
  ) => act(`/canes/invoices/${id}/actions`, { action: "update", ...patch }),
  // No options = text and email whatever the invoice snapshot carries.
  send: (id: string, opts?: { channels?: { email?: boolean; text?: boolean }; toEmail?: string; toPhone?: string }) =>
    act(`/canes/invoices/${id}/actions`, { action: "send", ...opts }),
  // MONEY: the one action here that writes a payments-ledger row.
  recordCashPayment: (id: string, amountCents: number) =>
    act(`/canes/invoices/${id}/actions`, { action: "recordCashPayment", amountCents }),
  void: (id: string) => act(`/canes/invoices/${id}/actions`, { action: "void" }),
  delete: (id: string) => act(`/canes/invoices/${id}/actions`, { action: "delete" }),
  setRewardOffer: (id: string, kind: string, enabled: boolean) =>
    act(`/canes/invoices/${id}/actions`, { action: "setRewardOffer", kind, enabled }),
  // Keyed by REWARD id — the invoice id in the path is navigation context.
  // Approving is the money mutation: the reward enters recomputeInvoiceTotals.
  setRewardApproval: (id: string, rewardId: string, approve: boolean, attributedMemberId?: string | null) =>
    act(`/canes/invoices/${id}/actions`, { action: "setRewardApproval", rewardId, approve, attributedMemberId }),
};

export type EstimateLineInput = {
  catalogId?: string | null;
  name: string;
  description?: string | null;
  kind: string;
  quantity: number;
  unitPriceCents: number;
  discountCents?: number;
  taxable?: boolean;
  isOption?: boolean;
  isMandatory?: boolean;
  packageGroup?: string | null;
};

export const estimateActions = {
  // The three ways a quote begins. All end in createEstimate, which returns the
  // new id — the caller navigates straight into the builder with it. An estimate
  // is created EMPTY and priced afterwards through saveItems, so none of these
  // carries money.
  // Copy a quote, lines and all — the same driveway priced for the next house.
  // Omitting contactId re-quotes the same customer. Totals are recomputed
  // server-side from the copied lines, never carried across.
  duplicate: (id: string, contactId?: string) =>
    act<{ estimateId?: string }>(`/canes/estimates/${id}/actions`, {
      action: "duplicate",
      ...(contactId ? { contactId } : {}),
    }),
  createFromLead: (leadId: string) =>
    act<{ estimateId?: string }>("/canes/estimates", { action: "createFromLead", leadId }),
  createForCustomer: (contactId: string) =>
    act<{ estimateId?: string }>("/canes/estimates", { action: "createForCustomer", contactId }),
  create: (input: {
    estimateType: "standard" | "options" | "packages";
    contactId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    jobAddress?: string;
    jobName?: string;
  }) => act<{ estimateId?: string }>("/canes/estimates", { action: "create", input }),
  // Replace-all, draft-only. An empty array is a legitimate "clear the lines"
  // on an estimate — it is an offer being shaped, not a demand.
  saveItems: (id: string, items: EstimateLineInput[]) =>
    act(`/canes/estimates/${id}/actions`, { action: "saveItems", items }),
  update: (
    id: string,
    patch: Partial<{
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      contactId: string | null;
      jobAddress: string;
      jobName: string;
      estimateType: "standard" | "options" | "packages";
      adjustmentCents: number;
      depositPercent: number;
      messageToCustomer: string;
      terms: string;
      internalNotes: string;
      expiresAtIso: string | null;
      employee: string;
    }>,
  ) => act(`/canes/estimates/${id}/actions`, { action: "update", patch }),
  send: (id: string, opts?: { channels?: { email?: boolean; text?: boolean }; toEmail?: string; toPhone?: string }) =>
    act(`/canes/estimates/${id}/actions`, { action: "send", ...opts }),
  void: (id: string) => act(`/canes/estimates/${id}/actions`, { action: "void" }),
  delete: (id: string) => act(`/canes/estimates/${id}/actions`, { action: "delete" }),
  // The GUARDED owner twin of the public approveEstimate — same finalize path
  // (job, deposit, lead → won), signature recorded as an in-person agreement.
  // depositMethod defaults to cash inside the action when absent.
  approveInPerson: (id: string, opts?: { depositCollected?: boolean; depositMethod?: string }) =>
    act(`/canes/estimates/${id}/actions`, { action: "approveInPerson", ...opts }),
};
