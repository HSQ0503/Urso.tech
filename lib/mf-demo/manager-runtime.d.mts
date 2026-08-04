import type { MfHarnessSnapshot, MfWorkItem, MfWorkState } from "./harness-runtime.mjs";
import type { MfLocalizedText, MfManifestManagerAction } from "./manifest.mjs";

export type MfManagerActionItem = Readonly<{
  taskId: string;
  actionId: MfManifestManagerAction["id"];
  kind: MfManifestManagerAction["kind"];
  label: MfLocalizedText;
  due: MfLocalizedText;
  state: MfWorkState;
  lane: "done" | "now" | "next" | "waitingOnTeam";
  evidenceSourceIds: readonly string[];
  evidenceCount: number;
  directBlockerIds: readonly string[];
  transitiveBlockerIds: readonly string[];
  blockingRoleIds: readonly string[];
  blockingTeamCount: number;
  receiptId: string | null;
}>;

export type MfManagerQueue = Readonly<{
  done: readonly MfManagerActionItem[];
  now: readonly MfManagerActionItem[];
  next: readonly MfManagerActionItem[];
  waitingOnTeam: readonly MfManagerActionItem[];
  decisionsRequiringAction: readonly MfManagerActionItem[];
  actionRequiredCount: number;
}>;

export type MfTeamStatus = Readonly<{
  roleId: string;
  role: MfLocalizedText;
  currentTask: MfWorkItem | null;
  state: MfWorkState;
  atRisk: boolean;
  openActionCount: number;
  completedActionCount: number;
}>;

export type MfHandoffStageStatus = Readonly<{
  id: string;
  label: MfLocalizedText;
  state: "complete" | "in_progress" | "ready" | "blocked";
}>;

export type MfTeamCommand = Readonly<{
  teams: readonly MfTeamStatus[];
  handoffStages: readonly MfHandoffStageStatus[];
  activeWorkCount: number;
  blockedTeamCount: number;
  managerDecisionCount: number;
}>;

export type MfManagerWorkspace = Readonly<{
  objective: Readonly<{
    id: string;
    title: MfLocalizedText;
    detail: MfLocalizedText;
  }>;
  controlTower: Readonly<{
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
  queue: MfManagerQueue;
  team: MfTeamCommand;
}>;

export type MfManagerScenarioControl = Readonly<{
  id: "receive-revision" | "inspect-revision" | "distribute-work" | "open-workflow" | "open-recovery-workflow" | "review-outputs";
  kind: "advance" | "navigate";
  targetView: "workflows" | "artifacts" | null;
  label: MfLocalizedText;
}>;

export type MfManagerCockpitPresentation = Readonly<{
  consistent: boolean;
  featuredManagerAction: MfManagerActionItem | null;
  managerActionPlacement: "upcoming" | "actionable" | "completed" | null;
  primaryManagerAction: MfManagerActionItem | null;
  scenarioControl: MfManagerScenarioControl | null;
  milestone: Readonly<{
    status: "baseline" | "exposed" | "recovery_proposed" | "recovery_selected" | "pilot_complete";
    days: number;
    selectionRequired: boolean;
  }>;
}>;

export function deriveMfManagerQueue(snapshot: MfHarnessSnapshot): MfManagerQueue;
export function deriveMfTeamCommand(snapshot: MfHarnessSnapshot): MfTeamCommand;
export function deriveMfManagerWorkspace(snapshot: MfHarnessSnapshot): MfManagerWorkspace;
export function deriveMfManagerCockpitPresentation(snapshot: MfHarnessSnapshot): MfManagerCockpitPresentation;
