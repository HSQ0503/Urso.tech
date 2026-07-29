import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "cibwzxzqomddhjbxoxeg";
const EXPECTED_CONFIRMATION = "m63-smoke";
const ORGANIZATION_ID = "urso";
const DEPARTMENT_ID = "exec";
const PROJECT_ID = "urso-brain";
const ALTERNATE_DEPARTMENT_ID = "staging-other";
const ALTERNATE_PROJECT_ID = "staging-other";
const FIXTURE_PATH = "_Staging/M6.3 Controlled Candidate.md";
const FIXTURE_DEDUPE_KEY = "staging:m63:document-patch:v1";
const ALTERNATE_DEDUPE_KEY = "staging:m63:mixed-scope:v1";
const FIXTURE_CONTENT = `# M6.3 Controlled Candidate

Deployment readiness is pending review.
`;

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};

const projectRefFromUrl = (value) => {
  const url = new URL(value);
  const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  return match?.[1] ?? null;
};

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const assertStagingTarget = () => {
  const url = required("NEXT_PUBLIC_URSO_SUPABASE_URL");
  const declaredRef = required("BRAIN_STAGING_PROJECT_REF");
  const confirmation = required("BRAIN_STAGING_CONFIRM");
  const actualRef = projectRefFromUrl(url);

  if (!actualRef || actualRef !== declaredRef) {
    throw new Error("The declared staging project ref does not match the Supabase URL.");
  }
  if (actualRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to run the M6.3 fixture against production.");
  }
  if (confirmation !== EXPECTED_CONFIRMATION) {
    throw new Error(`BRAIN_STAGING_CONFIRM must equal ${EXPECTED_CONFIRMATION}.`);
  }

  return { url, projectRef: actualRef };
};

const resultData = async (label, operation) => {
  const { data, error, count } = await operation;
  if (error) throw new Error(`${label}: ${error.message}`);
  return { data, count };
};

const ensureBaseScope = async (admin) => {
  await resultData(
    "upsert staging organization",
    admin.from("brain_organizations").upsert(
      {
        id: ORGANIZATION_ID,
        name: "Urso M6.3 Staging",
        slug: "urso",
        settings: { environment: "staging", fixture: EXPECTED_CONFIRMATION },
      },
      { onConflict: "id" },
    ),
  );
  await resultData(
    "upsert staging department",
    admin.from("brain_departments").upsert(
      {
        organization_id: ORGANIZATION_ID,
        id: DEPARTMENT_ID,
        name: "Executive",
        blurb: "Disposable M6.3 staging scope.",
        sort: 0,
      },
      { onConflict: "organization_id,id" },
    ),
  );
  await resultData(
    "upsert staging project",
    admin.from("brain_projects").upsert(
      {
        organization_id: ORGANIZATION_ID,
        id: PROJECT_ID,
        name: "Urso Brain",
        blurb: "Disposable M6.3 staging project.",
        status: "active",
        sort: 0,
      },
      { onConflict: "organization_id,id" },
    ),
  );
};

const findOrCreateUser = async (admin) => {
  const email = required("BRAIN_STAGING_TEST_EMAIL").toLowerCase();
  const password = required("BRAIN_STAGING_TEST_PASSWORD");
  if (password.length < 12) {
    throw new Error("BRAIN_STAGING_TEST_PASSWORD must be at least 12 characters.");
  }

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (listed.error) throw new Error(`list staging users: ${listed.error.message}`);
  const existing = listed.data.users.find(
    (user) => user.email?.toLowerCase() === email,
  );

  if (existing) {
    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: "M6.3 Smoke Admin" },
    });
    if (updated.error) {
      throw new Error(`update staging user: ${updated.error.message}`);
    }
    return updated.data.user;
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "M6.3 Smoke Admin" },
  });
  if (created.error) throw new Error(`create staging user: ${created.error.message}`);
  return created.data.user;
};

