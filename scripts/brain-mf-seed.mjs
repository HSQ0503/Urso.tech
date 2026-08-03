// Seed the evidence-backed temporal truth for the isolated MF demo tenant.
// Run after migration 0012 and the MF vault sync/index.
//
//   node scripts/brain-mf-seed.mjs --copy-provider-keys
//
// The optional key copy reuses Urso's encrypted provider rows inside the demo
// tenant. It never prints or decrypts a provider secret.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of ["../.env.local", "../.env"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
const key = process.env.URSO_SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ORG = "minerbo-fuchs-demo";
const PROJECT = "uberlandia-refrescos-f3";
const ENTITY = {
  project: "d1000000-0000-4000-8000-000000000001",
  line: "d1000000-0000-4000-8000-000000000002",
  milestone: "d1000000-0000-4000-8000-000000000003",
  decision: "d1000000-0000-4000-8000-000000000004",
};
const CLAIM = {
  revisionB: "d2000000-0000-4000-8000-000000000001",
  electricalB: "d2000000-0000-4000-8000-000000000002",
  chilledWaterB: "d2000000-0000-4000-8000-000000000003",
  operatingLoadB: "d2000000-0000-4000-8000-000000000004",
  releaseDateB: "d2000000-0000-4000-8000-000000000005",
  revisionC: "d2000000-0000-4000-8000-000000000011",
  electricalC: "d2000000-0000-4000-8000-000000000012",
  chilledWaterC: "d2000000-0000-4000-8000-000000000013",
  operatingLoadC: "d2000000-0000-4000-8000-000000000014",
  decisionStatus: "d2000000-0000-4000-8000-000000000021",
};

const { data: organization, error: organizationError } = await db
  .from("brain_organizations")
  .select("id")
  .eq("id", ORG)
  .maybeSingle();
if (organizationError || !organization) {
  console.error("✖ MF demo organization missing — apply 0012 first.");
  process.exit(1);
}

