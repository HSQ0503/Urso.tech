import type { MfHarnessSnapshot } from "./harness-runtime.mjs";

export type MfSessionOperation = "chat" | "thread" | "learning" | "transition";
export type MfSessionRecord = Readonly<{
  id: string;
  tokenHash: string;
  version: number;
  selectedRoleId: string;
  snapshot: MfHarnessSnapshot;
  usage: Readonly<Record<MfSessionOperation, number>>;
  createdAt: string;
  updatedAt: string;
}>;

export class MfSessionContractError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string);
}
export function hashMfSessionToken(token: string): string;
export function createMfSessionCredentials(): Readonly<{ sessionId: string; token: string }>;
export function createMfSessionRecord(input: Readonly<{
  id: string;
  tokenHash: string;
  now: string;
  roleId?: string;
}>): MfSessionRecord;
export function verifyMfSessionToken(session: MfSessionRecord, token: string): boolean;
export function transitionMfSessionRecord(
  session: MfSessionRecord,
  request: Readonly<{
    expectedStep: number;
    targetStep: number;
    idempotencyKey: string;
    roleId: string;
    now: string;
  }>,
): MfSessionRecord;
export function consumeMfSessionUsage(
  session: MfSessionRecord,
  operation: MfSessionOperation,
  limit: number,
): MfSessionRecord;