const ensurePrincipal = async (admin, user) => {
  await resultData(
    "upsert staging profile",
    admin.from("brain_profiles").upsert(
      {
        organization_id: ORGANIZATION_ID,
        user_id: user.id,
        name: "M6.3 Smoke Admin",
        department_id: DEPARTMENT_ID,
        title: "Staging administrator",
      },
      { onConflict: "organization_id,user_id" },
    ),
  );
  await resultData(
    "upsert staging membership",
    admin.from("brain_memberships").upsert(
      {
        organization_id: ORGANIZATION_ID,
        user_id: user.id,
        role: "org_admin",
        department_id: DEPARTMENT_ID,
        active: true,
      },
      { onConflict: "organization_id,user_id" },
    ),
  );
  await resultData(
    "preserve shadow policy",
    admin
      .from("brain_learning_policies")
      .update({
        mode: "shadow",
        policy_version: "m6.3-staging-smoke",
        updated_by: user.id,
      })
      .eq("organization_id", ORGANIZATION_ID),
  );
};

const ensureDocument = async (admin, userId) => {
  const existing = await resultData(
    "read staging document",
    admin
      .from("brain_docs")
      .select("id, content, content_hash, current_version")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("path", FIXTURE_PATH)
      .maybeSingle(),
  );
  if (existing.data) {
    if (
      existing.data.content !== FIXTURE_CONTENT ||
      existing.data.content_hash !== sha256(FIXTURE_CONTENT)
    ) {
      throw new Error("The staging fixture document exists with unexpected content.");
    }
    return existing.data;
  }

  const inserted = await resultData(
    "create staging document",
    admin
      .from("brain_docs")
      .insert({
        organization_id: ORGANIZATION_ID,
        path: FIXTURE_PATH,
        title: "M6.3 Controlled Candidate",
        description: "Disposable staging evidence for the M6.3 workflow.",
        department_id: DEPARTMENT_ID,
        project_id: PROJECT_ID,
        doc_type: "doc",
        audience: [],
        tags: ["staging", "m6.3"],
        links: [],
        content: FIXTURE_CONTENT,
        content_hash: sha256(FIXTURE_CONTENT),
        origin: "brain",
        updated_by: userId,
        visibility: "project",
      })
      .select("id, content, content_hash, current_version")
      .single(),
  );
  return inserted.data;
};

