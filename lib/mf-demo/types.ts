export const scenarioStates = [
  "baseline",
  "event_detected",
  "awaiting_change_approval",
  "change_approved",
  "impact_mapping",
  "work_packets_ready",
  "execution_in_progress",
  "reviews_pending",
  "pilot_complete",
] as const;

export type ScenarioState = (typeof scenarioStates)[number];

export type DisciplineGroup = "brain" | "skeleton" | "organs";
export type ImpactLevel = "critical" | "watch" | "support" | "none";
export type ArtifactReviewState = "draft" | "validated" | "approved";
export type DemoView =
  | "control"
  | "changes"
  | "disciplines"
  | "workflows"
  | "artifacts"
  | "brain"
  | "audit";

export type Discipline = {
  id: string;
  name: string;
  englishName: string;
  shortName: string;
  group: DisciplineGroup;
  impact: ImpactLevel;
  impactSummary: string;
  workItem: string;
  owner: string;
};

export type RolePersona = {
  id: string;
  name: string;
  focus: string;
  assignment: string;
  evidence: string[];
  deliverable: string;
};

export type WorkflowStep = {
  id: string;
  title: string;
  detail: string;
  kind: "deterministic" | "agentic" | "human";
  availableAt: number;
};

export type Artifact = {
  id: string;
  title: string;
  type: string;
  description: string;
  owner: string;
  availableAt: number;
  validation: string;
  discipline: string;
  sources: string[];
  findings: string[];
  actions: string[];
};

export type ActivityEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  availableAt: number;
  tone: "neutral" | "cyan" | "warning" | "positive";
};

export type { MfHarnessSnapshot, MfWorkItem, MfWorkflowReceipt, MfWorkState } from "./harness-runtime.mjs";
export type {
  MfHandoffStageStatus,
  MfManagerActionItem,
  MfManagerCockpitPresentation,
  MfManagerQueue,
  MfManagerScenarioControl,
  MfManagerWorkspace,
  MfTeamCommand,
  MfTeamStatus,
} from "./manager-runtime.mjs";
export type {
  MfArtifactAccess,
  MfWorkflowAccess,
  MfWorkflowAgentPresentation,
  MfWorkflowGatePresentation,
  MfWorkflowInteraction,
  MfWorkflowInteractionActionId,
  MfWorkflowOutputPresentation,
  MfWorkflowPresentation,
  MfWorkflowPresentationStage,
  MfWorkflowReceiptPresentation,
  MfWorkflowRoleDelivery,
  MfWorkflowSourcePresentation,
  MfWorkflowStageId,
  MfWorkflowStageState,
} from "./workflow-runtime.mjs";
import type { MfHarnessSnapshot } from "./harness-runtime.mjs";

export type MfDemoSessionCredentials = { sessionId: string; token: string };
export type MfDemoSessionView = {
  id: string;
  version: number;
  selectedRoleId: string;
  snapshot: MfHarnessSnapshot;
  usage: Record<"chat" | "thread" | "learning" | "transition", number>;
  createdAt: string;
  updatedAt: string;
};
