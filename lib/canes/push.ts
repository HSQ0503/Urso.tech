import type { ApiActor } from "@/lib/api/v1";
import { canesConfigured, canesDb } from "@/lib/canes/supabase";

export const PUSH_EVENT_TYPES = [
  "new_lead",
  "customer_message",
  "lead_uncontacted",
  "estimate_approved",
  "deposit_received",
  "invoice_paid",
  "payment_issue",
  "job_changed",
  "checklist_blocked",
  "crew_late",
  "morning_summary",
  "daily_followups",
  // Everything alertOwner() used to text: escalations, failed sends, Square
  // warnings. Its own category so Sebastian can quiet it without losing leads.
  "owner_alert",
] as const;

export type PushEventType = (typeof PUSH_EVENT_TYPES)[number];
export type PushUrgency = "time_sensitive" | "active" | "summary";
export type PushWorkspace = "owner" | "crew";
export type PushRecipientKind = "owner" | "crew";

export const DEFAULT_PUSH_EVENT_TYPES: Record<PushEventType, boolean> = {
  new_lead: true,
  customer_message: true,
  lead_uncontacted: true,
  estimate_approved: true,
  deposit_received: true,
  invoice_paid: true,
  payment_issue: true,
  job_changed: true,
  checklist_blocked: true,
  crew_late: true,
  morning_summary: true,
  daily_followups: true,
  owner_alert: true,
};

type PushIdentity = {
  recipientKind: PushRecipientKind;
  recipientId: string;
  allowedWorkspaces: PushWorkspace[];
};

type PushPreferences = {
  enabled: boolean;
  eventTypes: Record<PushEventType, boolean>;
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone: string;
  };
};

type DeviceRegistration = {
  installationId: string;
  expoPushToken: string;
  platform: "ios" | "android";
  workspace: PushWorkspace;
  deviceName?: string;
  appVersion?: string;
  buildNumber?: string;
  timezone?: string;
};

type PushAudience =
  | { kind: "owner" }
  | { kind: "crew_accounts"; accountIds: string[]; crewId?: string };

type ResolvedPushAudience =
  | { kind: "owner" }
  | { kind: "crew_accounts"; crewId: string };

export type CanesPush = {
  dedupeKey: string;
  audience: PushAudience;
  eventType: PushEventType;
  urgency: PushUrgency;
  title: string;
  body: string;
  href: string;
  entityId?: string;
  // Immutable business-state snapshot captured by the successful mutation.
  // It is persisted with the outbox event and revalidated before every retry.
  state?: Record<string, unknown>;
};

export type CanesPushResult = {
  ok: boolean;
  accepted: number;
  failed: number;
  // `persisted` separates a provider failure (safe: the outbox will retry)
  // from an outbox-write failure (unsafe: the source webhook must retry).
  persisted: boolean;
  skipped?: string;
};

type PushDeviceRow = {
  id: string;
  expo_push_token: string;
  recipient_kind: PushRecipientKind;
  recipient_id: string;
  workspace: PushWorkspace;
  timezone: string;
};

type PreferenceRow = {
  recipient_kind: PushRecipientKind;
  recipient_id: string;
  enabled: boolean;
  categories: Record<string, unknown> | null;
  quiet_hours_enabled: boolean;
  quiet_start_hour: number;
  quiet_end_hour: number;
  timezone: string;
};