const seed = async (admin, projectRef) => {
  await resultData(
    "verify M6.3 schema",
    admin.from("brain_learning_assessments").select("id").limit(1),
  );
  await ensureBaseScope(admin);
  const user = await findOrCreateUser(admin);
  await ensurePrincipal(admin, user);

  const existing = await resultData(
    "read staging candidate",
    admin
      .from("brain_learning_candidates")
      .select("id, status")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("dedupe_key", FIXTURE_DEDUPE_KEY)
      .maybeSingle(),
  );
  if (existing.data) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          projectRef,
          reused: true,
          candidateId: existing.data.id,
          status: existing.data.status,
          testUserId: user.id,
        },
        null,
        2,
      ),
    );
    return;
  }

  const doc = await ensureDocument(admin, user.id);
  const contextRunId = randomUUID();
  const learningRunId = randomUUID();
  const candidateId = randomUUID();
  const now = new Date().toISOString();
  const receipt = {
    runId: contextRunId,
    scope: {
      organization: ORGANIZATION_ID,
      department: "Executive",
      role: "org_admin",
      project: { id: PROJECT_ID, name: "Urso Brain" },
    },
    plan: { intents: ["staging acceptance"] },
    evidence: [
      {
        id: "E1",
        path: FIXTURE_PATH,
        version: doc.current_version,
        excerpt: "Deployment readiness is pending review.",
      },
    ],
    missing: [],
    conflictAnalysis: {
      status: "performed",
      effectiveAt: now,
      conflicts: [],
    },
  };

  await resultData(
    "create staging Context Run",
    admin.from("brain_context_runs").insert({
      id: contextRunId,
      organization_id: ORGANIZATION_ID,
      user_id: user.id,
      project_id: PROJECT_ID,
      query: "Run the controlled M6.3 staging workflow.",
      status: "complete",
      retrieval_mode: "lexical",
      plan: receipt.plan,
      receipt,
      latency_ms: 1,
    }),
  );
  await resultData(
    "attach Context evidence",
    admin.from("brain_context_evidence").insert({
      context_run_id: contextRunId,
      evidence_id: "E1",
      doc_id: doc.id,
      rank: 1,
      lexical_score: 1,
      semantic_score: 0,
      fused_score: 1,
      reasons: ["staging_fixture"],
    }),
  );
  await resultData(
    "create staging learning run",
    admin.from("brain_learning_runs").insert({
      id: learningRunId,
      organization_id: ORGANIZATION_ID,
      source_type: "context_run",
      source_context_run_id: contextRunId,
      source_user_id: user.id,
      department_id: DEPARTMENT_ID,
      project_id: PROJECT_ID,
      source_scope: {
        organizationId: ORGANIZATION_ID,
        departmentId: DEPARTMENT_ID,
        projectId: PROJECT_ID,
      },
      mode: "shadow",
      policy_version: "m6.3-staging-smoke",
      prompt_version: "staging-fixture",
      provider: "fixture",
      model: "fixture",
      idempotency_key: `m63-staging:${projectRef}`,
      request_hash: sha256(`m63-staging:${projectRef}`),
      status: "complete",
      candidate_count: 1,
      started_at: now,
      completed_at: now,
    }),
  );
  await resultData(
    "create staging candidate",
    admin.from("brain_learning_candidates").insert({
      id: candidateId,
      organization_id: ORGANIZATION_ID,
      first_detected_run_id: learningRunId,
      last_detected_run_id: learningRunId,
      candidate_type: "document_patch",
      proposed_action: "update",
      title: "Clarify deployment readiness",
      summary:
        "Controlled M6.3 fixture for assessment, batching, metrics, and patch-preview acceptance.",
      department_id: DEPARTMENT_ID,
      project_id: PROJECT_ID,
      target_doc_id: doc.id,
      proposed_change: {
        automation_kind: "derived_summary_refresh",
        target_base_version: doc.current_version,
      },
      confidence: 0.99,
      risk: "low",
      dedupe_key: FIXTURE_DEDUPE_KEY,
      suggested_steward_user_id: user.id,
      status: "detected",
    }),
  );
  await resultData(
    "record staging observation",
    admin.from("brain_learning_candidate_observations").insert({
      organization_id: ORGANIZATION_ID,
      run_id: learningRunId,
      candidate_id: candidateId,
      client_id: "m63-staging-document-patch",
    }),
  );
  await resultData(
    "attach staging learning evidence",
    admin.from("brain_learning_evidence").insert({
      organization_id: ORGANIZATION_ID,
      candidate_id: candidateId,
      source_context_run_id: contextRunId,
      context_evidence_id: "E1",
      doc_id: doc.id,
      source_version: doc.current_version,
      evidence_role: "supporting",
      authority: "governing",
      excerpt: "Deployment readiness is pending review.",
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef,
        reused: false,
        candidateId,
        status: "detected",
        testUserId: user.id,
      },
      null,
      2,
    ),
  );
};

