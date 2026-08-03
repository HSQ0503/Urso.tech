export type MfLocalizedText = Readonly<{ pt: string; en: string }>;
export type MfSourceMode = "live" | "demo" | "pilot";

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
  workflow: Readonly<{ id: string; tasks: readonly MfManifestTask[] }>;
  story: readonly Readonly<{ step: number; state: string; stage: MfLocalizedText }>[];
}>;

export function mfText(value: MfLocalizedText, language?: "pt" | "en"): string;
