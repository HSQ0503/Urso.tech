export type MfLocalizedText = Readonly<{ pt: string; en: string }>;
export type MfSourceMode = "live" | "demo" | "pilot";
export type MfTechnologyId = "slack" | "cde" | "revit" | "primavera-p6" | "teams" | "urso-brain";
export type MfToolPermission = "read" | "query" | "draft" | "write";

export type MfManifestManagerAction = Readonly<{
  id: string;
  kind: "decision" | "action" | "release";
  label: MfLocalizedText;
  due: MfLocalizedText;
  actionAt: number;
  blockedLane: "next" | "waiting_on_team";
}>;

export type MfManifestHandoffStage = Readonly<{
  id: string;
  label: MfLocalizedText;
  taskIds: readonly string[];
}>;

export type MfManifestWorkflowDefinition = Readonly<{
  id: string;
  runCode: string;
  ownerRoleId: string;
  title: MfLocalizedText;
  trigger: MfLocalizedText;
  purpose: MfLocalizedText;
  sourceIds: readonly string[];
  agents: readonly Readonly<{
    id: string;
    name: MfLocalizedText;
    objective: MfLocalizedText;
    tool: Readonly<{ id: string; name: MfLocalizedText; permission: MfToolPermission }>;
  }>[];
  gate: Readonly<{
    taskId: string;
    roleId: string;
    decision: MfLocalizedText;
    evidenceSourceIds: readonly string[];
    affectedRoleIds: readonly string[];
  }>;
  outputs: readonly Readonly<{
    id: string;
    label: MfLocalizedText;
    kind: "receipt" | "plan" | "brief" | "draft" | "checklist";
    availableAtStep: number;
    recipientRoleIds: readonly string[];
  }>[];
  deliveryRoleIds: readonly string[];
}>;

export type MfManifestRole = Readonly<{
  id: string;
  departmentId: string;
  name: MfLocalizedText;
  objective: MfLocalizedText;
  assignment: MfLocalizedText;
  deliverable: MfLocalizedText;
}>;

export type MfManifestSource = Readonly<{
  id: string;
  name: MfLocalizedText;
  system: string;
  technology: Readonly<{ id: MfTechnologyId; name: string }>;
  type: MfLocalizedText;
  mode: MfSourceMode;
  authority: string;
  freshness: MfLocalizedText;
  owner: MfLocalizedText;
  authorizedRoleIds: readonly string[];
  evidencePaths: readonly string[];
}>;

export type MfManifestTask = Readonly<{
  id: string;
  ownerRoleId: string;
  title: MfLocalizedText;
  detail: MfLocalizedText;
  dependsOn: readonly string[];
  sourceIds: readonly string[];
  artifactId: string;
  humanGate: boolean;
  managerAction?: MfManifestManagerAction;
}>;

export const mfScenarioManifest: Readonly<{
  id: string;
  project: Readonly<{
    id: string;
    name: string;
    phase: MfLocalizedText;
    stage: MfLocalizedText;
    location: string;
    milestone: string;
    milestoneName: MfLocalizedText;
    targetDate: string;
    publicFacts: MfLocalizedText;
  }>;
  revisions: Readonly<{
    B: Readonly<{ footprintM: readonly [number, number]; electricalKw: number; chilledWaterKw: number; operatingLoadKn: number }>;
    C: Readonly<{ footprintM: readonly [number, number]; electricalKw: number; chilledWaterKw: number; operatingLoadKn: number }>;
  }>;
  decision: Readonly<{ id: string; title: MfLocalizedText; approvingRoleId: string; effectiveDate: string }>;
  objective: Readonly<{ id: string; title: MfLocalizedText; detail: MfLocalizedText }>;
  outcome: Readonly<{ exposureDays: number; recoveredDays: number; sequentialDate: string; coordinatedDate: string }>;
  sources: readonly MfManifestSource[];
  roles: readonly MfManifestRole[];
  disciplines: readonly Readonly<{ id: string; name: MfLocalizedText; impacted: boolean; impact: string }>[];
  workflow: Readonly<{
    id: string;
    tasks: readonly MfManifestTask[];
    handoffStages: readonly MfManifestHandoffStage[];
    catalog: readonly MfManifestWorkflowDefinition[];
  }>;
  story: readonly Readonly<{ step: number; state: string; stage: MfLocalizedText }>[];
}>;

export function mfText(value: MfLocalizedText, language?: "pt" | "en"): string;