type PushDeliveryRow = {
  id: string;
  event_id?: string;
  device_id: string;
  expo_ticket_id: string | null;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type CrewJobAudienceState = {
  crewId: string | null;
  status: string;
  scheduledAt: string | null;
  endsAt: string | null;
};

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const DEFAULT_TIMEZONE = "America/New_York";
const CANES_OWNER_EMAIL = (process.env.CANES_OWNER_EMAIL ?? "canespressurewashing@gmail.com")
  .trim()
  .toLowerCase();
const MAX_EXPO_BATCH = 100;
const MAX_RECEIPT_BATCH = 100;
const MAX_OUTBOX_BATCH = 5;
const OUTBOX_CONCURRENCY = 5;
const PROVIDER_ATTEMPT_BUDGET_MS = 12_000;
const CREW_ID = Symbol("canes-push-crew-id");
const SCHEDULED_JOB_STATES = new Set(["scheduled", "confirmed"]);

type CrewAccountIdList = string[] & { [CREW_ID]?: string };

function sameInstant(actual: unknown, expected: unknown): boolean {
  if (actual === null || expected === null) return actual === expected;
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualMs = new Date(actual).getTime();
  const expectedMs = new Date(expected).getTime();
  return Number.isFinite(actualMs) && Number.isFinite(expectedMs) && actualMs === expectedMs;
}

function compactText(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isExpoPushToken(value: string): boolean {
  return value.length <= 256 &&
    /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(value);
}

export function isPushEventType(value: string): value is PushEventType {
  return (PUSH_EVENT_TYPES as readonly string[]).includes(value);
}

export function pushIdentityForActor(actor: ApiActor): PushIdentity {
  if (actor.kind === "admin") {
    return {
      recipientKind: "owner",
      recipientId: actor.email.trim().toLowerCase(),
      allowedWorkspaces: ["owner"],
    };
  }
  return {
    recipientKind: "crew",
    recipientId: actor.actor.accountId,
    allowedWorkspaces: actor.actor.role === "ops_manager" ? ["owner", "crew"] : ["crew"],
  };
}

function mergedEventTypes(categories: Record<string, unknown> | null | undefined) {
  const merged = { ...DEFAULT_PUSH_EVENT_TYPES };
  for (const eventType of PUSH_EVENT_TYPES) {
    if (typeof categories?.[eventType] === "boolean") {
      merged[eventType] = categories[eventType] as boolean;
    }
  }
  return merged;
}

function preferencesFromRow(row: PreferenceRow | null): PushPreferences {
  return {
    enabled: row?.enabled ?? true,
    eventTypes: mergedEventTypes(row?.categories),
    quietHours: {
      enabled: row?.quiet_hours_enabled ?? true,
      startHour: row?.quiet_start_hour ?? 21,
      endHour: row?.quiet_end_hour ?? 7,
      timezone: row?.timezone ?? DEFAULT_TIMEZONE,
    },
  };
}

export async function getPushPreferences(actor: ApiActor): Promise<PushPreferences> {
  const identity = pushIdentityForActor(actor);
  const { data, error } = await canesDb()
    .from("push_notification_preferences")
    .select("recipient_kind, recipient_id, enabled, categories, quiet_hours_enabled, quiet_start_hour, quiet_end_hour, timezone")
    .eq("recipient_kind", identity.recipientKind)
    .eq("recipient_id", identity.recipientId)
    .maybeSingle();
  if (error) throw new Error(`getPushPreferences: ${error.message}`);
  return preferencesFromRow((data as PreferenceRow | null) ?? null);
}

export async function updatePushPreferences(
  actor: ApiActor,
  patch: {
    enabled?: boolean;
    eventTypes?: Partial<Record<PushEventType, boolean>>;
    quietHours?: Partial<PushPreferences["quietHours"]>;
  },
): Promise<PushPreferences> {
  const identity = pushIdentityForActor(actor);
  const quiet = patch.quietHours;
  if (
    (quiet?.startHour !== undefined && (
      !Number.isInteger(quiet.startHour) || quiet.startHour < 0 || quiet.startHour > 23
    )) ||
    (quiet?.endHour !== undefined && (
      !Number.isInteger(quiet.endHour) || quiet.endHour < 0 || quiet.endHour > 23
    )) ||
    (quiet?.timezone !== undefined && !validTimezone(quiet.timezone))
  ) {
    throw new Error("Invalid notification quiet hours.");
  }
  const { data, error } = await canesDb().rpc("merge_push_notification_preferences", {
    p_recipient_kind: identity.recipientKind,
    p_recipient_id: identity.recipientId,
    p_enabled: patch.enabled ?? null,
    p_categories: patch.eventTypes ?? {},
    p_quiet_hours_enabled: quiet?.enabled ?? null,
    p_quiet_start_hour: quiet?.startHour ?? null,
    p_quiet_end_hour: quiet?.endHour ?? null,
    p_timezone: quiet?.timezone ?? null,
  });
  if (error) throw new Error(`updatePushPreferences: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as PreferenceRow | null;
  if (!row) throw new Error("updatePushPreferences: preference merge returned no row");
  return preferencesFromRow(row);
}

export async function registerPushDevice(actor: ApiActor, input: DeviceRegistration) {
  const identity = pushIdentityForActor(actor);
  if (!identity.allowedWorkspaces.includes(input.workspace)) {
    throw new Error("This account cannot register for that workspace.");
  }
  if (!validTimezone(input.timezone ?? DEFAULT_TIMEZONE)) {
    throw new Error("Invalid device timezone.");
  }
  const db = canesDb();
  const { error: registrationError } = await db.rpc("register_push_device", {
    p_device_install_id: input.installationId,
    p_expo_push_token: input.expoPushToken,
    p_recipient_kind: identity.recipientKind,
    p_recipient_id: identity.recipientId,
    p_workspace: input.workspace,
    p_platform: input.platform,
    p_timezone: input.timezone ?? DEFAULT_TIMEZONE,
    p_device_name: input.deviceName ? compactText(input.deviceName, 120) : null,
    p_app_version: input.appVersion ? compactText(input.appVersion, 40) : null,
    p_build_number: input.buildNumber ? compactText(input.buildNumber, 40) : null,
  });
  if (registrationError) throw new Error(`registerPushDevice: ${registrationError.message}`);

  const { error: preferenceError } = await db.from("push_notification_preferences").upsert(
    {
      recipient_kind: identity.recipientKind,
      recipient_id: identity.recipientId,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "recipient_kind,recipient_id" },
  );
  if (preferenceError) throw new Error(`registerPushDevice preferences: ${preferenceError.message}`);
  return { registered: true };
}

export async function disablePushDevice(
  actor: ApiActor,
  installationId: string,
  workspace: PushWorkspace,
) {
  const identity = pushIdentityForActor(actor);
  const now = new Date().toISOString();
  const { data, error } = await canesDb()
    .from("push_devices")
    .update({ enabled: false, disabled_at: now, updated_at: now })
    .eq("device_install_id", installationId)
    .eq("recipient_kind", identity.recipientKind)
    .eq("recipient_id", identity.recipientId)
    .eq("workspace", workspace)
    .select("id");
  if (error) throw new Error(`disablePushDevice: ${error.message}`);
  return { disabled: (data?.length ?? 0) > 0 };
}

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    out.push(rows.slice(index, index + size));
  }
  return out;
}

function isQuietNow(preferences: PushPreferences, now = new Date()): boolean {
  const quiet = preferences.quietHours;
  if (!quiet.enabled || quiet.startHour === quiet.endHour) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: quiet.timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return quiet.startHour < quiet.endHour
    ? hour >= quiet.startHour && hour < quiet.endHour
    : hour >= quiet.startHour || hour < quiet.endHour;
}

function remainingBudget(deadlineAt?: number): number {
  return deadlineAt ? deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
}

async function expoRequest(url: string, body: unknown, deadlineAt?: number): Promise<unknown> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  // Business webhooks await the first delivery attempt. Keep that path below
  // Twilio/Square timeout budgets; the durable outbox owns longer retries.
  const delays = [0, 250];
  let lastError: Error | null = null;
  for (const delay of delays) {
    if (remainingBudget(deadlineAt) <= delay + 500) {
      throw lastError ?? new Error("Expo push attempt stopped at the cron deadline.");
    }
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    let response: Response;
    try {
      const timeout = Math.min(4_000, Math.max(250, remainingBudget(deadlineAt) - 250));
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
    const raw = await response.text();
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`Expo push service returned ${response.status}.`);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Expo push service returned ${response.status}: ${compactText(raw, 300)}`);
    }
    return raw ? JSON.parse(raw) as unknown : {};
  }
  throw lastError ?? new Error("Expo push service request failed.");
}

async function crewIdForAccountIds(accountIds: string[]): Promise<string | null> {
  const taggedCrewId = (accountIds as CrewAccountIdList)[CREW_ID];
  if (taggedCrewId) return taggedCrewId;
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return null;
  const db = canesDb();
  const { data: accountData, error: accountError } = await db
    .from("crew_accounts")
    .select("team_member_id")
    .eq("active", true)
    .in("id", ids);
  if (accountError) throw new Error(`crew audience accounts: ${accountError.message}`);
  const memberIds = (accountData ?? []).flatMap((row) => {
    const memberId = (row as { team_member_id?: unknown }).team_member_id;
    return typeof memberId === "string" ? [memberId] : [];
  });
  if (memberIds.length === 0) return null;
  const { data: memberData, error: memberError } = await db
    .from("team_members")
    .select("crew_id")
    .eq("active", true)
    .in("id", memberIds);
  if (memberError) throw new Error(`crew audience roster: ${memberError.message}`);
  const crewIds = new Set((memberData ?? []).flatMap((row) => {
    const crewId = (row as { crew_id?: unknown }).crew_id;
    return typeof crewId === "string" ? [crewId] : [];
  }));
  return crewIds.size === 1 ? [...crewIds][0] : null;
}

