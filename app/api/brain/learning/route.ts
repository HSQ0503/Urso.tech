import { getBrainUser } from "@/lib/brain/access";
import { canEditBrainTruth, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { BRAIN_PROVIDERS, brainModel, isBrainProvider, isCatalogModel } from "@/lib/brain/models";
import { getOrgKey, getOrgKeyStatus } from "@/lib/brain/db";
import {
  BRAIN_LEARNING_PROMPT_VERSION,
  resolveBrainLearningPolicy,
  type BrainLearningMode,
  type BrainLearningRisk,
} from "@/lib/brain/learning";
import {
  BRAIN_LEARNING_BATCH_TRANSITIONS,
  normalizeLearningOperationMetrics,
  parseBrainLearningOperation,
  replacementIntroducesUnsafeText,
  previewExactReplacements,
  type BrainLearningAssessmentReason,
  type BrainLearningAssessmentVerdict,
  type BrainLearningOperation,
} from "@/lib/brain/learning-operations";
import { runAuthorizedContextLearningReview } from "@/lib/brain/learning-service";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import type { BrainPrincipal, BrainProvider } from "@/lib/brain/types";

export const maxDuration = 120;

type LearningCandidateRow = {
  id: string;
  candidate_type:
    | "new_claim"
    | "update_claim"
    | "retire_claim"
    | "resolve_conflict"
    | "stale_document"
    | "missing_knowledge"
    | "document_patch";
  proposed_action: "create" | "update" | "supersede" | "retire" | "investigate";
  title: string;
  summary: string;
  department_id: string | null;
  project_id: string | null;
  target_claim_id: string | null;
  target_doc_id: string | null;
  proposed_change: Record<string, unknown>;
  confidence: number;
  risk: BrainLearningRisk;
  status: "detected" | "queued" | "batched" | "proposed" | "dismissed" | "applied" | "expired";
  occurrence_count: number;
  proposal_kind: "claim" | "knowledge" | null;
  proposal_id: string | null;
  first_detected_at: string;
  last_detected_at: string;
  reviewed_at: string | null;
  review_note: string;
};

type LearningEvidenceRow = {
  id: string;
  candidate_id: string;
  source_context_run_id: string;
  doc_id: string;
  source_version: number;
  claim_id: string | null;
  evidence_role: "supporting" | "contradicting" | "superseding";
  authority: "governing" | "reference";
  excerpt: string;
};

type LearningBatchRow = {
  id: string;
  title: string;
  summary: string;
  department_id: string | null;
  project_id: string | null;
  risk: BrainLearningRisk;
  status: "open" | "in_review" | "proposed" | "dismissed" | "applied";
  assigned_to: string | null;
  created_at: string;
  reviewed_at: string | null;
  review_note: string;
};

type LearningAssessmentRow = {
  id: string;
  candidate_id: string;
  reviewer_user_id: string;
  verdict: BrainLearningAssessmentVerdict;
  reason_code: BrainLearningAssessmentReason;
  note: string;
  evidence_snapshot: unknown;
  created_at: string;
};

type LearningOperationsMetricRow = {
  assessment_count: number;
  reviewed_count: number;
  adjudicated_count: number;
  correct_count: number;
  partially_correct_count: number;
  incorrect_count: number;
  duplicate_count: number;
  insufficient_evidence_count: number;
  out_of_scope_count: number;
  unsafe_count: number;
  strict_precision: number | string | null;
  actionable_yield: number | string | null;
  evidence_coverage: number | string | null;
  median_decision_ms: number | string | null;
};

type LearningRunRow = {
  id: string;
  source_type: "context_run" | "approved_artifact" | "gardener";
  department_id: string | null;
  mode: Exclude<BrainLearningMode, "off">;
  status: "running" | "complete" | "failed";
  candidate_count: number;
  provider: string | null;
  model: string | null;
  failure_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type GardenerFindingRow = {
  id: string;
  finding_type:
    | "stale_document"
    | "superseded_reference"
    | "unresolved_conflict"
    | "weak_provenance"
    | "missing_knowledge";
  risk: BrainLearningRisk;
  department_id: string | null;
  project_id: string | null;
  subject_kind: "document" | "claim" | "conflict" | "question";
  subject_key: string;
  title: string;
  message: string;
  state: "open" | "resolved";
  occurrence_count: number;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  last_detected_run_id: string;
};

type GardenerObservationRow = {
  run_id: string;
  finding_id: string;
  source_snapshot: Record<string, unknown>;
  observed_at: string;
};

type LearningPolicyRow = {
  mode: BrainLearningMode;
  policy_version: string;
  settings: Record<string, unknown>;
};

type ReferenceRow = { id: string; name: string };
type DocumentRow = {
  id: string;
  path: string;
  title: string;
  content?: string;
  content_hash?: string;
  current_version?: number;
  department_id: string | null;
  project_id: string | null;
};
type DocumentVersionRow = {
  doc_id: string;
  version: number;
  content: string;
  content_hash: string;
};
type ClaimRow = { id: string; object_value: unknown };
type BatchCandidateRow = { batch_id: string; candidate_id: string };

async function stewardAccess(): Promise<
  | { admin: NonNullable<ReturnType<typeof ursoDbSafe>>; principal: BrainPrincipal }
  | { error: Response }
> {
  const user = await getBrainUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };

  const admin = ursoDbSafe();
  if (!admin) return { error: Response.json({ error: URSO_DB_MISSING }, { status: 503 }) };

  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal || !canEditBrainTruth(principal)) {
    return { error: Response.json({ error: "knowledge steward access required" }, { status: 403 }) };
  }
  return { admin, principal };
}

const unique = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

const numericValue = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const ratioPercent = (value: number | string | null | undefined): number | null => {
  const parsed = numericValue(value);
  return parsed === null ? null : parsed * 100;
};

const valueFromChange = (change: Record<string, unknown>): unknown => {
  if (change.object_value !== undefined) return change.object_value;
  if (change.content !== undefined) return change.content;
  if (change.value !== undefined) return change.value;
  return Object.keys(change).length ? change : null;
};