if (process.argv.includes("--copy-provider-keys")) {
  const { data: sourceKeys, error: keyReadError } = await db
    .from("brain_org_keys")
    .select("provider, key_ciphertext, key_last4")
    .eq("organization_id", "urso");
  if (keyReadError) {
    console.error(`✖ Provider-key read failed: ${keyReadError.message}`);
    process.exit(1);
  }
  if (sourceKeys?.length) {
    const { error: keyWriteError } = await db.from("brain_org_keys").upsert(
      sourceKeys.map((row) => ({
        organization_id: ORG,
        provider: row.provider,
        key_ciphertext: row.key_ciphertext,
        key_last4: row.key_last4,
        updated_by: "brain-mf-seed",
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "organization_id,provider" },
    );
    if (keyWriteError) {
      console.error(`✖ Provider-key copy failed: ${keyWriteError.message}`);
      process.exit(1);
    }
    console.log(`✓ Copied ${sourceKeys.length} encrypted provider-key row(s) into the isolated demo tenant.`);
  } else {
    console.log("○ No Urso provider keys were available to copy; MF chat will remain fail-closed.");
  }
}

const { error: entityError } = await db.from("brain_entities").upsert(
  [
    { id: ENTITY.project, organization_id: ORG, canonical_key: "project:uberlandia-refrescos-f3", name: "Uberlândia Refrescos — Phase 3", entity_type: "project", project_id: PROJECT, metadata: { demo: true }, created_by: "brain-mf-seed" },
    { id: ENTITY.line, organization_id: ORG, canonical_key: "equipment:fl-201", name: "FL-201 Filling Line", entity_type: "equipment", project_id: PROJECT, metadata: { equipmentCode: "FL-201" }, created_by: "brain-mf-seed" },
    { id: ENTITY.milestone, organization_id: ORG, canonical_key: "milestone:exe-02", name: "EXE-02 Executive Design Release", entity_type: "milestone", project_id: PROJECT, metadata: { gate: "EXE-02" }, created_by: "brain-mf-seed" },
    { id: ENTITY.decision, organization_id: ORG, canonical_key: "decision:dec-042", name: "DEC-042 Revision C Approval", entity_type: "decision", project_id: PROJECT, metadata: { decisionCode: "DEC-042" }, created_by: "brain-mf-seed" },
  ],
  { onConflict: "id" },
);
if (entityError) {
  console.error(`✖ Entity seed failed: ${entityError.message}`);
  process.exit(1);
}

const { error: predicateError } = await db.from("brain_predicates").upsert(
  [
    { organization_id: ORG, id: "approved-revision", name: "Approved supplier revision", description: "Supplier revision valid for current coordinated work.", object_type: "text", is_exclusive: true, created_by: "brain-mf-seed" },
    { organization_id: ORG, id: "installed-load-kw", name: "Installed electrical load (kW)", description: "Approved installed equipment load in kilowatts.", object_type: "number", is_exclusive: true, created_by: "brain-mf-seed" },
    { organization_id: ORG, id: "chilled-water-demand-kw", name: "Chilled-water demand (kW)", description: "Approved equipment chilled-water demand.", object_type: "number", is_exclusive: true, created_by: "brain-mf-seed" },
    { organization_id: ORG, id: "operating-load-kn", name: "Operating vertical load (kN)", description: "Approved operating vertical equipment load.", object_type: "number", is_exclusive: true, created_by: "brain-mf-seed" },
    { organization_id: ORG, id: "release-date", name: "Executive release date", description: "Current approved EXE-02 milestone date.", object_type: "date", is_exclusive: true, created_by: "brain-mf-seed" },
    { organization_id: ORG, id: "decision-status", name: "Decision status", description: "Current governed status of a project decision.", object_type: "text", is_exclusive: true, created_by: "brain-mf-seed" },
  ],
  { onConflict: "organization_id,id" },
);
if (predicateError) {
  console.error(`✖ Predicate seed failed: ${predicateError.message}`);
  process.exit(1);
}

const claims = [
  { id: CLAIM.revisionB, subject_entity_id: ENTITY.line, predicate_id: "approved-revision", object_type: "text", object_value: "Revision B", resolution: "accepted", valid_from: "2026-07-22", asserted_by: "mf-demo:project-manager" },
  { id: CLAIM.electricalB, subject_entity_id: ENTITY.line, predicate_id: "installed-load-kw", object_type: "number", object_value: 420, resolution: "accepted", valid_from: "2026-07-22", asserted_by: "mf-demo:project-manager" },
  { id: CLAIM.chilledWaterB, subject_entity_id: ENTITY.line, predicate_id: "chilled-water-demand-kw", object_type: "number", object_value: 118, resolution: "accepted", valid_from: "2026-07-22", asserted_by: "mf-demo:project-manager" },
  { id: CLAIM.operatingLoadB, subject_entity_id: ENTITY.line, predicate_id: "operating-load-kn", object_type: "number", object_value: 146, resolution: "accepted", valid_from: "2026-07-22", asserted_by: "mf-demo:project-manager" },
  { id: CLAIM.releaseDateB, subject_entity_id: ENTITY.milestone, predicate_id: "release-date", object_type: "date", object_value: "2026-08-16", resolution: "accepted", valid_from: "2026-07-22", asserted_by: "mf-demo:project-manager" },
  { id: CLAIM.revisionC, subject_entity_id: ENTITY.line, predicate_id: "approved-revision", object_type: "text", object_value: "Revision C", resolution: "unresolved", valid_from: "2026-08-02", asserted_by: "mf-demo:harness" },
  { id: CLAIM.electricalC, subject_entity_id: ENTITY.line, predicate_id: "installed-load-kw", object_type: "number", object_value: 483, resolution: "unresolved", valid_from: "2026-08-02", asserted_by: "mf-demo:harness" },
  { id: CLAIM.chilledWaterC, subject_entity_id: ENTITY.line, predicate_id: "chilled-water-demand-kw", object_type: "number", object_value: 139, resolution: "unresolved", valid_from: "2026-08-02", asserted_by: "mf-demo:harness" },
  { id: CLAIM.operatingLoadC, subject_entity_id: ENTITY.line, predicate_id: "operating-load-kn", object_type: "number", object_value: 168, resolution: "unresolved", valid_from: "2026-08-02", asserted_by: "mf-demo:harness" },
  { id: CLAIM.decisionStatus, subject_entity_id: ENTITY.decision, predicate_id: "decision-status", object_type: "text", object_value: "pending", resolution: "accepted", valid_from: "2026-08-01", asserted_by: "mf-demo:harness" },
].map((claim) => ({
  ...claim,
  organization_id: ORG,
  object_entity_id: null,
  lifecycle: "active",
  valid_until: null,
  project_id: PROJECT,
}));
const { error: claimError } = await db.from("brain_claims").upsert(claims, { onConflict: "id" });
if (claimError) {
  console.error(`✖ Claim seed failed: ${claimError.message}`);
  process.exit(1);
}

const evidenceSpecs = [
  [CLAIM.revisionB, "Filling Line Data Sheet — Revision B", "Supplier submission SUP-FL201-DS-B is approved for executive coordination."],
  [CLAIM.electricalB, "Electrical Load List — Revision 7", "Installed load: 420 kW"],
  [CLAIM.chilledWaterB, "Chilled-Water Calculation Summary", "Equipment thermal load: 118 kW"],
  [CLAIM.operatingLoadB, "Foundation Equipment Load Note", "Operating vertical load: 146 kN"],
  [CLAIM.releaseDateB, "Baseline Schedule — Rev 12", "EXE-02 Executive Design Release: 16 August 2026"],
  [CLAIM.revisionC, "Filling Line Data Sheet — Revision C", "Review state: received — material change approval required"],
  [CLAIM.electricalC, "Filling Line Data Sheet — Revision C", "Installed electrical load: 483 kW"],
  [CLAIM.chilledWaterC, "Filling Line Data Sheet — Revision C", "Chilled-water demand: 139 kW"],
  [CLAIM.operatingLoadC, "Filling Line Data Sheet — Revision C", "Operating vertical load: 168 kN"],
  [CLAIM.decisionStatus, "Revision C Approval — DEC-042", "Initial status: pending Project Manager approval"],
];

const titles = [...new Set(evidenceSpecs.map(([, title]) => title))];
const { data: documents, error: documentError } = await db
  .from("brain_docs")
  .select("id, title, current_version")
  .eq("organization_id", ORG)
  .in("title", titles)
  .is("deleted_at", null);
if (documentError) {
  console.error(`✖ Evidence-document read failed: ${documentError.message}`);
  process.exit(1);
}
const documentsByTitle = new Map((documents ?? []).map((document) => [document.title, document]));
const missingTitles = titles.filter((title) => !documentsByTitle.has(title));
if (missingTitles.length) {
  console.error(`✖ Sync/index the MF corpus before seeding claims. Missing: ${missingTitles.join(", ")}`);
  process.exit(1);
}

const evidenceRows = evidenceSpecs.map(([claimId, title, excerpt], index) => {
  const document = documentsByTitle.get(title);
  return {
    id: `d4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    organization_id: ORG,
    claim_id: claimId,
    doc_id: document.id,
    doc_version: document.current_version,
    evidence_role: "authoritative",
    excerpt,
    created_by: "brain-mf-seed",
  };
});
const { error: evidenceError } = await db.from("brain_claim_evidence").upsert(evidenceRows, { onConflict: "id" });
if (evidenceError) {
  console.error(`✖ Claim-evidence seed failed: ${evidenceError.message}`);
  process.exit(1);
}

const conflicts = [
  ["d5000000-0000-4000-8000-000000000001", ENTITY.line, "approved-revision", CLAIM.revisionB, CLAIM.revisionC],
  ["d5000000-0000-4000-8000-000000000002", ENTITY.line, "installed-load-kw", CLAIM.electricalB, CLAIM.electricalC],
  ["d5000000-0000-4000-8000-000000000003", ENTITY.line, "chilled-water-demand-kw", CLAIM.chilledWaterB, CLAIM.chilledWaterC],
  ["d5000000-0000-4000-8000-000000000004", ENTITY.line, "operating-load-kn", CLAIM.operatingLoadB, CLAIM.operatingLoadC],
].map(([id, subject, predicate, claimA, claimB]) => ({
  id,
  organization_id: ORG,
  subject_entity_id: subject,
  predicate_id: predicate,
  claim_a_id: claimA,
  claim_b_id: claimB,
  conflict_type: "exclusive_value",
  status: "open",
  resolution_note: "",
}));
const { error: conflictError } = await db.from("brain_claim_conflicts").upsert(conflicts, { onConflict: "id" });
if (conflictError) {
  console.error(`✖ Conflict seed failed: ${conflictError.message}`);
  process.exit(1);
}

const { error: learningPolicyError } = await db.rpc("brain_set_learning_policy", {
  p_organization_id: ORG,
  p_actor_user_id: "mf-demo:project-manager",
  p_mode: "shadow",
  p_settings: { demo: true, gardenerEnabled: false },
});
if (learningPolicyError) {
  console.error(`✖ Learning-policy seed failed: ${learningPolicyError.message}`);
  process.exit(1);
}

console.log(`\n✓ MF Brain seeded: 4 entities, 6 predicates, ${claims.length} claims, ${evidenceRows.length} evidence rows, ${conflicts.length} governed conflicts.\n`);
