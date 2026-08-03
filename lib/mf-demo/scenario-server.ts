import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MF_BRAIN_ORGANIZATION_ID,
  MF_BRAIN_PROJECT_ID,
  MF_DEMO_CLAIM_IDS,
  MF_DEMO_RELATION_IDS,
} from "./brain-config";

const claimPairs = [
  [MF_DEMO_CLAIM_IDS.revisionC, MF_DEMO_CLAIM_IDS.revisionB, MF_DEMO_RELATION_IDS.revision],
  [MF_DEMO_CLAIM_IDS.electricalC, MF_DEMO_CLAIM_IDS.electricalB, MF_DEMO_RELATION_IDS.electrical],
  [MF_DEMO_CLAIM_IDS.chilledWaterC, MF_DEMO_CLAIM_IDS.chilledWaterB, MF_DEMO_RELATION_IDS.chilledWater],
  [MF_DEMO_CLAIM_IDS.operatingLoadC, MF_DEMO_CLAIM_IDS.operatingLoadB, MF_DEMO_RELATION_IDS.operatingLoad],
] as const;

const baselineIds = claimPairs.map(([, baseline]) => baseline);
const revisionIds = claimPairs.map(([revision]) => revision);

export async function setMfDemoScenarioStep(admin: SupabaseClient, step: number) {
  const normalizedStep = Math.max(0, Math.min(8, Math.trunc(step)));
  const now = new Date().toISOString();

  if (normalizedStep === 0) {
    const [{ error: baselineError }, { error: revisionError }, { error: decisionError }, { error: relationError }, { error: conflictError }] =
      await Promise.all([
        admin
          .from("brain_claims")
          .update({ lifecycle: "active", resolution: "accepted", valid_until: null, updated_at: now })
          .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
          .in("id", baselineIds),
        admin
          .from("brain_claims")
          .update({ lifecycle: "active", resolution: "unresolved", valid_until: null, updated_at: now })
          .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
          .in("id", revisionIds),
        admin
          .from("brain_claims")
          .update({ object_value: "pending", lifecycle: "active", resolution: "accepted", updated_at: now })
          .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
          .eq("id", MF_DEMO_CLAIM_IDS.decisionStatus),
        admin
          .from("brain_claim_relations")
          .delete()
          .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
          .in("id", Object.values(MF_DEMO_RELATION_IDS)),
        admin
          .from("brain_claim_conflicts")
          .update({ status: "open", resolution_note: "", resolved_by: null, resolved_at: null, updated_at: now })
          .eq("organization_id", MF_BRAIN_ORGANIZATION_ID),
      ]);
    const failure = baselineError ?? revisionError ?? decisionError ?? relationError ?? conflictError;
    if (failure) throw new Error(`MF scenario reset failed: ${failure.message}`);
  }

  if (normalizedStep >= 3) {
    const [{ error: baselineError }, { error: revisionError }, { error: decisionError }] = await Promise.all([
      admin
        .from("brain_claims")
        .update({ lifecycle: "superseded", resolution: "accepted", valid_until: "2026-08-01", updated_at: now })
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .in("id", baselineIds),
      admin
        .from("brain_claims")
        .update({ lifecycle: "active", resolution: "accepted", valid_until: null, updated_at: now })
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .in("id", revisionIds),
      admin
        .from("brain_claims")
        .update({ object_value: "approved", lifecycle: "active", resolution: "accepted", updated_at: now })
        .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
        .eq("id", MF_DEMO_CLAIM_IDS.decisionStatus),
    ]);
    const failure = baselineError ?? revisionError ?? decisionError;
    if (failure) throw new Error(`MF scenario approval failed: ${failure.message}`);

    const { error: relationError } = await admin.from("brain_claim_relations").upsert(
      claimPairs.map(([current, previous, id]) => ({
        id,
        organization_id: MF_BRAIN_ORGANIZATION_ID,
        from_claim_id: current,
        to_claim_id: previous,
        relation_type: "supersedes",
        created_by: "mf-demo:project-manager",
      })),
      { onConflict: "id" },
    );
    if (relationError) throw new Error(`MF supersession relation failed: ${relationError.message}`);

    const { error: conflictError } = await admin
      .from("brain_claim_conflicts")
      .update({
        status: "resolved",
        resolution_note: "DEC-042 approved Revision C and preserved Revision B as historical truth.",
        resolved_by: "mf-demo:project-manager",
        resolved_at: now,
        updated_at: now,
      })
      .eq("organization_id", MF_BRAIN_ORGANIZATION_ID);
    if (conflictError) throw new Error(`MF conflict resolution failed: ${conflictError.message}`);
  }

  const { data: organization, error: organizationError } = await admin
    .from("brain_organizations")
    .select("settings")
    .eq("id", MF_BRAIN_ORGANIZATION_ID)
    .single();
  if (organizationError) throw new Error(`MF scenario settings read failed: ${organizationError.message}`);
  const settings = typeof organization.settings === "object" && organization.settings
    ? organization.settings as Record<string, unknown>
    : {};
  const { error: settingsError } = await admin
    .from("brain_organizations")
    .update({ settings: { ...settings, scenarioStep: normalizedStep, scenarioUpdatedAt: now } })
    .eq("id", MF_BRAIN_ORGANIZATION_ID);
  if (settingsError) throw new Error(`MF scenario settings update failed: ${settingsError.message}`);

  const actionByStep = [
    "mf_demo_reset",
    "source_event_received",
    "revision_comparison_completed",
    "decision_approved",
    "impact_plan_activated",
    "work_packages_issued",
    "draft_artifacts_created",
    "reviews_recorded",
    "release_readiness_confirmed",
  ];
  const { error: auditError } = await admin.from("brain_audit_events").insert({
    organization_id: MF_BRAIN_ORGANIZATION_ID,
    actor_user_id: normalizedStep >= 3 ? "mf-demo:project-manager" : "mf-demo:harness",
    action: actionByStep[normalizedStep],
    resource_type: "project",
    resource_id: MF_BRAIN_PROJECT_ID,
    metadata: { scenarioStep: normalizedStep, demo: true },
  });
  if (auditError) throw new Error(`MF scenario audit failed: ${auditError.message}`);

  return { step: normalizedStep, truth: normalizedStep >= 3 ? "revision-c" : "revision-b" };
}
