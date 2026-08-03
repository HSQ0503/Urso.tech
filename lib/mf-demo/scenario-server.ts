import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MF_BRAIN_ORGANIZATION_ID,
  MF_BRAIN_PROJECT_ID,
  MF_DEMO_CLAIM_IDS,
  MF_DEMO_RELATION_IDS,
  getMfDemoPersona,
} from "./brain-config";
import { mfScenarioManifest } from "./manifest.mjs";

const claimPairs = [
  [MF_DEMO_CLAIM_IDS.revisionC, MF_DEMO_CLAIM_IDS.revisionB, MF_DEMO_RELATION_IDS.revision],
  [MF_DEMO_CLAIM_IDS.electricalC, MF_DEMO_CLAIM_IDS.electricalB, MF_DEMO_RELATION_IDS.electrical],
  [MF_DEMO_CLAIM_IDS.chilledWaterC, MF_DEMO_CLAIM_IDS.chilledWaterB, MF_DEMO_RELATION_IDS.chilledWater],
  [MF_DEMO_CLAIM_IDS.operatingLoadC, MF_DEMO_CLAIM_IDS.operatingLoadB, MF_DEMO_RELATION_IDS.operatingLoad],
] as const;

const baselineIds = claimPairs.map(([, baseline]) => baseline);
const revisionIds = claimPairs.map(([revision]) => revision);
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
] as const;

type ApplyScenarioInput = {
  step: number;
  demoSessionId: string;
  idempotencyKey: string;
  actorRoleId: string;
  recordAudit?: boolean;
};

function normalizeScenarioStep(step: number) {
  return Math.max(0, Math.min(8, Math.trunc(step)));
}

async function applyClaims(admin: SupabaseClient, approved: boolean, now: string) {
  const [{ error: baselineError }, { error: revisionError }, { error: decisionError }] = await Promise.all([
    admin
      .from("brain_claims")
      .update({
        lifecycle: approved ? "superseded" : "active",
        resolution: "accepted",
        valid_until: approved ? mfScenarioManifest.decision.effectiveDate : null,
        updated_at: now,
      })
      .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
      .in("id", baselineIds),
    admin
      .from("brain_claims")
      .update({
        lifecycle: "active",
        resolution: approved ? "accepted" : "unresolved",
        valid_until: null,
        updated_at: now,
      })
      .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
      .in("id", revisionIds),
    admin
      .from("brain_claims")
      .update({
        object_value: approved ? "approved" : "pending",
        lifecycle: "active",
        resolution: "accepted",
        updated_at: now,
      })
      .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
      .eq("id", MF_DEMO_CLAIM_IDS.decisionStatus),
  ]);
  const failure = baselineError ?? revisionError ?? decisionError;
  if (failure) throw new Error(`MF claim transition failed: ${failure.message}`);
}

async function applyRelationsAndConflicts(admin: SupabaseClient, approved: boolean, now: string) {
  if (approved) {
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
  } else {
    const { error: relationError } = await admin
      .from("brain_claim_relations")
      .delete()
      .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
      .in("id", Object.values(MF_DEMO_RELATION_IDS));
    if (relationError) throw new Error(`MF supersession reset failed: ${relationError.message}`);
  }

  const { error: conflictError } = await admin
    .from("brain_claim_conflicts")
    .update(approved ? {
      status: "resolved",
      resolution_note: "DEC-042 approved Revision C and preserved Revision B as historical truth.",
      resolved_by: "mf-demo:project-manager",
      resolved_at: now,
      updated_at: now,
    } : {
      status: "open",
      resolution_note: "",
      resolved_by: null,
      resolved_at: null,
      updated_at: now,
    })
    .eq("organization_id", MF_BRAIN_ORGANIZATION_ID);
  if (conflictError) throw new Error(`MF conflict transition failed: ${conflictError.message}`);
}

async function recordAuditOnce(admin: SupabaseClient, step: number, input: ApplyScenarioInput) {
  const { data: existing, error: lookupError } = await admin
    .from("brain_audit_events")
    .select("id")
    .eq("organization_id", MF_BRAIN_ORGANIZATION_ID)
    .eq("resource_type", "project")
    .eq("resource_id", MF_BRAIN_PROJECT_ID)
    .eq("metadata->>idempotencyKey", input.idempotencyKey)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(`MF audit lookup failed: ${lookupError.message}`);
  if (existing) return;

  const actor = getMfDemoPersona(input.actorRoleId);
  if (!actor) throw new Error("MF scenario actor is not a configured demo persona.");
  const { error: auditError } = await admin.from("brain_audit_events").insert({
    organization_id: MF_BRAIN_ORGANIZATION_ID,
    actor_user_id: actor.userId,
    action: actionByStep[step],
    resource_type: "project",
    resource_id: MF_BRAIN_PROJECT_ID,
    metadata: {
      scenarioStep: step,
      demo: true,
      demoSessionId: input.demoSessionId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (auditError) throw new Error(`MF scenario audit failed: ${auditError.message}`);
}

export async function applyMfBrainScenarioState(
  admin: SupabaseClient,
  input: ApplyScenarioInput,
) {
  const step = normalizeScenarioStep(input.step);
  const approved = step > 2;
  const now = new Date().toISOString();
  await applyClaims(admin, approved, now);
  await applyRelationsAndConflicts(admin, approved, now);
  if (input.recordAudit !== false) await recordAuditOnce(admin, step, input);
  return { step, truth: approved ? "revision-c" : "revision-b" } as const;
}
