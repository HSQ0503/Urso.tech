import type { MfManifestRole, MfManifestSource, MfManifestTask } from "./manifest.mjs";

export type MfWorkState = "blocked" | "ready" | "in_progress" | "complete";
export type MfWorkItem = MfManifestTask & Readonly<{
  state: MfWorkState;
  completeAt: number;
  receiptId: string | null;
}>;
export type MfWorkflowReceipt = Readonly<{
  id: string;
  idempotencyKey: string;
  actorRoleId: string;
  action: "scenario_reset" | "scenario_rewind" | "scenario_advance";
  fromStep: number;
  toStep: number;
  evidenceIds: readonly string[];
}>;
export type MfHarnessSnapshot = Readonly<{
  scenarioId: string;
  step: number;
  state: string;
  version: number;
  truth: Readonly<{
    currentRevision: "B" | "C";
    revisionB: "current" | "superseded";
    revisionC: "not_received" | "unresolved" | "current";
  }>;
  decision: Readonly<{
    id: string;
    status: "not_open" | "pending" | "approved";
    approvingRoleId: string;
    effectiveDate: string | null;
  }>;
  objective: Readonly<{
    id: string;
    status: "pending" | "active" | "complete";
    completedTasks: number;
    totalTasks: number;
  }>;
  sources: readonly (MfManifestSource & Readonly<{ status: "connected" | "available_in_pilot" }>)[];
  workItems: readonly MfWorkItem[];
  receipts: readonly MfWorkflowReceipt[];
  appliedKeys: readonly string[];
}>;

export function createMfHarnessSnapshot(step?: number): MfHarnessSnapshot;
export function transitionMfHarness(
  snapshot: MfHarnessSnapshot,
  targetStep: number,
  idempotencyKey: string,
  actorRoleId: string,
): MfHarnessSnapshot;
export function getMfRoleWorkspace(snapshot: MfHarnessSnapshot, roleId: string): Readonly<{
  role: MfManifestRole;
  objective: Readonly<{ id: string; title: Readonly<{ pt: string; en: string }>; detail: Readonly<{ pt: string; en: string }> }>;
  tasks: readonly MfWorkItem[];
  sources: readonly (MfManifestSource & Readonly<{ status: "connected" | "available_in_pilot" }>)[];
  nextTask: MfWorkItem | null;
  downstreamTasks: readonly MfWorkItem[];
}>;
export function deriveMfControlTower(snapshot: MfHarnessSnapshot): Readonly<{
  milestone: string;
  targetDate: string;
  impactedDisciplines: number;
  completedActions: number;
  totalActions: number;
  openBlockers: number;
  releaseReadiness: number;
  exposureDays: number;
  daysRecovered: number;
  forecastDate: string;
  releaseConfidence: "ready" | "review" | "at_risk";
}>;
