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
  created_at: string;
  reviewed_at: string | null;
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
type DocumentRow = { id: string; path: string; title: string; content?: string; current_version?: number };
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
    auth.admin
      .from("brain_learning_candidates")
      .select(
        "id, candidate_type, proposed_action, title, summary, department_id, project_id, target_claim_id, target_doc_id, proposed_change, confidence, risk, status, occurrence_count, proposal_kind, proposal_id, review_note, reviewed_at, first_detected_at, last_detected_at",
      )
      .eq("organization_id", organizationId)
      .order("last_detected_at", { ascending: false })
      .limit(300),
    auth.admin
      .from("brain_learning_batches")
      .select("id, title, summary, department_id, project_id, risk, status, created_at, reviewed_at")
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
  if (firstError) return Response.json({ error: firstError.message }, { status: 500 });

  const policy = (policyResult.data as LearningPolicyRow | null) ?? null;
  const rows = ((candidatesResult.data ?? []) as LearningCandidateRow[]).filter((candidate) =>
    learningPrincipalCanReview(auth.principal, candidate.department_id),
  );
  const candidateIds = rows.map((candidate) => candidate.id);

  const evidenceResult = candidateIds.length
    ? await auth.admin
        .from("brain_learning_evidence")
        .select(
          "id, candidate_id, source_context_run_id, doc_id, source_version, claim_id, evidence_role, authority, excerpt",
        )
        .eq("organization_id", organizationId)
        .in("candidate_id", candidateIds)
        .order("created_at")
    : { data: [], error: null };
  if (evidenceResult.error) {
    return Response.json({ error: evidenceResult.error.message }, { status: 500 });
  }
  const evidenceRows = (evidenceResult.data ?? []) as LearningEvidenceRow[];
  const evidenceDocIds = unique(evidenceRows.map((item) => item.doc_id));
  const targetDocIds = unique(rows.map((item) => item.target_doc_id));
  const targetClaimIds = unique(rows.map((item) => item.target_claim_id));

  const [docsResult, claimsResult] = await Promise.all([
    evidenceDocIds.length || targetDocIds.length
      ? auth.admin
          .from("brain_docs")
          .select("id, path, title, content, current_version")
          .eq("organization_id", organizationId)
          .in("id", unique([...evidenceDocIds, ...targetDocIds]))
      : Promise.resolve({ data: [], error: null }),
    targetClaimIds.length
      ? auth.admin
          .from("brain_claims")
          .select("id, object_value")
          .eq("organization_id", organizationId)
          .in("id", targetClaimIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (docsResult.error || claimsResult.error) {
    return Response.json(
      { error: docsResult.error?.message ?? claimsResult.error?.message },
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
  const claims = new Map(((claimsResult.data ?? []) as ClaimRow[]).map((row) => [row.id, row]));
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
    const promotion = promotionSupport(candidate, evidence, mode ?? "off", auth.principal);
    const canReview = candidate.risk !== "critical" || auth.principal.role === "org_admin";
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
      canPromote: promotion.allowed,
      promotionBlockReason: promotion.reason,
      requiresPromotionNote: ["material", "critical"].includes(candidate.risk),
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
  const candidateCountByBatch = new Map<string, number>();
  batchRows.forEach((row) =>
    candidateCountByBatch.set(row.batch_id, (candidateCountByBatch.get(row.batch_id) ?? 0) + 1),
  );

  const batches = ((batchesResult.data ?? []) as LearningBatchRow[])
    .filter((batch) => learningPrincipalCanReview(auth.principal, batch.department_id))
    .map((batch) => ({
      id: batch.id,
      title: batch.title,
      summary: batch.summary,
      risk: batch.risk,
      status: batch.status,
      departmentName: batch.department_id ? departments.get(batch.department_id) ?? null : null,
      projectName: batch.project_id ? projects.get(batch.project_id) ?? null : null,
      candidateCount: candidateCountByBatch.get(batch.id) ?? 0,
      evidenceCount: evidenceCountByBatch.get(batch.id)?.size ?? 0,
      createdAt: batch.created_at,
      reviewedAt: batch.reviewed_at,
    }));

  const pendingStatuses = new Set(["detected", "queued", "batched"]);
  const candidatesWithEvidence = new Set(evidenceRows.map((item) => item.candidate_id)).size;
  const metrics = {
    pendingCandidates: rows.filter((row) => pendingStatuses.has(row.status)).length,
    materialRiskCandidates: rows.filter(
      (row) => pendingStatuses.has(row.status) && ["material", "critical"].includes(row.risk),
    ).length,
    promotedCandidates: rows.filter((row) => ["proposed", "applied"].includes(row.status)).length,
    evidenceCoveragePercent: rows.length ? (candidatesWithEvidence / rows.length) * 100 : null,
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
  if (candidateError) return Response.json({ error: candidateError.message }, { status: 500 });
  if (!candidate) return Response.json({ error: "learning candidate not found" }, { status: 404 });
  if (
    !learningPrincipalCanReview(
      auth.principal,
      typeof candidate.department_id === "string" ? candidate.department_id : null,
    )
  ) {
    return Response.json({ error: "candidate is outside your learning review scope" }, { status: 403 });
  }

  const { data, error } = await auth.admin.rpc("brain_review_learning_candidate", {
    p_organization_id: auth.principal.organizationId,
    p_candidate_id: body.id,
    p_reviewer_user_id: auth.principal.userId,
    p_decision: body.decision,
    p_review_note: body.note?.trim().slice(0, 1_000) ?? "",
    p_edited_change: null,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  const result = (data ?? {}) as { proposalId?: string | null };
  return Response.json({ ok: true, ...result });
}

const numberSetting = (settings: Record<string, unknown>, key: string): number | undefined => {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export async function POST(request: Request) {
  const auth = await stewardAccess();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    action?: "review_latest_context";
  } | null;
  if (body?.action !== "review_latest_context") {
    return Response.json({ error: "unsupported learning action" }, { status: 400 });
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
