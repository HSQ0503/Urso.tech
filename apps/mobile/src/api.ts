import type {
  Agenda,
  Call,
  Crew,
  CrewAccountRole,
  CrewPermissions,
  CustomerDetail,
  CustomerSummary,
  Estimate,
  Invoice,
  Job,
  JobWithItems,
  Lead,
  LeadEvent,
  Message,
  Overview,
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
const API_BASE: string = process.env.EXPO_PUBLIC_API_BASE ?? "https://urso.ws";

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

export const owner = {
  overview: () => request<Overview>("/canes/overview"),
  agenda: () => request<Agenda>("/canes/agenda"),

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
  invoices: () => request<Invoice[]>("/canes/invoices"),

  // The board is the owner's dispatch view; crews come with it so a job can be
  // shown with its assignment without a second round trip.
  scheduleBoard: (fromIso: string, toIso: string) =>
    request<unknown>(
      `/canes/schedule/board?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    ),
  unscheduled: () => request<Job[]>("/canes/schedule/unscheduled"),
  crews: () => request<Crew[]>("/canes/crews"),

  job: (id: string) => request<JobWithItems>(`/canes/jobs/${id}`),
};
