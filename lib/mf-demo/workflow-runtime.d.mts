import type { MfHarnessSnapshot, MfWorkItem, MfWorkState } from "./harness-runtime.mjs";
import type { MfLocalizedText, MfManifestRole, MfManifestSource, MfToolPermission } from "./manifest.mjs";

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
  receiptId: string | null;
}>;

export type MfWorkflowReceiptPresentation = Readonly<{
  state: "pending" | "available" | "missing";
  id: string | null;
}>;

export type MfWorkflowOutputPresentation = Readonly<{
  id: string;
  label: MfLocalizedText;
  kind: "receipt" | "plan" | "brief" | "draft" | "checklist";
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

export function deriveMfWorkflowPresentation(
  snapshot: MfHarnessSnapshot,
  workflowId: string,
): MfWorkflowPresentation;
