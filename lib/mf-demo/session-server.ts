import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MF_BRAIN_ORGANIZATION_ID } from "./brain-config";
import {
  consumeMfSessionUsage,
  createMfSessionCredentials,
  createMfSessionRecord,
  hashMfSessionToken,
  MfSessionContractError,
  selectMfSessionRole,
  transitionMfSessionRecord,
  verifyMfSessionToken,
  type MfSessionOperation,
  type MfSessionRecord,
} from "./session-runtime.mjs";
import { applyMfBrainScenarioState } from "./scenario-server";

type OrganizationSettings = Record<string, unknown> & {
  demoRuntime?: { sessions?: Record<string, MfSessionRecord> };
};

export type MfSessionCredentials = { sessionId: string; token: string };

function publicSession(session: MfSessionRecord) {
  return {
    id: session.id,
    version: session.version,
    selectedRoleId: session.selectedRoleId,
    snapshot: session.snapshot,
    usage: session.usage,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

async function readSettings(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("brain_organizations")
    .select("settings")
    .eq("id", MF_BRAIN_ORGANIZATION_ID)
    .single();
  if (error) throw new MfSessionContractError("session_store", 503, error.message);
  const settings = data.settings;
  return settings && typeof settings === "object" ? settings as OrganizationSettings : {};
}

function sessionsFrom(settings: OrganizationSettings) {
  const sessions = settings.demoRuntime?.sessions;
  return sessions && typeof sessions === "object" ? sessions : {};
}

async function writeSession(admin: SupabaseClient, session: MfSessionRecord) {
  const settings = await readSettings(admin);
  const sessions = { ...sessionsFrom(settings), [session.id]: session };
  const recent = Object.fromEntries(
    Object.entries(sessions)
      .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 20),
  );
  const { error } = await admin
    .from("brain_organizations")
    .update({ settings: { ...settings, demoRuntime: { sessions: recent } } })
    .eq("id", MF_BRAIN_ORGANIZATION_ID);
  if (error) throw new MfSessionContractError("session_store", 503, error.message);
  return session;
}

export async function createMfDemoSession(admin: SupabaseClient) {
  const credentials = createMfSessionCredentials();
  const now = new Date().toISOString();
  const session = createMfSessionRecord({
    id: credentials.sessionId,
    tokenHash: hashMfSessionToken(credentials.token),
    now,
  });
  await writeSession(admin, session);
  return { ...credentials, session: publicSession(session) };
}

export async function requireMfDemoSession(
  admin: SupabaseClient,
  credentials: MfSessionCredentials,
) {
  if (!credentials.sessionId || !credentials.token) {
    throw new MfSessionContractError("invalid_session", 401, "MF demo session required.");
  }
  const settings = await readSettings(admin);
  const session = sessionsFrom(settings)[credentials.sessionId];
  if (!session || !verifyMfSessionToken(session, credentials.token)) {
    throw new MfSessionContractError("invalid_session", 401, "Invalid MF demo session.");
  }
  return session;
}

export async function loadMfDemoSession(
  admin: SupabaseClient,
  credentials: MfSessionCredentials,
) {
  return publicSession(await requireMfDemoSession(admin, credentials));
}

export async function transitionMfDemoSession(
  admin: SupabaseClient,
  input: MfSessionCredentials & {
    expectedStep: number;
    targetStep: number;
    idempotencyKey: string;
    roleId: string;
  },
) {
  const current = await requireMfDemoSession(admin, input);
  const next = transitionMfSessionRecord(current, { ...input, now: new Date().toISOString() });
  if (next !== current) {
    await applyMfBrainScenarioState(admin, {
      step: next.snapshot.step,
      demoSessionId: current.id,
      idempotencyKey: input.idempotencyKey,
      actorRoleId: input.roleId,
    });
    try {
      await writeSession(admin, next);
    } catch (error) {
      await applyMfBrainScenarioState(admin, {
        step: current.snapshot.step,
        demoSessionId: current.id,
        idempotencyKey: `rollback-${input.idempotencyKey}`,
        actorRoleId: input.roleId,
        recordAudit: false,
      }).catch(() => undefined);
      throw error;
    }
  }
  return publicSession(next);
}

export async function consumeMfDemoSessionUsage(
  admin: SupabaseClient,
  credentials: MfSessionCredentials,
  operation: MfSessionOperation,
  limit: number,
) {
  const current = await requireMfDemoSession(admin, credentials);
  const next = consumeMfSessionUsage(current, operation, limit);
  await writeSession(admin, next);
  return publicSession(next);
}

export async function selectMfDemoSessionRole(
  admin: SupabaseClient,
  credentials: MfSessionCredentials,
  roleId: string,
) {
  const current = await requireMfDemoSession(admin, credentials);
  const next = selectMfSessionRole(current, roleId, new Date().toISOString());
  if (next !== current) await writeSession(admin, next);
  return publicSession(next);
}

export function mfSessionCredentialsFromRequest(request: Request): MfSessionCredentials {
  return {
    sessionId: request.headers.get("x-mf-demo-session-id") ?? "",
    token: request.headers.get("x-mf-demo-session-token") ?? "",
  };
}

export function mfSessionErrorResponse(error: unknown) {
  if (error instanceof MfSessionContractError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[mf-demo] session failure:", error instanceof Error ? error.message : error);
  return Response.json({ error: "The MF demo session is unavailable." }, { status: 503 });
}