async function resolveAudience(audience: PushAudience): Promise<ResolvedPushAudience | null> {
  if (audience.kind === "owner") return audience;
  const crewId = audience.crewId ?? await crewIdForAccountIds(audience.accountIds);
  return crewId ? { kind: "crew_accounts", crewId } : null;
}

// Whether the owner audience can be reached by push AT ALL, ignoring per-event
// preferences. alertOwner() uses this to decide between push and its SMS
// fallback: no device means Sebastian still needs a text; a device with the
// category switched off means he chose silence, and SMS must not override that.
export async function ownerHasPushDevice(): Promise<boolean> {
  if (!canesConfigured()) return false;
  const devices = await devicesForAudience({ kind: "owner" });
  return devices.length > 0;
}

async function devicesForAudience(audience: ResolvedPushAudience): Promise<PushDeviceRow[]> {
  if (audience.kind === "owner") {
    // Platform support admins can open the owner console, but they are not the
    // business owner and must never receive Sebastian's operational alerts.
    // Active ops managers deliberately share the operational owner audience;
    // technicians never do, even if a stale client asks for owner workspace.
    const db = canesDb();
    const [{ data: ownerDevices, error: ownerError }, { data: opsAccounts, error: opsError }] = await Promise.all([
      db.from("push_devices")
        .select("id, expo_push_token, recipient_kind, recipient_id, workspace, timezone")
        .eq("enabled", true)
      .eq("workspace", "owner")
      .eq("recipient_kind", "owner")
        .eq("recipient_id", CANES_OWNER_EMAIL),
      db.from("crew_accounts")
        .select("id")
        .eq("active", true)
        .eq("account_role", "ops_manager"),
    ]);
    if (ownerError) throw new Error(`owner push devices: ${ownerError.message}`);
    if (opsError) throw new Error(`ops push accounts: ${opsError.message}`);
    const opsIds = (opsAccounts ?? []).map((row) => row.id as string);
    if (opsIds.length === 0) return (ownerDevices ?? []) as PushDeviceRow[];
    const { data: opsDevices, error: opsDeviceError } = await db
      .from("push_devices")
      .select("id, expo_push_token, recipient_kind, recipient_id, workspace, timezone")
      .eq("enabled", true)
      .eq("workspace", "owner")
      .eq("recipient_kind", "crew")
      .in("recipient_id", opsIds);
    if (opsDeviceError) throw new Error(`ops push devices: ${opsDeviceError.message}`);
    return [...(ownerDevices ?? []), ...(opsDevices ?? [])] as PushDeviceRow[];
  }
  // Resolve the live roster for every delivery attempt. This deliberately
  // ignores the account snapshot from event creation: deactivated accounts
  // and technicians moved to another crew must not receive a delayed retry.
  const accountIds = await crewAccountIdsForCrew(audience.crewId);
  if (accountIds.length === 0) return [];
  const query = canesDb()
    .from("push_devices")
    .select("id, expo_push_token, recipient_kind, recipient_id, workspace, timezone")
    .eq("enabled", true)
    .eq("recipient_kind", "crew")
    .eq("workspace", "crew")
    .in("recipient_id", accountIds);
  const { data, error } = await query;
  if (error) throw new Error(`devicesForAudience: ${error.message}`);
  return (data ?? []) as PushDeviceRow[];
}

function audienceKey(audience: ResolvedPushAudience): string {
  return audience.kind === "owner"
    ? "owner:workspace"
    : `crew_id:${audience.crewId}`;
}

function eventData(input: CanesPush, audience: ResolvedPushAudience) {
  return {
    workspace: audience.kind === "owner" ? "owner" : "crew",
    href: input.href,
    eventType: input.eventType,
    ...(audience.kind === "crew_accounts" ? { audienceCrewId: audience.crewId } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.state ? { expectedState: input.state } : {}),
  };
}

async function eventDataWithAudienceState(
  input: CanesPush,
  audience: ResolvedPushAudience,
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = eventData(input, audience);
  if (
    audience.kind !== "crew_accounts" ||
    input.eventType !== "job_changed" ||
    !input.entityId
  ) {
    return data;
  }
  const supplied = input.state?.jobState;
  if (crewJobAudienceState(supplied)) {
    return { ...data, audienceJobState: supplied };
  }
  const { data: job, error } = await canesDb()
    .from("jobs")
    .select("crew_id, status, scheduled_at, ends_at")
    .eq("id", input.entityId)
    .maybeSingle();
  if (error) throw new Error(`crew event state: ${error.message}`);
  if (!job) return { ...data, audienceJobMissing: true };
  return {
    ...data,
    audienceJobState: {
      crewId: typeof job.crew_id === "string" ? job.crew_id : null,
      status: typeof job.status === "string" ? job.status : "",
      scheduledAt: typeof job.scheduled_at === "string" ? job.scheduled_at : null,
      endsAt: typeof job.ends_at === "string" ? job.ends_at : null,
    } satisfies CrewJobAudienceState,
  };
}

function crewJobAudienceState(value: unknown): CrewJobAudienceState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    (typeof row.crewId !== "string" && row.crewId !== null) ||
    typeof row.status !== "string" ||
    (typeof row.scheduledAt !== "string" && row.scheduledAt !== null) ||
    (typeof row.endsAt !== "string" && row.endsAt !== null)
  ) {
    return null;
  }
  return {
    crewId: row.crewId,
    status: row.status,
    scheduledAt: row.scheduledAt,
    endsAt: row.endsAt,
  } as CrewJobAudienceState;
}

async function crewEventIsCurrent(
  input: CanesPush,
  audience: ResolvedPushAudience,
  data: Record<string, unknown>,
): Promise<boolean> {
  if (audience.kind !== "crew_accounts" || input.eventType !== "job_changed") return true;
  if (data.audienceJobMissing === true) return false;
  if (!input.entityId) return true;
  const expected = crewJobAudienceState(data.audienceJobState);
  if (!expected) return false;
  const { data: job, error } = await canesDb()
    .from("jobs")
    .select("crew_id, status, scheduled_at, ends_at")
    .eq("id", input.entityId)
    .maybeSingle();
  if (error) throw new Error(`crew event revalidation: ${error.message}`);
  if (!job) return false;
  // A removal alert stays relevant through A→B→C; crew A still needs to know
  // the job left them. It becomes stale only if the job is assigned back to A.
  if (input.href === "/(crew)") {
    return (typeof job.crew_id === "string" ? job.crew_id : null) !== audience.crewId;
  }
  const currentStatus = typeof job.status === "string" ? job.status : "";
  const statusMatches = currentStatus === expected.status ||
    (SCHEDULED_JOB_STATES.has(currentStatus) && SCHEDULED_JOB_STATES.has(expected.status));
  return (typeof job.crew_id === "string" ? job.crew_id : null) === expected.crewId &&
    statusMatches &&
    sameInstant(job.scheduled_at ?? null, expected.scheduledAt) &&
    sameInstant(job.ends_at ?? null, expected.endsAt);
}