const verify = async (admin, projectRef) => {
  const candidate = await resultData(
    "read candidate",
    admin
      .from("brain_learning_candidates")
      .select("id, status, risk, candidate_type, project_id, department_id")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("dedupe_key", FIXTURE_DEDUPE_KEY)
      .maybeSingle(),
  );
  if (!candidate.data) throw new Error("The M6.3 staging candidate does not exist.");

  const [assessments, latest, batchLinks, audits] = await Promise.all([
    resultData(
      "count assessments",
      admin
        .from("brain_learning_assessments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ORGANIZATION_ID)
        .eq("candidate_id", candidate.data.id),
    ),
    resultData(
      "read latest assessment",
      admin
        .from("brain_learning_latest_assessments")
        .select("verdict, reason_code, created_at")
        .eq("organization_id", ORGANIZATION_ID)
        .eq("candidate_id", candidate.data.id)
        .maybeSingle(),
    ),
    resultData(
      "read batch membership",
      admin
        .from("brain_learning_batch_candidates")
        .select("batch_id")
        .eq("organization_id", ORGANIZATION_ID)
        .eq("candidate_id", candidate.data.id),
    ),
    resultData(
      "read recent audits",
      admin
        .from("brain_audit_events")
        .select("action, resource_type, resource_id, created_at")
        .eq("organization_id", ORGANIZATION_ID)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef,
        candidate: candidate.data,
        assessmentCount: assessments.count ?? 0,
        latestAssessment: latest.data,
        batchIds: (batchLinks.data ?? []).map((row) => row.batch_id),
        recentAuditActions: (audits.data ?? []).map((row) => row.action),
      },
      null,
      2,
    ),
  );
};

const exactCount = async (label, query) => {
  const result = await resultData(label, query);
  return result.count ?? 0;
};

const ensureAlternateCandidate = async (admin, userId, primaryCandidate) => {
  await resultData(
    "upsert alternate staging department",
    admin.from("brain_departments").upsert(
      {
        organization_id: ORGANIZATION_ID,
        id: ALTERNATE_DEPARTMENT_ID,
        name: "Staging Other",
        blurb: "Disposable alternate scope for M6.3 rejection testing.",
        sort: 99,
      },
      { onConflict: "organization_id,id" },
    ),
  );
  await resultData(
    "upsert alternate staging project",
    admin.from("brain_projects").upsert(
      {
        organization_id: ORGANIZATION_ID,
        id: ALTERNATE_PROJECT_ID,
        name: "Staging Other",
        blurb: "Disposable alternate scope for M6.3 rejection testing.",
        status: "active",
        sort: 99,
      },
      { onConflict: "organization_id,id" },
    ),
  );

  const existing = await resultData(
    "read alternate staging candidate",
    admin
      .from("brain_learning_candidates")
      .select("id, status, project_id, department_id")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("dedupe_key", ALTERNATE_DEDUPE_KEY)
      .maybeSingle(),
  );
  if (existing.data) return existing.data;

  const inserted = await resultData(
    "create alternate staging candidate",
    admin
      .from("brain_learning_candidates")
      .insert({
        organization_id: ORGANIZATION_ID,
        first_detected_run_id: primaryCandidate.last_detected_run_id,
        last_detected_run_id: primaryCandidate.last_detected_run_id,
        candidate_type: "missing_knowledge",
        proposed_action: "investigate",
        title: "Reject mixed-scope batching",
        summary: "Disposable candidate in a different project and department.",
        department_id: ALTERNATE_DEPARTMENT_ID,
        project_id: ALTERNATE_PROJECT_ID,
        proposed_change: {},
        confidence: 0.99,
        risk: "low",
        dedupe_key: ALTERNATE_DEDUPE_KEY,
        suggested_steward_user_id: userId,
        status: "detected",
      })
      .select("id, status, project_id, department_id")
      .single(),
  );
  return inserted.data;
};

const assertPermissionDenied = async (label, operation) => {
  const { error } = await operation;
  assert.ok(error, `${label} unexpectedly executed as authenticated`);
  assert.equal(
    error.code,
    "42501",
    `${label} returned ${error.code ?? "no code"} instead of permission denied`,
  );
};

const accept = async (admin, url, projectRef) => {
  await ensureBaseScope(admin);
  const user = await findOrCreateUser(admin);
  await ensurePrincipal(admin, user);

  const primaryResult = await resultData(
    "read primary staging candidate",
    admin
      .from("brain_learning_candidates")
      .select(
        "id, status, project_id, department_id, first_detected_run_id, last_detected_run_id",
      )
      .eq("organization_id", ORGANIZATION_ID)
      .eq("dedupe_key", FIXTURE_DEDUPE_KEY)
      .maybeSingle(),
  );
  const primary = primaryResult.data;
  if (!primary) throw new Error("Seed the M6.3 staging fixture before acceptance.");
  assert.ok(
    ["detected", "queued"].includes(primary.status),
    `primary candidate must be available, received ${primary.status}`,
  );

  const baselineAssessmentCount = await exactCount(
    "count baseline assessments",
    admin
      .from("brain_learning_assessments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORGANIZATION_ID)
      .eq("candidate_id", primary.id),
  );
  const baselineAssessmentAuditCount = await exactCount(
    "count baseline assessment audits",
    admin
      .from("brain_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORGANIZATION_ID)
      .eq("action", "learning.candidate.assessed"),
  );

  const retryKey = `m63-staging:assessment-retry:${randomUUID()}`;
  const partialParams = {
    p_organization_id: ORGANIZATION_ID,
    p_candidate_id: primary.id,
    p_reviewer_user_id: user.id,
    p_verdict: "partially_correct",
    p_reason_code: "needs_correction",
    p_note: "Staging retry and latest-assessment verification.",
    p_idempotency_key: retryKey,
  };
  const firstPartial = await resultData(
    "create retry assessment",
    admin.rpc("brain_assess_learning_candidate", partialParams),
  );
  const replayedPartial = await resultData(
    "replay retry assessment",
    admin.rpc("brain_assess_learning_candidate", partialParams),
  );
  assert.equal(firstPartial.data.replayed, false);
  assert.equal(replayedPartial.data.replayed, true);
  assert.equal(firstPartial.data.assessmentId, replayedPartial.data.assessmentId);

  const mismatchedRetry = await admin.rpc("brain_assess_learning_candidate", {
    ...partialParams,
    p_verdict: "incorrect",
    p_reason_code: "other",
    p_note: "This must fail because the idempotency key was reused.",
  });
  assert.ok(mismatchedRetry.error);
  assert.match(
    mismatchedRetry.error.message,
    /idempotency key was reused with different input/i,
  );

  const afterRetryCount = await exactCount(
    "count assessments after retry",
    admin
      .from("brain_learning_assessments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORGANIZATION_ID)
      .eq("candidate_id", primary.id),
  );
  assert.equal(afterRetryCount, baselineAssessmentCount + 1);

  const partialLatest = await resultData(
    "read partial latest assessment",
    admin
      .from("brain_learning_latest_assessments")
      .select("id, verdict, reason_code")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("candidate_id", primary.id)
      .single(),
  );
  assert.equal(partialLatest.data.id, firstPartial.data.assessmentId);
  assert.equal(partialLatest.data.verdict, "partially_correct");

  const partialMetrics = await resultData(
    "read partial latest metrics",
    admin
      .from("brain_learning_operations_metrics")
      .select(
        "assessment_count, reviewed_count, adjudicated_count, correct_count, partially_correct_count, strict_precision, actionable_yield, evidence_coverage",
      )
      .eq("organization_id", ORGANIZATION_ID)
      .single(),
  );
  assert.equal(Number(partialMetrics.data.assessment_count), afterRetryCount);
  assert.equal(Number(partialMetrics.data.reviewed_count), 1);
  assert.equal(Number(partialMetrics.data.adjudicated_count), 1);
  assert.equal(Number(partialMetrics.data.correct_count), 0);
  assert.equal(Number(partialMetrics.data.partially_correct_count), 1);
  assert.equal(Number(partialMetrics.data.strict_precision), 0);
  assert.equal(Number(partialMetrics.data.actionable_yield), 1);
  assert.equal(Number(partialMetrics.data.evidence_coverage), 1);

  const finalAssessment = await resultData(
    "create final deliberate assessment",
    admin.rpc("brain_assess_learning_candidate", {
      p_organization_id: ORGANIZATION_ID,
      p_candidate_id: primary.id,
      p_reviewer_user_id: user.id,
      p_verdict: "correct",
      p_reason_code: "accepted",
      p_note: "M6.3 final staging acceptance.",
      p_idempotency_key: `m63-staging:assessment-final:${randomUUID()}`,
    }),
  );
  assert.equal(finalAssessment.data.replayed, false);

  const [finalAssessmentCount, finalAssessmentAuditCount] = await Promise.all([
    exactCount(
      "count final assessments",
      admin
        .from("brain_learning_assessments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ORGANIZATION_ID)
        .eq("candidate_id", primary.id),
    ),
    exactCount(
      "count final assessment audits",
      admin
        .from("brain_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ORGANIZATION_ID)
        .eq("action", "learning.candidate.assessed"),
    ),
  ]);
  assert.equal(finalAssessmentCount, baselineAssessmentCount + 2);
  assert.equal(finalAssessmentAuditCount, baselineAssessmentAuditCount + 2);

  const finalLatest = await resultData(
    "read final latest assessment",
    admin
      .from("brain_learning_latest_assessments")
      .select("id, verdict, reason_code")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("candidate_id", primary.id)
      .single(),
  );
  assert.equal(finalLatest.data.id, finalAssessment.data.assessmentId);
  assert.equal(finalLatest.data.verdict, "correct");
  assert.equal(finalLatest.data.reason_code, "accepted");

  const finalMetrics = await resultData(
    "read final latest metrics",
    admin
      .from("brain_learning_operations_metrics")
      .select(
        "assessment_count, reviewed_count, adjudicated_count, correct_count, partially_correct_count, strict_precision, actionable_yield, evidence_coverage",
      )
      .eq("organization_id", ORGANIZATION_ID)
      .single(),
  );
  assert.equal(Number(finalMetrics.data.assessment_count), finalAssessmentCount);
  assert.equal(Number(finalMetrics.data.reviewed_count), 1);
  assert.equal(Number(finalMetrics.data.adjudicated_count), 1);
  assert.equal(Number(finalMetrics.data.correct_count), 1);
  assert.equal(Number(finalMetrics.data.partially_correct_count), 0);
  assert.equal(Number(finalMetrics.data.strict_precision), 1);
  assert.equal(Number(finalMetrics.data.actionable_yield), 1);
  assert.equal(Number(finalMetrics.data.evidence_coverage), 1);

  const insertedAssessments = await resultData(
    "read inserted assessment evidence",
    admin
      .from("brain_learning_assessments")
      .select("id, evidence_snapshot")
      .in("id", [
        firstPartial.data.assessmentId,
        finalAssessment.data.assessmentId,
      ]),
  );
  assert.equal(insertedAssessments.data.length, 2);
  assert.ok(
    insertedAssessments.data.every(
      (row) =>
        Array.isArray(row.evidence_snapshot) && row.evidence_snapshot.length === 1,
    ),
  );

  const blockedUpdate = await admin
    .from("brain_learning_assessments")
    .update({ note: "This mutation must fail." })
    .eq("id", firstPartial.data.assessmentId);
  assert.ok(blockedUpdate.error);
  const blockedDelete = await admin
    .from("brain_learning_assessments")
    .delete()
    .eq("id", firstPartial.data.assessmentId);
  assert.ok(blockedDelete.error);

  const alternate = await ensureAlternateCandidate(admin, user.id, primary);
  assert.notEqual(alternate.project_id, primary.project_id);
  assert.notEqual(alternate.department_id, primary.department_id);

  const [baselineBatchCount, baselineBatchAuditCount] = await Promise.all([
    exactCount(
      "count baseline batches",
      admin
        .from("brain_learning_batches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ORGANIZATION_ID),
    ),
    exactCount(
      "count baseline batch audits",
      admin
        .from("brain_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ORGANIZATION_ID)
        .eq("action", "learning.batch.created"),
    ),
  ]);
  const mixedBatch = await admin.rpc("brain_create_learning_batch", {
    p_organization_id: ORGANIZATION_ID,
    p_actor_user_id: user.id,
    p_title: "This mixed-scope batch must fail",
    p_summary: "Real staging rollback verification.",
    p_candidate_ids: [primary.id, alternate.id],
    p_assigned_to: null,
    p_idempotency_key: `m63-staging:mixed-batch:${randomUUID()}`,
  });
  assert.ok(mixedBatch.error);
  assert.match(
    mixedBatch.error.message,
    /must share one exact project and department scope/i,
  );

  const [finalBatchCount, finalBatchAuditCount, candidateStatuses] =
    await Promise.all([
      exactCount(
        "count batches after mixed-scope rejection",
        admin
          .from("brain_learning_batches")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ORGANIZATION_ID),
      ),
      exactCount(
        "count batch audits after mixed-scope rejection",
        admin
          .from("brain_audit_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ORGANIZATION_ID)
          .eq("action", "learning.batch.created"),
      ),
      resultData(
        "read candidate statuses after mixed-scope rejection",
        admin
          .from("brain_learning_candidates")
          .select("id, status")
          .in("id", [primary.id, alternate.id]),
      ),
    ]);
  assert.equal(finalBatchCount, baselineBatchCount);
  assert.equal(finalBatchAuditCount, baselineBatchAuditCount);
  assert.ok(
    candidateStatuses.data.every((candidate) =>
      ["detected", "queued"].includes(candidate.status),
    ),
  );

  const authenticated = createClient(
    url,
    required("NEXT_PUBLIC_URSO_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const signedIn = await authenticated.auth.signInWithPassword({
    email: required("BRAIN_STAGING_TEST_EMAIL"),
    password: required("BRAIN_STAGING_TEST_PASSWORD"),
  });
  if (signedIn.error) {
    throw new Error(`sign in staging user: ${signedIn.error.message}`);
  }

  await assertPermissionDenied(
    "brain_assess_learning_candidate",
    authenticated.rpc("brain_assess_learning_candidate", {
      p_organization_id: ORGANIZATION_ID,
      p_candidate_id: primary.id,
      p_reviewer_user_id: user.id,
      p_verdict: "invalid",
      p_reason_code: "invalid",
      p_note: "",
      p_idempotency_key: `m63-staging:authenticated:${randomUUID()}`,
    }),
  );
  await assertPermissionDenied(
    "brain_create_learning_batch",
    authenticated.rpc("brain_create_learning_batch", {
      p_organization_id: ORGANIZATION_ID,
      p_actor_user_id: user.id,
      p_title: "Permission denial",
      p_summary: "",
      p_candidate_ids: [],
      p_assigned_to: null,
      p_idempotency_key: `m63-staging:authenticated:${randomUUID()}`,
    }),
  );
  await assertPermissionDenied(
    "brain_transition_learning_batch",
    authenticated.rpc("brain_transition_learning_batch", {
      p_organization_id: ORGANIZATION_ID,
      p_batch_id: randomUUID(),
      p_actor_user_id: user.id,
      p_action: "dismiss",
      p_note: "",
      p_assigned_to: null,
    }),
  );
  await assertPermissionDenied(
    "brain_promote_learning_document_patch",
    authenticated.rpc("brain_promote_learning_document_patch", {
      p_organization_id: ORGANIZATION_ID,
      p_candidate_id: primary.id,
      p_reviewer_user_id: user.id,
      p_review_note: "",
      p_replacements: [],
    }),
  );
  await authenticated.auth.signOut();

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef,
        assessmentRetry: {
          firstReplayed: firstPartial.data.replayed,
          retryReplayed: replayedPartial.data.replayed,
          sameAssessmentId:
            firstPartial.data.assessmentId === replayedPartial.data.assessmentId,
          mismatchedRetryRejected: true,
        },
        assessmentHistory: {
          baseline: baselineAssessmentCount,
          final: finalAssessmentCount,
          latestVerdict: finalLatest.data.verdict,
          strictPrecision: Number(finalMetrics.data.strict_precision),
          actionableYield: Number(finalMetrics.data.actionable_yield),
          evidenceCoverage: Number(finalMetrics.data.evidence_coverage),
          updateDenied: true,
          deleteDenied: true,
        },
        mixedScope: {
          rejected: true,
          batchCountUnchanged: finalBatchCount === baselineBatchCount,
          auditCountUnchanged:
            finalBatchAuditCount === baselineBatchAuditCount,
        },
        authenticatedRpcDenials: [
          "brain_assess_learning_candidate",
          "brain_create_learning_batch",
          "brain_transition_learning_batch",
          "brain_promote_learning_document_patch",
        ],
      },
      null,
      2,
    ),
  );
};

const main = async () => {
  const command = process.argv[2] ?? "seed";
  if (!["seed", "verify", "accept"].includes(command)) {
    throw new Error("Usage: npm run brain:staging:m63 -- seed|verify|accept");
  }
  const { url, projectRef } = assertStagingTarget();
  const admin = createClient(url, required("URSO_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (command === "seed") await seed(admin, projectRef);
  else if (command === "verify") await verify(admin, projectRef);
  else await accept(admin, url, projectRef);
};

main().catch((error) => {
  console.error(`M6.3 staging fixture failed: ${error.message}`);
  process.exitCode = 1;
});
