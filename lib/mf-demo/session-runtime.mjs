import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createMfHarnessSnapshot, transitionMfHarness } from "./harness-runtime.mjs";
import { mfScenarioManifest } from "./manifest.mjs";

export class MfSessionContractError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = "MfSessionContractError";
    this.code = code;
    this.status = status;
  }
}

export function hashMfSessionToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createMfSessionCredentials() {
  return { sessionId: randomUUID(), token: randomBytes(32).toString("base64url") };
}

export function createMfSessionRecord({ id, tokenHash, now, roleId = "project-manager" }) {
  if (!mfScenarioManifest.roles.some((role) => role.id === roleId)) {
    throw new MfSessionContractError("invalid_role", 400, "Unknown MF demo role.");
  }
  return {
    id,
    tokenHash,
    version: 1,
    selectedRoleId: roleId,
    snapshot: createMfHarnessSnapshot(0),
    usage: { chat: 0, thread: 0, learning: 0, transition: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

export function verifyMfSessionToken(session, token) {
  if (!session || typeof token !== "string" || token.length === 0) return false;
  const actual = Buffer.from(hashMfSessionToken(token), "hex");
  const expected = Buffer.from(session.tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function transitionMfSessionRecord(session, request) {
  if (session.snapshot.appliedKeys.includes(request.idempotencyKey)) return session;
  if (!mfScenarioManifest.roles.some((role) => role.id === request.roleId)) {
    throw new MfSessionContractError("invalid_role", 400, "Unknown MF demo role.");
  }
  if (session.snapshot.step !== request.expectedStep) {
    throw new MfSessionContractError(
      "stale_session",
      409,
      `Expected step ${request.expectedStep}; current step is ${session.snapshot.step}.`,
    );
  }
  return {
    ...session,
    version: session.version + 1,
    selectedRoleId: request.roleId,
    snapshot: transitionMfHarness(
      session.snapshot,
      request.targetStep,
      request.idempotencyKey,
      request.roleId,
    ),
    usage: { ...session.usage, transition: session.usage.transition + 1 },
    updatedAt: request.now,
  };
}

export function consumeMfSessionUsage(session, operation, limit) {
  const current = session.usage[operation];
  if (!Number.isInteger(current) || current >= limit) {
    throw new MfSessionContractError("usage_limit", 429, `MF demo ${operation} limit reached.`);
  }
  return {
    ...session,
    version: session.version + 1,
    usage: { ...session.usage, [operation]: current + 1 },
  };
}