async function eventIsCurrent(
  input: CanesPush,
  audience: ResolvedPushAudience,
  data: Record<string, unknown>,
): Promise<boolean> {
  if (!await crewEventIsCurrent(input, audience, data)) return false;
  if (!input.entityId) return true;

  const expectedState = typeof data.expectedState === "object" && data.expectedState !== null
    ? data.expectedState as Record<string, unknown>
    : null;

  if (input.eventType === "new_lead") {
    const expected = expectedState?.leadState;
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
    const leadState = expected as Record<string, unknown>;
    const { data: lead, error } = await canesDb()
      .from("leads")
      .select("status, opportunity_started_at, created_at")
      .eq("id", input.entityId)
      .maybeSingle();
    if (error) throw new Error(`new lead revalidation: ${error.message}`);
    if (!lead) return false;
    return lead.status === leadState.status &&
      sameInstant(lead.opportunity_started_at ?? lead.created_at, leadState.opportunityStartedAt);
  }

  if (input.eventType === "estimate_approved") {
    const estimateId = typeof expectedState?.estimateId === "string"
      ? expectedState.estimateId
      : null;
    const expected = expectedState?.estimateState;
    if (!estimateId || !expected || typeof expected !== "object" || Array.isArray(expected)) {
      return false;
    }
    const estimateState = expected as Record<string, unknown>;
    const { data: estimate, error } = await canesDb()
      .from("estimates")
      .select("status, approved_at")
      .eq("id", estimateId)
      .maybeSingle();
    if (error) throw new Error(`estimate approval revalidation: ${error.message}`);
    return estimate?.status === "approved" &&
      estimate.status === estimateState.status &&
      sameInstant(estimate.approved_at, estimateState.approvedAt);
  }

  if (input.eventType === "invoice_paid") {
    const expected = expectedState?.invoiceState;
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
    const invoiceState = expected as Record<string, unknown>;
    const { data: invoice, error } = await canesDb()
      .from("invoices")
      .select("status, amount_paid_cents, settlement_generation")
      .eq("id", input.entityId)
      .maybeSingle();
    if (error) throw new Error(`paid invoice revalidation: ${error.message}`);
    return invoice?.status === "paid" &&
      invoice.status === invoiceState.status &&
      invoice.amount_paid_cents === invoiceState.amountPaidCents &&
      invoice.settlement_generation === invoiceState.settlementGeneration;
  }

  if (input.eventType === "deposit_received") {
    const jobId = typeof expectedState?.jobId === "string" ? expectedState.jobId : null;
    const expected = expectedState?.depositState;
    if (!jobId || !expected || typeof expected !== "object" || Array.isArray(expected)) {
      // Older/non-job deposit alerts cannot be proven stale, so keep them.
      return true;
    }
    const depositState = expected as Record<string, unknown>;
    const { data: job, error } = await canesDb()
      .from("jobs")
      .select("deposit_paid_at, deposit_collected_cents, deposit_square_payment_id")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw new Error(`deposit revalidation: ${error.message}`);
    if (!job) return false;
    return sameInstant(job.deposit_paid_at, depositState.paidAt) &&
      job.deposit_collected_cents === depositState.collectedCents &&
      job.deposit_square_payment_id === depositState.squarePaymentId;
  }

  if (input.eventType === "job_changed" && audience.kind === "owner") {
    const expected = crewJobAudienceState(expectedState?.jobState);
    if (!expected) return false;
    const { data: job, error } = await canesDb()
      .from("jobs")
      .select("crew_id, status, scheduled_at, ends_at")
      .eq("id", input.entityId)
      .maybeSingle();
    if (error) throw new Error(`owner job change revalidation: ${error.message}`);
    if (!job) return false;
    const currentStatus = typeof job.status === "string" ? job.status : "";
    const statusMatches = currentStatus === expected.status ||
      (SCHEDULED_JOB_STATES.has(currentStatus) && SCHEDULED_JOB_STATES.has(expected.status));
    return (typeof job.crew_id === "string" ? job.crew_id : null) === expected.crewId &&
      statusMatches &&
      sameInstant(job.scheduled_at ?? null, expected.scheduledAt) &&
      sameInstant(job.ends_at ?? null, expected.endsAt);
  }

  if (input.eventType === "lead_uncontacted") {
    const websiteRequest = expectedState?.websiteRequest;
    const { data: lead, error } = await canesDb()
      .from("leads")
      .select("type, status, opportunity_started_at, created_at, last_activity_at")
      .eq("id", input.entityId)
      .maybeSingle();
    if (error) throw new Error(`lead reminder revalidation: ${error.message}`);
    if (websiteRequest && typeof websiteRequest === "object" && !Array.isArray(websiteRequest)) {
      const expected = websiteRequest as Record<string, unknown>;
      return Boolean(lead) &&
        lead!.status === expected.leadStatus &&
        sameInstant(lead!.last_activity_at, expected.lastActivityAt);
    }
    const expectedOpportunity = expectedState?.opportunityStartedAt ?? null;
    const currentOpportunity = lead?.opportunity_started_at ?? lead?.created_at;
    return lead?.type === "cold" && lead.status === "new" &&
      (expectedOpportunity === null || sameInstant(currentOpportunity, expectedOpportunity));
  }

  if (input.eventType === "crew_late") {
    const db = canesDb();
    const { data: job, error } = await db
      .from("jobs")
      .select("status, scheduled_at, arrival_window_minutes, crew_id")
      .eq("id", input.entityId)
      .maybeSingle();
    if (error) throw new Error(`crew late revalidation: ${error.message}`);
    const expectedScheduledAt = expectedState?.scheduledAt ?? null;
    if (
      !job ||
      !SCHEDULED_JOB_STATES.has(job.status) ||
      typeof job.scheduled_at !== "string" ||
      typeof job.crew_id !== "string"
    ) {
      return false;
    }
    if (typeof expectedScheduledAt !== "string" || !sameInstant(job.scheduled_at, expectedScheduledAt)) {
      return false;
    }
    const graceMinutes = Math.max(
      0,
      typeof job.arrival_window_minutes === "number" ? job.arrival_window_minutes : 0,
    ) + 10;
    if (Date.now() < new Date(job.scheduled_at).getTime() + graceMinutes * 60_000) {
      return false;
    }
    const { data: checkIn, error: checkInError } = await db
      .from("job_time_entries")
      .select("id")
      .eq("job_id", input.entityId)
      .gte("checked_in_at", new Date(new Date(job.scheduled_at).getTime() - 6 * 60 * 60_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (checkInError) throw new Error(`crew late check-in revalidation: ${checkInError.message}`);
    return !checkIn;
  }

  if (input.eventType === "checklist_blocked") {
    const itemId = typeof expectedState?.itemId === "string" ? expectedState.itemId : null;
    const blockedAt = typeof expectedState?.blockedAt === "string" ? expectedState.blockedAt : null;
    if (!itemId || !blockedAt) return false;
    const { data: item, error } = await canesDb()
      .from("job_items")
      .select("job_id, required, blocked, blocked_at, done")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw new Error(`checklist block revalidation: ${error.message}`);
    return item?.job_id === input.entityId &&
      item.required === true &&
      item.blocked === true &&
      item.done !== true &&
      sameInstant(item.blocked_at, blockedAt);
  }

  return true;
}

export async function enqueueCanesPushBatch(inputs: CanesPush[]): Promise<{
  ok: boolean;
  queued: number;
  failed: number;
  skipped: number;
}> {
  if (!canesConfigured()) return { ok: true, queued: 0, failed: 0, skipped: inputs.length };
  const now = new Date().toISOString();
  const rows = new Map<string, Record<string, unknown>>();
  let failed = 0;
  let skipped = 0;
  for (const input of inputs) {
    if (!input.href.startsWith("/") || input.href.startsWith("//")) {
      console.error(`[canes push] refused external href for ${input.dedupeKey}`);
      failed++;
      continue;
    }
    try {
      const audience = await resolveAudience(input.audience);
      if (!audience) {
        skipped++;
        continue;
      }
      const targetKey = audienceKey(audience);
      rows.set(`${compactText(input.dedupeKey, 300)}\u0000${targetKey}`, {
        dedupe_key: compactText(input.dedupeKey, 300),
        audience_key: targetKey,
        category: input.eventType,
        urgency: input.urgency,
        title: compactText(input.title, 100),
        body: compactText(input.body, 240),
        data: await eventDataWithAudienceState(input, audience),
        status: "queued",
        attempt_count: 0,
        next_retry_at: now,
        updated_at: now,
      });
    } catch (error) {
      console.error(`[canes push] resolve queue audience for ${input.dedupeKey}:`, error);
      failed++;
    }
  }
  if (rows.size === 0) return { ok: failed === 0, queued: 0, failed, skipped };
  try {
    const { data, error } = await canesDb()
      .from("push_notification_events")
      .upsert([...rows.values()], { onConflict: "dedupe_key,audience_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    const queued = data?.length ?? 0;
    return {
      ok: failed === 0,
      queued,
      failed,
      skipped: skipped + rows.size - queued,
    };
  } catch (error) {
    console.error("[canes push] batch queue:", error);
    return { ok: false, queued: 0, failed: failed + rows.size, skipped };
  }
}

export async function enqueueCanesPush(input: CanesPush): Promise<{
  ok: boolean;
  accepted: number;
  failed: number;
  persisted: boolean;
  skipped?: string;
}> {
  if (!canesConfigured()) {
    return { ok: true, accepted: 0, failed: 0, persisted: true, skipped: "not configured" };
  }
  const result = await enqueueCanesPushBatch([input]);
  return result.queued > 0
    ? { ok: result.ok, accepted: 0, failed: result.failed, persisted: true }
    : {
        ok: result.ok,
        accepted: 0,
        failed: result.failed,
        persisted: result.failed === 0,
        skipped: result.failed > 0 ? "queue failed" : "duplicate or no active recipients",
      };
}

async function enabledDevicesForEvent(devices: PushDeviceRow[], eventType: PushEventType) {
  if (devices.length === 0) return [];
  const ids = [...new Set(devices.map((device) => device.recipient_id))];
  const { data, error } = await canesDb()
    .from("push_notification_preferences")
    .select("recipient_kind, recipient_id, enabled, categories, quiet_hours_enabled, quiet_start_hour, quiet_end_hour, timezone")
    .in("recipient_id", ids);
  if (error) throw new Error(`enabledDevicesForEvent: ${error.message}`);
  const rows = (data ?? []) as PreferenceRow[];
  const preferences = new Map(
    rows.map((row) => [`${row.recipient_kind}:${row.recipient_id}`, preferencesFromRow(row)]),
  );
  return devices.flatMap((device) => {
    const prefs = preferences.get(`${device.recipient_kind}:${device.recipient_id}`) ??
      preferencesFromRow(null);
    return prefs.enabled && prefs.eventTypes[eventType] ? [{ device, preferences: prefs }] : [];
  });
}

export async function sendCanesPush(
  input: CanesPush,
  claimedEventId?: string,
  deadlineAt?: number,
  storedEventData?: Record<string, unknown>,
): Promise<CanesPushResult> {
  if (!canesConfigured()) {
    return { ok: true, accepted: 0, failed: 0, persisted: true, skipped: "not configured" };
  }
  if (!input.href.startsWith("/") || input.href.startsWith("//")) {
    console.error(`[canes push] refused external href for ${input.dedupeKey}`);
    return { ok: false, accepted: 0, failed: 0, persisted: false, skipped: "invalid href" };
  }
  const db = canesDb();
  let persisted = Boolean(claimedEventId);
  let audience: ResolvedPushAudience | null;
  try {
    audience = await resolveAudience(input.audience);
  } catch (error) {
    console.error(`[canes push] resolve audience for ${input.dedupeKey}:`, error);
    return { ok: false, accepted: 0, failed: 0, persisted };
  }
  if (!audience) {
    return {
      ok: true,
      accepted: 0,
      failed: 0,
      persisted: true,
      skipped: "no active crew recipients",
    };
  }
  const targetKey = audienceKey(audience);
  let pushData: Record<string, unknown>;
  try {
    pushData = storedEventData ?? await eventDataWithAudienceState(input, audience);
  } catch (error) {
    console.error(`[canes push] capture audience state for ${input.dedupeKey}:`, error);
    return { ok: false, accepted: 0, failed: 0, persisted };
  }
  const now = new Date().toISOString();

  try {
    let eventId = claimedEventId;
    if (!eventId) {
      const { data: inserted, error: insertError } = await db
        .from("push_notification_events")
        .upsert(
          {
            dedupe_key: compactText(input.dedupeKey, 300),
            audience_key: targetKey,
            category: input.eventType,
            urgency: input.urgency,
            title: compactText(input.title, 100),
            body: compactText(input.body, 240),
            data: pushData,
            status: "processing",
            attempt_count: 1,
            last_attempt_at: now,
            next_retry_at: null,
            updated_at: now,
          },
          { onConflict: "dedupe_key,audience_key", ignoreDuplicates: true },
        )
        .select("id");
      if (insertError) throw new Error(`event claim: ${insertError.message}`);
      eventId = (inserted?.[0] as { id?: string } | undefined)?.id;
      if (!eventId) {
        // A trigger/reconciliation pass may have durably queued this exact
        // event before the request reached its immediate-send step. Claim that
        // row instead of waiting for the five-minute cron; completed or
        // concurrently processing duplicates remain no-ops.
        persisted = true;
        const { data: existing, error: existingError } = await db
          .from("push_notification_events")
          .select("id, status, attempt_count, updated_at")
          .eq("dedupe_key", compactText(input.dedupeKey, 300))
          .eq("audience_key", targetKey)
          .maybeSingle();
        if (existingError) throw new Error(`event duplicate lookup: ${existingError.message}`);
        if (!existing || !["queued", "partial", "failed"].includes(existing.status)) {
          return {
            ok: true,
            accepted: 0,
            failed: 0,
            persisted: true,
            skipped: "duplicate",
          };
        }
        const claimedAt = new Date().toISOString();
        const { data: reclaimed, error: reclaimError } = await db
          .from("push_notification_events")
          .update({
            category: input.eventType,
            urgency: input.urgency,
            title: compactText(input.title, 100),
            body: compactText(input.body, 240),
            data: pushData,
            status: "processing",
            attempt_count: existing.attempt_count + 1,
            last_attempt_at: claimedAt,
            next_retry_at: null,
            updated_at: claimedAt,
          })
          .eq("id", existing.id)
          .eq("status", existing.status)
          .eq("updated_at", existing.updated_at)
          .select("id");
        if (reclaimError) throw new Error(`event duplicate claim: ${reclaimError.message}`);
        eventId = (reclaimed?.[0] as { id?: string } | undefined)?.id;
        if (!eventId) {
          return {
            ok: true,
            accepted: 0,
            failed: 0,
            persisted: true,
            skipped: "duplicate",
          };
        }
      } else {
        persisted = true;
      }
    }

    if (!await eventIsCurrent(input, audience, pushData)) {
      await db.from("push_notification_events").update({
        status: "skipped",
        error: "The underlying business state no longer requires this alert.",
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", eventId);
      return {
        ok: true,
        accepted: 0,
        failed: 0,
        persisted: true,
        skipped: "superseded event",
      };
    }

    const candidates = await enabledDevicesForEvent(
      await devicesForAudience(audience),
      input.eventType,
    );
    if (candidates.length === 0) {
      await db
        .from("push_notification_events")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", eventId);
      return {
        ok: true,
        accepted: 0,
        failed: 0,
        persisted: true,
        skipped: "no enabled devices",
      };
    }

    const { error: deliveryError } = await db
      .from("push_notification_deliveries")
      .upsert(
        candidates.map(({ device }) => ({ event_id: eventId, device_id: device.id })),
        { onConflict: "event_id,device_id", ignoreDuplicates: true },
      );
    if (deliveryError) throw new Error(`delivery create: ${deliveryError.message}`);
    const { data: deliveryData, error: pendingError } = await db
      .from("push_notification_deliveries")
      .select("id, device_id, expo_ticket_id")
      .eq("event_id", eventId)
      .in("device_id", candidates.map(({ device }) => device.id))
      .in("status", ["pending", "failed"]);
    if (pendingError) throw new Error(`delivery claim: ${pendingError.message}`);
    const deliveries = (deliveryData ?? []) as PushDeliveryRow[];
    const deliveryByDevice = new Map(deliveries.map((delivery) => [delivery.device_id, delivery]));
    const pending = candidates.filter(({ device }) => deliveryByDevice.has(device.id));
    let accepted = 0;
    let failed = 0;

    for (const batch of chunks(pending, MAX_EXPO_BATCH)) {
      const messages = batch.map(({ device, preferences }) => {
        const quiet = input.urgency === "summary" ||
          (input.urgency !== "time_sensitive" && isQuietNow(preferences));
        return {
          to: device.expo_push_token,
          title: compactText(input.title, 100),
          body: compactText(input.body, 240),
          data: pushData,
          sound: quiet ? null : "default",
          interruptionLevel: input.urgency === "time_sensitive"
            ? "time-sensitive"
            : quiet ? "passive" : "active",
          priority: input.urgency === "time_sensitive" ? "high" : "normal",
          channelId: input.urgency === "time_sensitive"
            ? "time-sensitive"
            : input.urgency === "summary" ? "summary" : quiet ? "quiet" : "default",
          ttl: input.urgency === "time_sensitive" ? 3_600 : input.urgency === "summary" ? 28_800 : 86_400,
        };
      });
      const response = await expoRequest(EXPO_SEND_URL, messages, deadlineAt) as { data?: ExpoTicket[] | ExpoTicket };
      const tickets = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
      const updates: PromiseLike<unknown>[] = [];
      for (let index = 0; index < batch.length; index++) {
        const { device } = batch[index];
        const delivery = deliveryByDevice.get(device.id);
        if (!delivery) continue;
        const ticket = tickets[index];
        if (ticket?.status === "ok" && ticket.id) {
          accepted++;
          updates.push(requirePushWrite(
            `accept push delivery ${delivery.id}`,
            db.from("push_notification_deliveries").update({
            status: "accepted",
            expo_ticket_id: ticket.id,
            sent_at: new Date().toISOString(),
            receipt_checked_at: null,
            receipt_attempt_count: 0,
            receipt_next_check_at: null,
            updated_at: new Date().toISOString(),
            error_code: null,
            error_message: null,
            }).eq("id", delivery.id),
          ));
        } else {
          failed++;
          const errorCode = ticket?.details?.error ?? "ExpoTicketError";
          updates.push(requirePushWrite(
            `reject push delivery ${delivery.id}`,
            db.from("push_notification_deliveries").update({
              status: errorCode === "DeviceNotRegistered" ? "invalid_device" : "failed",
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              error_code: compactText(errorCode, 120),
              error_message: compactText(ticket?.message ?? "Expo did not return a push ticket.", 500),
            }).eq("id", delivery.id),
          ));
          if (errorCode === "DeviceNotRegistered") {
            updates.push(requirePushWrite(
              `disable push device ${device.id}`,
              db.from("push_devices").update({
                enabled: false,
                disabled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq("id", device.id),
            ));
          }
        }
      }
      await Promise.all(updates);
    }

    const { data: deliveryStatuses, error: deliveryStatusesError } = await db
      .from("push_notification_deliveries")
      .select("status")
      .eq("event_id", eventId)
      .in("device_id", candidates.map(({ device }) => device.id));
    if (deliveryStatusesError) {
      throw new Error(`load push delivery statuses: ${deliveryStatusesError.message}`);
    }
    const statuses = (deliveryStatuses ?? []).flatMap((row) => {
      const status = (row as { status?: unknown }).status;
      return typeof status === "string" ? [status] : [];
    });
    const totalAccepted = statuses.filter((status) => status === "accepted" || status === "delivered").length;
    const totalFailed = statuses.filter((status) => status === "failed" || status === "pending").length;
    const eventStatus = totalFailed === 0
      ? totalAccepted > 0 ? "sent" : "skipped"
      : totalAccepted > 0 ? "partial" : "failed";
    await db.from("push_notification_events").update({
      status: eventStatus,
      error: totalFailed > 0 ? `${totalFailed} device delivery attempt${totalFailed === 1 ? "" : "s"} failed.` : null,
      next_retry_at: totalFailed > 0 ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", eventId);
    return { ok: failed === 0, accepted, failed, persisted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[canes push] ${input.dedupeKey}: ${message}`);
    await db.from("push_notification_events").update({
      status: "failed",
      error: compactText(message, 500),
      next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("dedupe_key", compactText(input.dedupeKey, 300)).eq("audience_key", targetKey);
    return { ok: false, accepted: 0, failed: 0, persisted };
  }
}

type PushOutboxRow = {
  id: string;
  created_at: string;
  updated_at: string;
  dedupe_key: string;
  audience_key: string;
  category: string;
  urgency: PushUrgency;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: "queued" | "processing" | "partial" | "failed";
  attempt_count: number;
  next_retry_at: string | null;
};

function audienceFromKey(value: string): PushAudience | null {
  if (value === "owner:workspace") return { kind: "owner" };
  if (!value.startsWith("crew_id:")) return null;
  const crewId = value.slice("crew_id:".length);
  return crewId ? { kind: "crew_accounts", crewId, accountIds: [] } : null;
}

type PushProcessingOptions = { deadlineAt?: number };

async function requirePushWrite(
  label: string,
  operation: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await operation;
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function drainCanesPushOutbox(options: PushProcessingOptions = {}) {
  if (!canesConfigured()) return { skipped: "not configured" };
  if (remainingBudget(options.deadlineAt) < PROVIDER_ATTEMPT_BUDGET_MS) {
    return { skipped: "cron deadline" };
  }
  const db = canesDb();
  const now = Date.now();
  const columns = "id, created_at, updated_at, dedupe_key, audience_key, category, urgency, title, body, data, status, attempt_count, next_retry_at";
  const [dueResult, staleResult] = await Promise.all([
    db
      .from("push_notification_events")
      .select(columns)
      .in("status", ["queued", "partial", "failed"])
      .lt("attempt_count", 5)
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date(now).toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(MAX_OUTBOX_BATCH),
    db
      .from("push_notification_events")
      .select(columns)
      .eq("status", "processing")
      .lt("attempt_count", 5)
      .lte("updated_at", new Date(now - 5 * 60_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_OUTBOX_BATCH),
  ]);
  if (dueResult.error) throw new Error(`drainCanesPushOutbox due: ${dueResult.error.message}`);
  if (staleResult.error) throw new Error(`drainCanesPushOutbox stale: ${staleResult.error.message}`);
  const uniqueRows = new Map<string, PushOutboxRow>();
  for (const row of [...(dueResult.data ?? []), ...(staleResult.data ?? [])] as PushOutboxRow[]) {
    uniqueRows.set(row.id, row);
  }
  const rows = [...uniqueRows.values()]
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .slice(0, MAX_OUTBOX_BATCH);
  let retried = 0;
  let skipped = 0;

  const retryRow = async (row: PushOutboxRow) => {
    const staleProcessing = row.status === "processing" &&
      new Date(row.updated_at).getTime() <= now - 5 * 60_000;
    const dueRetry = row.status !== "processing" &&
      (!row.next_retry_at || new Date(row.next_retry_at).getTime() <= now);
    if (!staleProcessing && !dueRetry) return;
    if (remainingBudget(options.deadlineAt) < PROVIDER_ATTEMPT_BUDGET_MS) {
      skipped++;
      return;
    }
    const audience = audienceFromKey(row.audience_key);
    const href = typeof row.data.href === "string" ? row.data.href : null;
    if (!audience || !isPushEventType(row.category) || !href) {
      await db.from("push_notification_events").update({
        status: "failed",
        attempt_count: 5,
        error: "Stored push event cannot be reconstructed.",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("updated_at", row.updated_at);
      skipped++;
      return;
    }

    const claimedAt = new Date().toISOString();
    const { data: claimed } = await db.from("push_notification_events").update({
      status: "processing",
      attempt_count: row.attempt_count + 1,
      last_attempt_at: claimedAt,
      next_retry_at: null,
      updated_at: claimedAt,
    }).eq("id", row.id).eq("updated_at", row.updated_at).select("id");
    if (!claimed || claimed.length === 0) return;

    await sendCanesPush({
      dedupeKey: row.dedupe_key,
      audience,
      eventType: row.category,
      urgency: row.urgency,
      title: row.title,
      body: row.body,
      href,
      entityId: typeof row.data.entityId === "string" ? row.data.entityId : undefined,
    }, row.id, options.deadlineAt, row.data);
    retried++;
  };
  // One retry can wait up to twelve seconds on Expo. A small bounded pool
  // keeps the five-minute cron comfortably inside its 60-second budget while
  // avoiding an unbounded burst if a provider outage created a backlog.
  for (const batch of chunks(rows, OUTBOX_CONCURRENCY)) {
    await Promise.all(batch.map(retryRow));
  }
  return { candidates: rows.length, retried, skipped };
}

export async function processCanesPushReceipts(options: PushProcessingOptions = {}) {
  if (!canesConfigured()) return { skipped: "not configured" };
  if (remainingBudget(options.deadlineAt) < PROVIDER_ATTEMPT_BUDGET_MS) {
    return { skipped: "cron deadline" };
  }
  const db = canesDb();
  const now = Date.now();
  const expiredBefore = new Date(now - 24 * 60 * 60_000).toISOString();
  const { data: expiredRows, error: expiredLookupError } = await db
    .from("push_notification_deliveries")
    .select("id")
    .eq("status", "accepted")
    .lt("sent_at", expiredBefore)
    .order("sent_at", { ascending: true })
    .limit(MAX_RECEIPT_BATCH);
  if (expiredLookupError) {
    throw new Error(`processCanesPushReceipts expired lookup: ${expiredLookupError.message}`);
  }
  const expiredIds = (expiredRows ?? []).flatMap((row) =>
    typeof row.id === "string" ? [row.id] : [],
  );
  if (expiredIds.length > 0) {
    const checkedAt = new Date().toISOString();
    const { error: expiredUpdateError } = await db.rpc("reconcile_push_delivery_receipts", {
      p_updates: expiredIds.map((deliveryId) => ({
        delivery_id: deliveryId,
        delivery_status: "failed",
        error_code: "ReceiptExpired",
        error_message: "Expo did not return a receipt within 24 hours.",
        checked_at: checkedAt,
        disable_device: false,
      })),
    });
    if (expiredUpdateError) {
      throw new Error(`processCanesPushReceipts expired reconciliation: ${expiredUpdateError.message}`);
    }
  }

  if (remainingBudget(options.deadlineAt) < PROVIDER_ATTEMPT_BUDGET_MS) {
    return { expired: expiredIds.length, skipped: "cron deadline" };
  }

  const dueAt = new Date(now).toISOString();
  const { data, error } = await db
    .from("push_notification_deliveries")
    .select("id, event_id, device_id, expo_ticket_id")
    .eq("status", "accepted")
    .not("expo_ticket_id", "is", null)
    .lte("sent_at", new Date(now - 15 * 60_000).toISOString())
    .gt("sent_at", expiredBefore)
    .or(`receipt_next_check_at.is.null,receipt_next_check_at.lte.${dueAt}`)
    .order("receipt_next_check_at", { ascending: true, nullsFirst: true })
    .order("sent_at", { ascending: true })
    .limit(MAX_RECEIPT_BATCH);
  if (error) throw new Error(`processCanesPushReceipts: ${error.message}`);
  const deliveries = (data ?? []) as PushDeliveryRow[];
  if (deliveries.length === 0) {
    return { expired: expiredIds.length, checked: 0, delivered: 0, failed: 0, omitted: 0 };
  }

  let delivered = 0;
  let failed = 0;
  let omitted = 0;
  for (const batch of chunks(deliveries, MAX_RECEIPT_BATCH)) {
    const ids = batch.flatMap((delivery) => delivery.expo_ticket_id ? [delivery.expo_ticket_id] : []);
    const response = await expoRequest(EXPO_RECEIPTS_URL, { ids }, options.deadlineAt) as {
      data?: Record<string, ExpoReceipt>;
    };
    const checkedAt = new Date().toISOString();
    const updates: Array<Record<string, unknown>> = [];
    const omittedIds: string[] = [];
    for (const delivery of batch) {
      if (!delivery.expo_ticket_id) continue;
      const receipt = response.data?.[delivery.expo_ticket_id];
      if (!receipt) {
        omitted++;
        omittedIds.push(delivery.id);
        continue;
      }
      if (receipt.status === "ok") {
        delivered++;
        updates.push({
          delivery_id: delivery.id,
          delivery_status: "delivered",
          error_code: null,
          error_message: null,
          checked_at: checkedAt,
          disable_device: false,
        });
      } else {
        failed++;
        const errorCode = receipt.details?.error ?? "ExpoReceiptError";
        updates.push({
          delivery_id: delivery.id,
          delivery_status: errorCode === "DeviceNotRegistered" ? "invalid_device" : "failed",
          error_code: compactText(errorCode, 120),
          error_message: compactText(receipt.message ?? "Expo could not deliver the notification.", 500),
          checked_at: checkedAt,
          disable_device: errorCode === "DeviceNotRegistered",
        });
      }
    }
    if (updates.length > 0) {
      const { error: reconcileError } = await db.rpc("reconcile_push_delivery_receipts", {
        p_updates: updates,
      });
      if (reconcileError) {
        throw new Error(`processCanesPushReceipts reconciliation: ${reconcileError.message}`);
      }
    }
    if (omittedIds.length > 0) {
      const { error: deferError } = await db.rpc("defer_omitted_push_receipts", {
        p_delivery_ids: omittedIds,
        p_checked_at: checkedAt,
      });
      if (deferError) {
        throw new Error(`processCanesPushReceipts omitted backoff: ${deferError.message}`);
      }
    }
  }
  return { expired: expiredIds.length, checked: deliveries.length, delivered, failed, omitted };
}

export async function crewAccountIdsForCrew(crewId: string): Promise<string[]> {
  // team_members.crew_id is the live roster authority. crew_account_access is
  // retained for history, while an ops manager's actor scope intentionally
  // spans every crew; neither is safe for dispatch fan-out.
  const db = canesDb();
  const { data: memberData, error: memberError } = await db
    .from("team_members")
    .select("id")
    .eq("crew_id", crewId)
    .eq("active", true);
  if (memberError) throw new Error(`crewAccountIdsForCrew roster: ${memberError.message}`);
  const memberIds = (memberData ?? []).flatMap((row) => {
    const id = (row as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
  if (memberIds.length === 0) {
    const accountIds: CrewAccountIdList = [];
    Object.defineProperty(accountIds, CREW_ID, { value: crewId });
    return accountIds;
  }
  const { data, error } = await db
    .from("crew_accounts")
    .select("id")
    .eq("active", true)
    .in("team_member_id", memberIds);
  if (error) throw new Error(`crewAccountIdsForCrew accounts: ${error.message}`);
  const accountIds = (data ?? []).flatMap((row) => {
    const accountId = (row as { id?: unknown }).id;
    return typeof accountId === "string" ? [accountId] : [];
  });
  // The public helper historically returns a plain string array. Tagging the
  // exact array preserves the authoritative intended crew across the call into
  // sendCanesPush without changing every event producer or serializing a fake
  // recipient. Durable retries use the crew_id audience key instead.
  Object.defineProperty(accountIds, CREW_ID, { value: crewId });
  return accountIds;
}