const learningPrincipalCanReview = (
  principal: BrainPrincipal,
  departmentId: string | null,
): boolean =>
  principal.role === "org_admin" ||
  departmentId === null ||
  departmentId === principal.departmentId;

const promotionSupport = (
  candidate: LearningCandidateRow,
  evidence: LearningEvidenceRow[],
  mode: BrainLearningMode,
  principal: BrainPrincipal,
): { allowed: boolean; reason: string | null } => {
  if (!["review", "auto_low_risk"].includes(mode)) {
    return { allowed: false, reason: "Shadow mode cannot create governed proposals." };
  }
  if (!["detected", "queued", "batched"].includes(candidate.status)) {
    return { allowed: false, reason: "This candidate has already left the review queue." };
  }
  if (
    !["update_claim", "retire_claim"].includes(
      candidate.candidate_type,
    )
  ) {
    return { allowed: false, reason: "This candidate requires investigation rather than automatic promotion." };
  }
  if (candidate.risk === "critical" && principal.role !== "org_admin") {
    return { allowed: false, reason: "Critical candidates require an organization administrator." };
  }
  if (!evidence.length) {
    return { allowed: false, reason: "Promotion requires persisted evidence." };
  }
  if (
    candidate.candidate_type === "update_claim" &&
    !evidence.some((item) => item.authority === "governing")
  ) {
    return { allowed: false, reason: "Formal claim proposals require governing evidence." };
  }
  return { allowed: true, reason: null };
};

