import type { MfHarnessSnapshot, MfWorkItem, MfWorkState } from "./harness-runtime.mjs";
import type {
  MfLocalizedText,
  MfManifestRole,
  MfManifestWorkflowDefinition,
  MfToolPermission,
} from "./manifest.mjs";

export type MfWorkflowStageId =
  | "connected_context"
  | "brain_boundary"
  | "agents_tools"
  | "human_gate"
  | "controlled_outputs";

export type MfWorkflowSourcePresentation = MfHarnessSnapshot["sources"][number];

export type MfWorkflowAgentPresentation = Readonly<{
  id: string;
  name: MfLocalizedText;
  objective: MfLocalizedText;
  tool: Readonly<{ id: string; name: MfLocalizedText; permission: MfToolPermission }>;
}>;

export type MfWorkflowGatePresentation = Readonly<{
  task: MfWorkItem;
  state: MfWorkState;
  role: MfManifestRole;
  decision: MfLocalizedText;
  evidenceSources: readonly MfWorkflowSourcePresentation[];
  evidenceCount: number;
  affectedRoleIds: readonly string[];
  affectedRoleCount: number;
  receipt: MfWorkflowReceiptPresentation;
  receiptId: string | null;
}>;

export type MfWorkflowReceiptPresentation =
  | Readonly<{ state: "available"; id: string }>
  | Readonly<{ state: "pending" | "missing"; id: null }>;

export type MfWorkflowOutputPresentation = Readonly<{
  id: string;
  label: MfLocalizedText;
  kind: "receipt" | "plan" | "brief" | "draft" | "checklist";
  availableAtStep: number;
  ready: boolean;
  recipients: readonly MfManifestRole[];
  receipt: MfWorkflowReceiptPresentation;
}>;

export type MfWorkflowRoleDelivery = Readonly<{
  role: MfManifestRole;
  objective: MfLocalizedText;
  nextAction: MfWorkItem | null;
  sources: readonly MfWorkflowSourcePresentation[];
  deliverable: MfLocalizedText;
  openActionCount: number;
  sourceCount: number;
}>;

export type MfWorkflowPresentationStage =
  | Readonly<{ id: "connected_context"; sources: readonly MfWorkflowSourcePresentation[] }>
  | Readonly<{
    id: "brain_boundary";
    truth: MfWorkflowPresentation["truth"];
  }>
  | Readonly<{ id: "agents_tools"; agents: readonly MfWorkflowAgentPresentation[] }>
  | Readonly<{ id: "human_gate"; gate: MfWorkflowGatePresentation }>
  | Readonly<{
    id: "controlled_outputs";
    outputsReady: boolean;
    outputs: readonly MfWorkflowOutputPresentation[];
    roleDeliveries: readonly MfWorkflowRoleDelivery[];
  }>;

export type MfWorkflowPresentation = Readonly<{
  definition: MfManifestWorkflowDefinition;
  workflowId: string;
  runCode: string;
  ownerRole: MfManifestRole;
  title: MfLocalizedText;
  trigger: MfLocalizedText;
  purpose: MfLocalizedText;
  truth: MfHarnessSnapshot["truth"];
  sources: readonly MfWorkflowSourcePresentation[];
  agents: readonly MfWorkflowAgentPresentation[];
  gate: MfWorkflowGatePresentation;
  outputsReady: boolean;
  outputs: readonly MfWorkflowOutputPresentation[];
  roleDeliveries: readonly MfWorkflowRoleDelivery[];
  stages: readonly MfWorkflowPresentationStage[];
}>;

export type MfWorkflowStageState = "complete" | "current" | "pending";

export type MfWorkflowAccess = Readonly<{
  viewerRoleId: string;
  workflows: readonly MfManifestWorkflowDefinition[];
  workflowIds: readonly string[];
  defaultWorkflowId: string | null;
}>;

export type MfArtifactAccess = Readonly<{
  viewerRoleId: string;
  canViewAll: boolean;
  artifactIds: readonly string[];
}>;

export type MfWorkflowInteractionActionId =
  | "advance"
  | "external_action"
  | "waiting"
  | "unauthorized"
  | "outputs_pending"
  | "receipt_missing"
  | "complete";

export type MfWorkflowInteraction = Readonly<{
  viewerRoleId: string;
  terminal: boolean;
  canAdvance: boolean;
  currentStageId: MfWorkflowStageId | null;
  stages: readonly Readonly<{ id: MfWorkflowStageId; state: MfWorkflowStageState }>[];
  action: Readonly<{ id: MfWorkflowInteractionActionId; label: MfLocalizedText }>;
}>;

export function deriveMfWorkflowAccess(viewerRoleId: string): MfWorkflowAccess;

export function deriveMfArtifactAccess(viewerRoleId: string): MfArtifactAccess;

export function deriveMfWorkflowInteraction(
  presentation: MfWorkflowPresentation,
  viewerRoleId: string,
): MfWorkflowInteraction;

export function deriveMfWorkflowPresentation(
  snapshot: MfHarnessSnapshot,
  workflowId: string,
): MfWorkflowPresentation;