export async function GET() {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;
  const organizationId = auth.principal.organizationId;
  const candidateFields =
    "id, candidate_type, proposed_action, title, summary, department_id, project_id, target_claim_id, target_doc_id, proposed_change, confidence, risk, status, occurrence_count, proposal_kind, proposal_id, review_note, reviewed_at, first_detected_at, last_detected_at";
  const candidateQuery = auth.admin
    .from("brain_learning_candidates")
    .select(candidateFields, { count: "exact" })
    .eq("organization_id", organizationId);
  const scopedCandidateQuery =
    auth.principal.role === "org_admin"
      ? candidateQuery
      : candidateQuery.or(
          `department_id.is.null,department_id.eq.${auth.principal.departmentId}`,
        );

  const [
    policyResult,
    candidatesResult,
    batchesResult,
    batchCandidatesResult,
    runsResult,
    gardenerFindingsResult,
    gardenerObservationsResult,
    departmentsResult,
    projectsResult,
  ] = await Promise.all([
    auth.admin
      .from("brain_learning_policies")
      .select("mode, policy_version, settings")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    scopedCandidateQuery
      .order("last_detected_at", { ascending: false })
      .limit(300),
    auth.admin
      .from("brain_learning_batches")
      .select(
        "id, title, summary, department_id, project_id, risk, status, assigned_to, created_at, reviewed_at, review_note",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    auth.admin
      .from("brain_learning_batch_candidates")
      .select("batch_id, candidate_id")
      .eq("organization_id", organizationId),
    auth.admin
      .from("brain_learning_runs")
      .select(
        "id, source_type, department_id, mode, status, candidate_count, provider, model, failure_message, started_at, completed_at",
      )
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(100),
    auth.admin
      .from("brain_gardener_findings")
      .select(
        "id, finding_type, risk, department_id, project_id, subject_kind, subject_key, title, message, state, occurrence_count, first_detected_at, last_detected_at, resolved_at, last_detected_run_id",
      )
      .eq("organization_id", organizationId)
      .order("last_detected_at", { ascending: false })
      .limit(300),
    auth.admin
      .from("brain_gardener_observations")
      .select("run_id, finding_id, source_snapshot, observed_at")
      .eq("organization_id", organizationId)
      .order("observed_at", { ascending: false })
      .limit(500),
    auth.admin
      .from("brain_departments")
      .select("id, name")
      .eq("organization_id", organizationId),
    auth.admin
      .from("brain_projects")
      .select("id, name")
      .eq("organization_id", organizationId),
  ]);

  const firstError = [
    policyResult.error,
    candidatesResult.error,
    batchesResult.error,
    batchCandidatesResult.error,
    runsResult.error,
    gardenerFindingsResult.error,
    gardenerObservationsResult.error,
    departmentsResult.error,
    projectsResult.error,
  ].find(Boolean);
  if (firstError) {
    console.error("[brain] learning inbox read failed:", firstError.message);
    return Response.json(
      { error: "The learning inbox could not be loaded." },
      { status: 500 },
    );
  }

  const policy = (policyResult.data as LearningPolicyRow | null) ?? null;
  const rows = ((candidatesResult.data ?? []) as LearningCandidateRow[]).filter((candidate) =>
    learningPrincipalCanReview(auth.principal, candidate.department_id),
  );
  const candidateIds = rows.map((candidate) => candidate.id);

  const [evidenceResult, assessmentsResult, assessmentHistoryResult] = candidateIds.length
    ? await Promise.all([
        auth.admin
          .from("brain_learning_evidence")
          .select(
            "id, candidate_id, source_context_run_id, doc_id, source_version, claim_id, evidence_role, authority, excerpt",
          )
          .eq("organization_id", organizationId)
          .in("candidate_id", candidateIds)
          .order("created_at"),
        auth.admin
          .from("brain_learning_latest_assessments")
          .select(
            "id, candidate_id, reviewer_user_id, verdict, reason_code, note, evidence_snapshot, created_at",
          )
          .eq("organization_id", organizationId)
          .in("candidate_id", candidateIds),
        auth.admin
          .from("brain_learning_assessments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("candidate_id", candidateIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: null, error: null, count: 0 },
      ];
  if (
    evidenceResult.error ||
    assessmentsResult.error ||
    assessmentHistoryResult.error
  ) {
    console.error(
      "[brain] learning operations read failed:",
      evidenceResult.error?.message ??
        assessmentsResult.error?.message ??
        assessmentHistoryResult.error?.message,
    );
    return Response.json({ error: "learning operations could not be loaded" }, { status: 500 });
  }
  const evidenceRows = (evidenceResult.data ?? []) as LearningEvidenceRow[];
  const assessmentRows = (assessmentsResult.data ?? []) as LearningAssessmentRow[];
  const operationsMetricsResult =
    auth.principal.role === "org_admin"
      ? await auth.admin
          .from("brain_learning_operations_metrics")
          .select(
            "assessment_count, reviewed_count, adjudicated_count, correct_count, partially_correct_count, incorrect_count, duplicate_count, insufficient_evidence_count, out_of_scope_count, unsafe_count, strict_precision, actionable_yield, evidence_coverage, median_decision_ms",
          )
          .eq("organization_id", organizationId)
          .maybeSingle()
      : { data: null, error: null };
  if (operationsMetricsResult.error) {
    console.error(
      "[brain] learning metric read failed:",
      operationsMetricsResult.error.message,
    );
    return Response.json(
      { error: "learning metrics could not be loaded" },
      { status: 500 },
    );
  }
  const operationsMetricRow =
    (operationsMetricsResult.data as LearningOperationsMetricRow | null) ?? null;
  const evidenceDocIds = unique(evidenceRows.map((item) => item.doc_id));
  const targetDocIds = unique(rows.map((item) => item.target_doc_id));
  const targetClaimIds = unique(rows.map((item) => item.target_claim_id));
  const sourceVersions = [
    ...new Set(
      evidenceRows
        .filter((item) => targetDocIds.includes(item.doc_id))
        .map((item) => item.source_version),
    ),
  ];

  const [docsResult, claimsResult, versionsResult] = await Promise.all([
    evidenceDocIds.length || targetDocIds.length
      ? auth.admin
          .from("brain_docs")
          .select(
            "id, path, title, content, content_hash, current_version, department_id, project_id",
          )
          .eq("organization_id", organizationId)
          .in("id", unique([...evidenceDocIds, ...targetDocIds]))
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    targetClaimIds.length
      ? auth.admin
          .from("brain_claims")
          .select("id, object_value")
          .eq("organization_id", organizationId)
          .in("id", targetClaimIds)
      : Promise.resolve({ data: [], error: null }),
    targetDocIds.length && sourceVersions.length
      ? auth.admin
          .from("brain_doc_versions")
          .select("doc_id, version, content, content_hash")
          .eq("organization_id", organizationId)
          .in("doc_id", targetDocIds)
          .in("version", sourceVersions)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (docsResult.error || claimsResult.error || versionsResult.error) {
    console.error(
      "[brain] learning source read failed:",
      docsResult.error?.message ??
        claimsResult.error?.message ??
        versionsResult.error?.message,
    );
    return Response.json(
      { error: "learning source data could not be loaded" },
      { status: 500 },
    );
  }

  const departments = new Map(
    ((departmentsResult.data ?? []) as ReferenceRow[]).map((row) => [row.id, row.name]),
  );
  const projects = new Map(
    ((projectsResult.data ?? []) as ReferenceRow[]).map((row) => [row.id, row.name]),
  );
  const docs = new Map(((docsResult.data ?? []) as DocumentRow[]).map((row) => [row.id, row]));
  const docVersions = new Map(
    ((versionsResult.data ?? []) as DocumentVersionRow[]).map((row) => [
      `${row.doc_id}:${row.version}`,
      row,
    ]),
  );
  const claims = new Map(((claimsResult.data ?? []) as ClaimRow[]).map((row) => [row.id, row]));
  const assessments = new Map(
    assessmentRows.map((row) => [row.candidate_id, row]),
  );
  const evidenceByCandidate = new Map<string, LearningEvidenceRow[]>();
  for (const item of evidenceRows) {
    evidenceByCandidate.set(item.candidate_id, [
      ...(evidenceByCandidate.get(item.candidate_id) ?? []),
      item,
    ]);
  }
  const batchRows = (batchCandidatesResult.data ?? []) as BatchCandidateRow[];
  const batchIdsByCandidate = new Map<string, string[]>();
  for (const item of batchRows) {
    batchIdsByCandidate.set(item.candidate_id, [
      ...(batchIdsByCandidate.get(item.candidate_id) ?? []),
      item.batch_id,
    ]);
  }

  const mode = policy?.mode ?? null;
  const candidates = rows.map((candidate) => {
    const evidence = evidenceByCandidate.get(candidate.id) ?? [];
    const currentClaim = candidate.target_claim_id ? claims.get(candidate.target_claim_id) : null;
    const currentDoc = candidate.target_doc_id ? docs.get(candidate.target_doc_id) : null;
    const assessment = assessments.get(candidate.id) ?? null;
    const promotion = promotionSupport(candidate, evidence, mode ?? "off", auth.principal);
    const canReview = candidate.risk !== "critical" || auth.principal.role === "org_admin";
    const patchEvidence = candidate.target_doc_id
      ? evidence.filter((item) => item.doc_id === candidate.target_doc_id)
      : [];
    const patchSourceVersions = [
      ...new Set(patchEvidence.map((item) => item.source_version)),
    ];
    const baseVersion =
      patchSourceVersions.length === 1 ? patchSourceVersions[0] : null;
    const baseDoc =
      candidate.target_doc_id && baseVersion !== null
        ? docVersions.get(`${candidate.target_doc_id}:${baseVersion}`) ?? null
        : null;
    const scopeMatches =
      Boolean(currentDoc) &&
      currentDoc?.project_id === candidate.project_id &&
      currentDoc?.department_id === candidate.department_id;
    const isStale =
      baseVersion !== null &&
      currentDoc?.current_version !== undefined &&
      baseVersion !== currentDoc.current_version;
    const patchBlockReason =
      candidate.candidate_type !== "document_patch"
        ? null
        : !["review", "auto_low_risk"].includes(mode ?? "off")
          ? "Shadow mode cannot create governed proposals."
          : !["detected", "queued", "batched"].includes(candidate.status)
            ? "This candidate has already left the review queue."
            : candidate.risk === "critical" && auth.principal.role !== "org_admin"
              ? "Critical candidates require an organization administrator."
              : evidence.length === 0
                ? "Promotion requires persisted evidence."
                : evidence.length > 50
                  ? "The patch evidence exceeds the bounded promotion limit."
              : patchSourceVersions.length !== 1
                ? "The patch requires one immutable target document version."
                : !currentDoc || !baseDoc || baseVersion === null
                ? "The exact source document version is unavailable."
                : !scopeMatches
                  ? "The target document does not share the candidate's exact scope."
                  : isStale
                    ? "The target document changed after this candidate was detected."
                    : null;
    return {
      id: candidate.id,
      candidateType: candidate.candidate_type,
      proposedAction: candidate.proposed_action,
      title: candidate.title,
      summary: candidate.summary,
      departmentId: candidate.department_id,
      departmentName: candidate.department_id
        ? departments.get(candidate.department_id) ?? null
        : null,
      projectId: candidate.project_id,
      projectName: candidate.project_id ? projects.get(candidate.project_id) ?? null : null,
      currentValue:
        currentClaim?.object_value ??
        (currentDoc?.content ? currentDoc.content.slice(0, 4_000) : null),
      proposedValue: valueFromChange(candidate.proposed_change),
      confidence: candidate.confidence,
      risk: candidate.risk,
      status: candidate.status,
      proposalKind: candidate.proposal_kind === "knowledge" ? "document" : candidate.proposal_kind,
      proposalId: candidate.proposal_id,
      firstDetectedAt: candidate.first_detected_at,
      lastDetectedAt: candidate.last_detected_at,
      reviewedAt: candidate.reviewed_at,
      reviewNote: candidate.review_note,
      occurrenceCount: candidate.occurrence_count,
      canReview,
      reviewBlockReason: canReview
        ? null
        : "Critical candidates require an organization administrator.",
      canPromote:
        candidate.candidate_type === "document_patch"
          ? patchBlockReason === null
          : promotion.allowed,
      promotionBlockReason:
        candidate.candidate_type === "document_patch"
          ? patchBlockReason
          : promotion.reason,
      requiresPromotionNote: ["material", "critical"].includes(candidate.risk),
      assessment: assessment
        ? {
            id: assessment.id,
            verdict: assessment.verdict,
            reasonCode: assessment.reason_code,
            note: assessment.note,
            assessedAt: assessment.created_at,
            assessedBy: assessment.reviewer_user_id,
          }
        : null,
      patchPreview:
        candidate.candidate_type === "document_patch"
          ? {
              targetDocId: candidate.target_doc_id,
              targetPath: currentDoc?.path ?? null,
              targetTitle: currentDoc?.title ?? null,
              targetBaseVersion: baseVersion,
              currentVersion: currentDoc?.current_version ?? null,
              baseContentHash: baseDoc?.content_hash ?? null,
              baseContent: scopeMatches ? baseDoc?.content ?? null : null,
              isStale,
              canPromote: patchBlockReason === null,
              blockReason: patchBlockReason,
            }
          : null,
      evidence: evidence.map((item) => {
        const doc = docs.get(item.doc_id);
        return {
          id: item.id,
          role: item.evidence_role,
          authority: item.authority,
          path: doc?.path ?? null,
          title: doc?.title ?? null,
          sourceVersion: item.source_version,
          excerpt: item.excerpt,
          claimId: item.claim_id,
          contextRunId: item.source_context_run_id,
        };
      }),
      batchIds: batchIdsByCandidate.get(candidate.id) ?? [],
    };
  });

  const evidenceCountByBatch = new Map<string, Set<string>>();
  for (const item of batchRows) {
    const evidence = evidenceByCandidate.get(item.candidate_id) ?? [];
    const ids = evidenceCountByBatch.get(item.batch_id) ?? new Set<string>();
    evidence.forEach((row) => ids.add(row.id));
    evidenceCountByBatch.set(item.batch_id, ids);
  }
  const visibleCandidateIds = new Set(candidateIds);
  const batches = ((batchesResult.data ?? []) as LearningBatchRow[])
    .filter((batch) => learningPrincipalCanReview(auth.principal, batch.department_id))
    .map((batch) => {
      const batchCandidateIds = batchRows
        .filter(
          (item) =>
            item.batch_id === batch.id && visibleCandidateIds.has(item.candidate_id),
        )
        .map((item) => item.candidate_id);
      const criticalBlocked =
        batch.risk === "critical" && auth.principal.role !== "org_admin";
      const allowedTransitions = criticalBlocked
        ? []
        : batch.status === "open"
          ? [...BRAIN_LEARNING_BATCH_TRANSITIONS]
          : batch.status === "in_review"
            ? ["assign", "dismiss"]
            : [];
      return {
        id: batch.id,
        title: batch.title,
        summary: batch.summary,
        risk: batch.risk,
        status: batch.status,
        departmentId: batch.department_id,
        departmentName: batch.department_id
          ? departments.get(batch.department_id) ?? null
          : null,
        projectId: batch.project_id,
        projectName: batch.project_id ? projects.get(batch.project_id) ?? null : null,
        candidateIds: batchCandidateIds,
        candidateCount: batchCandidateIds.length,
        evidenceCount: evidenceCountByBatch.get(batch.id)?.size ?? 0,
        assignedTo: batch.assigned_to,
        createdAt: batch.created_at,
        reviewedAt: batch.reviewed_at,
        reviewNote: batch.review_note,
        allowedTransitions,
        canTransition: allowedTransitions.length > 0,
        transitionBlockReason: criticalBlocked
          ? "Critical batches require an organization administrator."
          : allowedTransitions.length
            ? null
            : "This batch has reached a terminal state.",
      };
    });

  const materialCandidateIds = new Set(
    rows
      .filter((row) => ["material", "critical"].includes(row.risk))
      .map((row) => row.id),
  );
  const scopedCandidateMetricsComplete =
    (candidatesResult.count ?? rows.length) === rows.length;
  const normalizedMetrics = normalizeLearningOperationMetrics({
    candidates: rows.map((row) => ({
      id: row.id,
      status: row.status,
      firstDetectedAt: row.first_detected_at,
      hasEvidence: evidenceByCandidate.has(row.id),
    })),
    assessments: assessmentRows.map((assessment) => ({
      candidateId: assessment.candidate_id,
      verdict: assessment.verdict,
      createdAt: assessment.created_at,
    })),
    materialCandidateIds,
  });
  const assessmentEvidenceCount = assessmentRows.filter((assessment) => {
    const snapshot = assessment.evidence_snapshot;
    if (Array.isArray(snapshot)) return snapshot.length > 0;
    return Boolean(
      snapshot &&
        typeof snapshot === "object" &&
        Object.keys(snapshot as Record<string, unknown>).length,
    );
  }).length;
  const verdictCounts = operationsMetricRow
    ? {
        correct: operationsMetricRow.correct_count,
        partially_correct: operationsMetricRow.partially_correct_count,
        incorrect: operationsMetricRow.incorrect_count,
        duplicate: operationsMetricRow.duplicate_count,
        insufficient_evidence: operationsMetricRow.insufficient_evidence_count,
        out_of_scope: operationsMetricRow.out_of_scope_count,
        unsafe: operationsMetricRow.unsafe_count,
      }
    : scopedCandidateMetricsComplete
      ? Object.fromEntries(
        [
          "correct",
          "partially_correct",
          "incorrect",
          "duplicate",
          "insufficient_evidence",
          "out_of_scope",
          "unsafe",
        ].map((verdict) => [
          verdict,
          assessmentRows.filter((assessment) => assessment.verdict === verdict).length,
        ]),
      )
      : {};
  const reviewedCount =
    operationsMetricRow?.reviewed_count ??
    (scopedCandidateMetricsComplete ? assessmentRows.length : null);
  const adjudicatedCount =
    operationsMetricRow?.adjudicated_count ??
    (scopedCandidateMetricsComplete
      ? normalizedMetrics.adjudicatedCandidates
      : null);
  const metricNumber = (key: keyof typeof verdictCounts): number =>
    typeof verdictCounts[key] === "number" ? verdictCounts[key] : 0;
  const metrics = {
    ...normalizedMetrics,
    pendingCandidates: scopedCandidateMetricsComplete
      ? normalizedMetrics.pendingCandidates
      : null,
    materialRiskCandidates: scopedCandidateMetricsComplete
      ? normalizedMetrics.materialRiskCandidates
      : null,
    promotedCandidates: scopedCandidateMetricsComplete
      ? normalizedMetrics.promotedCandidates
      : null,
    evidenceCoveragePercent: scopedCandidateMetricsComplete
      ? normalizedMetrics.evidenceCoveragePercent
      : null,
    assessedCandidates: reviewedCount,
    adjudicatedCandidates: adjudicatedCount,
    strictPrecisionPercent: operationsMetricRow
      ? ratioPercent(operationsMetricRow.strict_precision)
      : scopedCandidateMetricsComplete
        ? normalizedMetrics.strictPrecisionPercent
        : null,
    strictPrecisionSampleSize: adjudicatedCount,
    actionableYieldPercent: operationsMetricRow
      ? ratioPercent(operationsMetricRow.actionable_yield)
      : scopedCandidateMetricsComplete
        ? normalizedMetrics.actionableYieldPercent
        : null,
    actionableYieldSampleSize: reviewedCount,
    medianDecisionHours: operationsMetricRow
      ? (() => {
          const milliseconds = numericValue(operationsMetricRow.median_decision_ms);
          return milliseconds === null ? null : milliseconds / 3_600_000;
        })()
      : scopedCandidateMetricsComplete
        ? normalizedMetrics.medianDecisionHours
        : null,
    medianDecisionMs: operationsMetricRow
      ? numericValue(operationsMetricRow.median_decision_ms)
      : !scopedCandidateMetricsComplete ||
          normalizedMetrics.medianDecisionHours === null
        ? null
        : normalizedMetrics.medianDecisionHours * 3_600_000,
    duplicateRatePercent: reviewedCount
      ? (metricNumber("duplicate") / reviewedCount) * 100
      : null,
    oldestPendingHours: scopedCandidateMetricsComplete
      ? normalizedMetrics.oldestPendingHours
      : null,
    guardrailViolations:
      reviewedCount === null
        ? null
        : metricNumber("out_of_scope") + metricNumber("unsafe"),
    reviewedCount,
    adjudicatedCount,
    assessmentHistoryCount:
      operationsMetricRow?.assessment_count ??
      (scopedCandidateMetricsComplete
        ? assessmentHistoryResult.count ?? 0
        : null),
    assessmentEvidenceCoveragePercent: operationsMetricRow
      ? ratioPercent(operationsMetricRow.evidence_coverage)
      : !scopedCandidateMetricsComplete
        ? null
        : assessmentRows.length
        ? (assessmentEvidenceCount / assessmentRows.length) * 100
        : null,
    metricsComplete: scopedCandidateMetricsComplete,
    operationMetricsComplete:
      operationsMetricRow !== null || scopedCandidateMetricsComplete,
    verdictCounts,
  };

  const runs = ((runsResult.data ?? []) as LearningRunRow[])
    .filter((run) => learningPrincipalCanReview(auth.principal, run.department_id))
    .map((run) => ({
      id: run.id,
      sourceType: run.source_type,
      mode: run.mode,
      status: run.status,
      candidateCount: run.candidate_count,
      provider: run.provider,
      model: run.model,
      failureMessage: run.failure_message,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    }));

  const latestObservationByFinding = new Map<string, GardenerObservationRow>();
  for (const observation of (gardenerObservationsResult.data ?? []) as GardenerObservationRow[]) {
    if (!latestObservationByFinding.has(observation.finding_id)) {
      latestObservationByFinding.set(observation.finding_id, observation);
    }
  }
  const gardenerFindings = ((gardenerFindingsResult.data ?? []) as GardenerFindingRow[])
    .filter((finding) => learningPrincipalCanReview(auth.principal, finding.department_id))
    .map((finding) => {
      const observation = latestObservationByFinding.get(finding.id);
      const rawSources = Array.isArray(observation?.source_snapshot?.sources)
        ? observation.source_snapshot.sources
        : [];
      const sources = rawSources.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const source = value as Record<string, unknown>;
        if (
          typeof source.kind !== "string" ||
          typeof source.sourceId !== "string"
        ) {
          return [];
        }
        return [{
          kind: source.kind,
          sourceId: source.sourceId,
          sourceVersion:
            typeof source.sourceVersion === "number"
              ? source.sourceVersion
              : null,
        }];
      });
      return {
        id: finding.id,
        findingType: finding.finding_type,
        risk: finding.risk,
        departmentId: finding.department_id,
        departmentName: finding.department_id
          ? departments.get(finding.department_id) ?? null
          : null,
        projectId: finding.project_id,
        projectName: finding.project_id
          ? projects.get(finding.project_id) ?? null
          : null,
        subjectKind: finding.subject_kind,
        subjectKey: finding.subject_key,
        title: finding.title,
        message: finding.message,
        state: finding.state,
        occurrenceCount: finding.occurrence_count,
        firstDetectedAt: finding.first_detected_at,
        lastDetectedAt: finding.last_detected_at,
        resolvedAt: finding.resolved_at,
        lastRunId: finding.last_detected_run_id,
        sources,
      };
    });

  return Response.json({
    mode,
    candidates,
    assessments: assessmentRows.map((assessment) => ({
      id: assessment.id,
      candidateId: assessment.candidate_id,
      assessedBy: assessment.reviewer_user_id,
      verdict: assessment.verdict,
      reasonCode: assessment.reason_code,
      note: assessment.note,
      assessedAt: assessment.created_at,
    })),
    batches,
    runs,
    gardenerFindings,
    metrics,
  });
}

export async function PATCH(request: Request) {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    decision?: "queue" | "dismiss" | "promote";
    note?: string;
  } | null;
  if (!body?.id || !body.decision || !["queue", "dismiss", "promote"].includes(body.decision)) {
    return Response.json({ error: "candidate id and a valid review decision are required" }, { status: 400 });
  }
  if (body.decision === "dismiss" && !body.note?.trim()) {
    return Response.json({ error: "a steward note is required when dismissing a candidate" }, { status: 400 });
  }

  const { data: candidate, error: candidateError } = await auth.admin
    .from("brain_learning_candidates")
    .select("department_id")
    .eq("organization_id", auth.principal.organizationId)
    .eq("id", body.id)
    .maybeSingle();
  if (candidateError) {
    console.error("[brain] candidate review authorization failed:", candidateError.message);
    return Response.json({ error: "Candidate review could not be completed." }, { status: 500 });
  }
  if (
    !candidate ||
    !learningPrincipalCanReview(
      auth.principal,
      typeof candidate.department_id === "string" ? candidate.department_id : null,
    )
  ) {
    return Response.json({ error: "Learning candidate unavailable." }, { status: 404 });
  }

  const { data, error } = await auth.admin.rpc("brain_review_learning_candidate", {
    p_organization_id: auth.principal.organizationId,
    p_candidate_id: body.id,
    p_reviewer_user_id: auth.principal.userId,
    p_decision: body.decision,
    p_review_note: body.note?.trim().slice(0, 1_000) ?? "",
    p_edited_change: null,
  });
  if (error) return operationConflict("learning candidate review", error);
  const result = (data ?? {}) as { proposalId?: string | null };
  return Response.json({ ok: true, ...result });
}

type StewardAuth = Exclude<
  Awaited<ReturnType<typeof stewardAccess>>,
  { error: Response }
>;

const operationConflict = (operation: string, error: { message: string }) => {
  console.error(`[brain] ${operation} failed:`, error.message);
  return Response.json(
    { error: "The learning operation could not be completed." },
    { status: 409 },
  );
};

async function createLearningBatch(
  auth: StewardAuth,
  operation: Extract<BrainLearningOperation, { action: "create_batch" }>,
) {
  const invoke = async () => {
    const { data, error } = await auth.admin.rpc("brain_create_learning_batch", {
      p_organization_id: auth.principal.organizationId,
      p_actor_user_id: auth.principal.userId,
      p_title: operation.title,
      p_summary: operation.summary,
      p_candidate_ids: operation.candidateIds,
      p_assigned_to: operation.assignedTo ?? null,
      p_idempotency_key: operation.requestId,
    });
    if (error) return operationConflict("learning batch creation", error);
    return Response.json({ ok: true, ...(data as Record<string, unknown>) });
  };

  const { data: existingBatch, error: replayLookupError } = await auth.admin
    .from("brain_learning_batches")
    .select("id")
    .eq("organization_id", auth.principal.organizationId)
    .eq("idempotency_key", operation.requestId)
    .maybeSingle();
  if (replayLookupError) {
    return operationConflict("learning batch replay lookup", replayLookupError);
  }
  if (existingBatch) return invoke();

  const { data: candidates, error: candidateError } = await auth.admin
    .from("brain_learning_candidates")
    .select("id, department_id, project_id")
    .eq("organization_id", auth.principal.organizationId)
    .in("id", operation.candidateIds)
    .in("status", ["detected", "queued"]);
  if (candidateError) return operationConflict("learning batch authorization", candidateError);
  if ((candidates ?? []).length !== operation.candidateIds.length) {
    return Response.json(
      { error: "One or more candidates are unavailable for this batch." },
      { status: 409 },
    );
  }
  const scopes = new Set(
    (candidates ?? []).map(
      (candidate) =>
        JSON.stringify([
          candidate.department_id ?? null,
          candidate.project_id ?? null,
        ]),
    ),
  );
  const outsideScope = (candidates ?? []).some(
    (candidate) =>
      !learningPrincipalCanReview(
        auth.principal,
        typeof candidate.department_id === "string"
          ? candidate.department_id
          : null,
      ),
  );
  if (outsideScope || scopes.size !== 1) {
    return Response.json(
      { error: "One or more candidates are unavailable for this batch." },
      { status: 409 },
    );
  }

  return invoke();
}

async function assessLearningCandidate(
  auth: StewardAuth,
  operation: Extract<BrainLearningOperation, { action: "assess_candidate" }>,
) {
  const { data: candidate, error: candidateError } = await auth.admin
    .from("brain_learning_candidates")
    .select("department_id, risk")
    .eq("organization_id", auth.principal.organizationId)
    .eq("id", operation.id)
    .maybeSingle();
  if (candidateError) return operationConflict("learning assessment authorization", candidateError);
  if (
    !candidate ||
    !learningPrincipalCanReview(
      auth.principal,
      typeof candidate.department_id === "string" ? candidate.department_id : null,
    )
  ) {
    return Response.json({ error: "Learning candidate unavailable." }, { status: 404 });
  }
  if (candidate.risk === "critical" && auth.principal.role !== "org_admin") {
    return Response.json(
      { error: "Critical candidates require an organization administrator." },
      { status: 403 },
    );
  }

  const { data, error } = await auth.admin.rpc("brain_assess_learning_candidate", {
    p_organization_id: auth.principal.organizationId,
    p_candidate_id: operation.id,
    p_reviewer_user_id: auth.principal.userId,
    p_verdict: operation.verdict,
    p_reason_code: operation.reasonCode,
    p_note: operation.note ?? "",
    p_idempotency_key: operation.requestId,
  });
  if (error) return operationConflict("learning candidate assessment", error);
  return Response.json({ ok: true, ...(data as Record<string, unknown>) });
}

async function transitionLearningBatch(
  auth: StewardAuth,
  operation: Extract<BrainLearningOperation, { action: "transition_batch" }>,
) {
  if (operation.transition === "assign" && !operation.assignedTo) {
    return Response.json(
      { error: "An assignee is required for this transition." },
      { status: 400 },
    );
  }
  if (operation.transition === "dismiss" && operation.assignedTo) {
    return Response.json(
      { error: "An assignee is not valid when dismissing a batch." },
      { status: 400 },
    );
  }
  if (operation.transition === "dismiss" && !operation.note) {
    return Response.json(
      { error: "A steward note is required when dismissing a batch." },
      { status: 400 },
    );
  }

  const { data: batch, error: batchError } = await auth.admin
    .from("brain_learning_batches")
    .select("department_id, risk")
    .eq("organization_id", auth.principal.organizationId)
    .eq("id", operation.id)
    .maybeSingle();
  if (batchError) return operationConflict("learning batch authorization", batchError);
  if (
    !batch ||
    !learningPrincipalCanReview(
      auth.principal,
      typeof batch.department_id === "string" ? batch.department_id : null,
    )
  ) {
    return Response.json({ error: "Learning batch unavailable." }, { status: 404 });
  }
  if (batch.risk === "critical" && auth.principal.role !== "org_admin") {
    return Response.json(
      { error: "Critical batches require an organization administrator." },
      { status: 403 },
    );
  }

  const { data, error } = await auth.admin.rpc("brain_transition_learning_batch", {
    p_organization_id: auth.principal.organizationId,
    p_batch_id: operation.id,
    p_actor_user_id: auth.principal.userId,
    p_action: operation.transition,
    p_note: operation.note ?? "",
    p_assigned_to: operation.assignedTo ?? null,
  });
  if (error) return operationConflict("learning batch transition", error);
  return Response.json({ ok: true, ...(data as Record<string, unknown>) });
}

async function promoteLearningDocumentPatch(
  auth: StewardAuth,
  operation: Extract<BrainLearningOperation, { action: "promote_document_patch" }>,
) {
  if (replacementIntroducesUnsafeText(operation.replacements)) {
    return Response.json(
      { error: "Replacement text contains unsafe or secret-like data." },
      { status: 400 },
    );
  }

  const [{ data: policy, error: policyError }, { data: candidate, error: candidateError }] =
    await Promise.all([
      auth.admin
        .from("brain_learning_policies")
        .select("mode")
        .eq("organization_id", auth.principal.organizationId)
        .maybeSingle(),
      auth.admin
        .from("brain_learning_candidates")
        .select(
          "candidate_type, department_id, project_id, target_doc_id, risk, status",
        )
        .eq("organization_id", auth.principal.organizationId)
        .eq("id", operation.id)
        .maybeSingle(),
    ]);
  if (policyError || candidateError) {
    return operationConflict(
      "document patch authorization",
      policyError ?? candidateError!,
    );
  }
  if (!policy || !["review", "auto_low_risk"].includes(String(policy.mode))) {
    return Response.json(
      { error: "Document patch promotion is unavailable in Shadow mode." },
      { status: 409 },
    );
  }
  if (
    !candidate ||
    candidate.candidate_type !== "document_patch" ||
    !learningPrincipalCanReview(
      auth.principal,
      typeof candidate.department_id === "string" ? candidate.department_id : null,
    )
  ) {
    return Response.json({ error: "Document patch candidate unavailable." }, { status: 404 });
  }
  if (candidate.risk === "critical" && auth.principal.role !== "org_admin") {
    return Response.json(
      { error: "Critical candidates require an organization administrator." },
      { status: 403 },
    );
  }
  if (
    ["material", "critical"].includes(String(candidate.risk)) &&
    !operation.note
  ) {
    return Response.json(
      { error: "Material and critical patches require a steward note." },
      { status: 400 },
    );
  }
  if (!candidate.target_doc_id) {
    return Response.json({ error: "Document patch candidate unavailable." }, { status: 409 });
  }

  const [{ data: targetDoc, error: docError }, { data: sourceEvidence, error: evidenceError }] =
    await Promise.all([
      auth.admin
        .from("brain_docs")
        .select("content, current_version, department_id, project_id")
        .eq("organization_id", auth.principal.organizationId)
        .eq("id", candidate.target_doc_id)
        .is("deleted_at", null)
        .maybeSingle(),
      auth.admin
        .from("brain_learning_evidence")
        .select("source_version")
        .eq("organization_id", auth.principal.organizationId)
        .eq("candidate_id", operation.id)
        .eq("doc_id", candidate.target_doc_id)
        .order("source_version", { ascending: false }),
    ]);
  if (docError || evidenceError) {
    return operationConflict("document patch source validation", docError ?? evidenceError!);
  }
  if (
    !targetDoc ||
    !sourceEvidence?.length ||
    new Set(sourceEvidence.map((item) => item.source_version)).size !== 1 ||
    targetDoc.department_id !== candidate.department_id ||
    targetDoc.project_id !== candidate.project_id ||
    targetDoc.current_version !== sourceEvidence[0].source_version
  ) {
    return Response.json(
      { error: "The exact document source is stale or outside this candidate's scope." },
      { status: 409 },
    );
  }
  const preview = previewExactReplacements(
    String(targetDoc.content ?? ""),
    operation.replacements,
  );
  if (!preview?.changed) {
    return Response.json(
      { error: "Every exact replacement must match once and change the document." },
      { status: 409 },
    );
  }

  const { data, error } = await auth.admin.rpc(
    "brain_promote_learning_document_patch",
    {
      p_organization_id: auth.principal.organizationId,
      p_candidate_id: operation.id,
      p_reviewer_user_id: auth.principal.userId,
      p_review_note: operation.note,
      p_replacements: operation.replacements,
    },
  );
  if (error) return operationConflict("document patch promotion", error);
  return Response.json({ ok: true, ...(data as Record<string, unknown>) });
}

const numberSetting = (settings: Record<string, unknown>, key: string): number | undefined => {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export async function POST(request: Request) {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;

  const operation = parseBrainLearningOperation(
    await request.json().catch(() => null),
  );
  if (!operation) {
    return Response.json({ error: "Invalid learning action payload." }, { status: 400 });
  }
  if (operation.action === "create_batch") {
    return createLearningBatch(auth, operation);
  }
  if (operation.action === "assess_candidate") {
    return assessLearningCandidate(auth, operation);
  }
  if (operation.action === "transition_batch") {
    return transitionLearningBatch(auth, operation);
  }
  if (operation.action === "promote_document_patch") {
    return promoteLearningDocumentPatch(auth, operation);
  }

  const { data: policyData, error: policyError } = await auth.admin
    .from("brain_learning_policies")
    .select("mode, policy_version, settings")
    .eq("organization_id", auth.principal.organizationId)
    .maybeSingle();
  if (policyError) return Response.json({ error: policyError.message }, { status: 500 });
  const policyRow = (policyData as LearningPolicyRow | null) ?? null;
  if (!policyRow || policyRow.mode === "off") {
    return Response.json({ error: "Controlled learning is disabled for this organization." }, { status: 409 });
  }

  const { data: contextRun, error: contextError } = await auth.admin
    .from("brain_context_runs")
    .select("id")
    .eq("organization_id", auth.principal.organizationId)
    .eq("user_id", auth.principal.userId)
    .in("status", ["complete", "partial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contextError) return Response.json({ error: contextError.message }, { status: 500 });
  if (!contextRun) {
    return Response.json(
      { error: "No completed Context Receipt is available. Ask the Brain a sourced question first." },
      { status: 409 },
    );
  }

  const settings = policyRow.settings ?? {};
  const statuses = await getOrgKeyStatus(auth.admin, auth.principal.organizationId);
  const configuredProviders = statuses.map((item) => item.provider);
  const requestedProvider = typeof settings.provider === "string" ? settings.provider : "";
  const provider: BrainProvider | null =
    isBrainProvider(requestedProvider) && configuredProviders.includes(requestedProvider)
      ? requestedProvider
      : configuredProviders.includes("openai")
        ? "openai"
        : configuredProviders[0] ?? null;
  if (!provider) {
    return Response.json(
      { error: "No organization model key is configured for a learning review." },
      { status: 503 },
    );
  }

  const requestedModel = typeof settings.model === "string" ? settings.model : "";
  const modelId = isCatalogModel(provider, requestedModel)
    ? requestedModel
    : BRAIN_PROVIDERS[provider].defaultModel;
  let apiKey: string | null;
  try {
    apiKey = await getOrgKey(auth.admin, provider, auth.principal.organizationId);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return Response.json({ error: `The organization model key could not be read: ${message}` }, { status: 503 });
  }
  if (!apiKey) {
    return Response.json({ error: `No ${BRAIN_PROVIDERS[provider].name} key is configured.` }, { status: 503 });
  }

  const policy = resolveBrainLearningPolicy(policyRow.mode, {
    policyVersion: policyRow.policy_version,
    promptVersion:
      typeof settings.promptVersion === "string"
        ? settings.promptVersion
        : BRAIN_LEARNING_PROMPT_VERSION,
    minimumConfidence: numberSetting(settings, "minimumConfidence"),
  });

  try {
    const result = await runAuthorizedContextLearningReview({
      admin: auth.admin,
      principal: auth.principal,
      contextRunId: String(contextRun.id),
      policy,
      provider,
      modelId,
      model: brainModel(provider, modelId, apiKey),
    });
    if (result.status === "failed") {
      return Response.json(
        { error: result.error ?? "The learning review failed.", runId: result.runId },
        { status: 502 },
      );
    }
    return Response.json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return Response.json({ error: message }, { status: 409 });
  }
}
