import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeBrainGarden,
  type BrainGardenerClaim,
  type BrainGardenerConflict,
  type BrainGardenerDocument,
  type BrainGardenerFinding,
  type BrainGardenerQuestion,
} from "./learning";

export const BRAIN_GARDENER_SCAN_VERSION = "m6.2-gardener-v1";

type PolicyRow = {
  organization_id: string;
  settings: Record<string, unknown>;
};

type DepartmentRow = { id: string; name: string };
type ProjectRow = { id: string; status: "active" | "archived" };
type DocumentRow = {
  id: string;
  path: string;
  title: string;
  department_id: string | null;
  project_id: string | null;
  current_version: number;
  review_due_at: string | null;
};
type ClaimRow = {
  id: string;
  project_id: string | null;
  lifecycle: "active" | "superseded" | "retired";
  resolution: "accepted" | "unresolved" | "contested";
  updated_at: string;
};
type ClaimEvidenceRow = { claim_id: string; doc_id: string };
type ConflictRow = {
  id: string;
  claim_a_id: string;
  claim_b_id: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};
type ContextRunRow = {
  id: string;
  project_id: string | null;
  normalized_question: string;
  department_name: string | null;
  has_gap: boolean;
  created_at: string;
};

type GardenerSource = {
  kind:
    | "document_version"
    | "claim"
    | "claim_conflict"
    | "context_gap_aggregate";
  sourceId: string;
  sourceVersion?: number;
  snapshot: Record<string, unknown>;
};

type PersistedGardenerFinding = BrainGardenerFinding & {
  title: string;
  subjectKind: "document" | "claim" | "conflict" | "question";
  targetDocId: string | null;
  targetClaimId: string | null;
  targetConflictId: string | null;
  sources: GardenerSource[];
};

type StartResult = {
  state: "started" | "complete" | "running";
  runId: string;
  attempt: number;
  leaseToken?: string;
};

export type BrainGardenerRunResult = {
  organizationId: string;
  state: "complete" | "running" | "skipped";
  runId: string | null;
  attempt: number | null;
  findingCount: number;
  newFindingCount: number;
  repeatFindingCount: number;
  resolvedFindingCount: number;
  durationMs: number;
};

class GardenerScanError extends Error {
  constructor(
    readonly code: "source_read_failed" | "persistence_failed" | "invalid_source_state",
    message: string,
  ) {
    super(message);
  }
}

const numberSetting = (
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(Math.floor(value), maximum))
    : fallback;
};

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const scopedQuestionKey = (
  departmentId: string | null,
  projectId: string | null,
  questionHash: string,
): string => `${departmentId ?? ""}|${projectId ?? ""}|${questionHash}`;

async function readAll<T>(
  label: string,
  page: (from: number, to: number) => Promise<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) {
      throw new GardenerScanError(
        "source_read_failed",
        `Could not read the governed ${label} source.`,
      );
    }
    const next = data ?? [];
    rows.push(...next);
    if (next.length < pageSize) return rows;
    if (rows.length >= 10_000) {
      throw new GardenerScanError(
        "invalid_source_state",
        `The governed ${label} source exceeded the bounded scan limit.`,
      );
    }
  }
}

export function brainGardenerScheduleDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function brainGardenerLogicalKey(
  organizationId: string,
  scheduleDate: string,
): string {
  return `gardener:${BRAIN_GARDENER_SCAN_VERSION}:${organizationId}:${scheduleDate}`;
}

export function isBrainGardenerCronAuthorized(
  request: Request,
  secret: string | undefined,
): boolean {
  return Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function listEnabledBrainGardeners(
  admin: SupabaseClient,
): Promise<PolicyRow[]> {
  const policies = await readAll<PolicyRow>(
    "controlled-learning policies",
    async (from, to) => {
      const result = await admin
        .from("brain_learning_policies")
        .select("organization_id, settings")
        .eq("mode", "shadow")
        .order("organization_id")
        .range(from, to);
      return {
        data: result.data as PolicyRow[] | null,
        error: result.error,
      };
    },
  );
  return policies.filter(
    (policy) => policy.settings?.gardenerEnabled === true,
  );
}

async function loadGarden(
  admin: SupabaseClient,
  organizationId: string,
  settings: Record<string, unknown>,
  today: string,
): Promise<{
  findings: PersistedGardenerFinding[];
  stats: Record<string, number | string[]>;
}> {
  const contextLookbackDays = numberSetting(
    settings,
    "gardenerContextLookbackDays",
    90,
    7,
    365,
  );
  const [
    departments,
    projects,
    documents,
    claims,
    claimEvidence,
    conflicts,
    contextRuns,
  ] = await Promise.all([
    readAll<DepartmentRow>("departments", async (from, to) => {
      const result = await admin
        .from("brain_departments")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to);
      return {
        data: result.data as DepartmentRow[] | null,
        error: result.error,
      };
    }),
    readAll<ProjectRow>("projects", async (from, to) => {
      const result = await admin
        .from("brain_projects")
        .select("id, status")
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to);
      return {
        data: result.data as ProjectRow[] | null,
        error: result.error,
      };
    }),
    readAll<DocumentRow>("documents", async (from, to) => {
      const result = await admin
        .from("brain_docs")
        .select(
          "id, path, title, department_id, project_id, current_version, review_due_at",
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("id")
        .range(from, to);
      return {
        data: result.data as DocumentRow[] | null,
        error: result.error,
      };
    }),
    readAll<ClaimRow>("claims", async (from, to) => {
      const result = await admin
        .from("brain_claims")
        .select("id, project_id, lifecycle, resolution, updated_at")
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to);
      return {
        data: result.data as ClaimRow[] | null,
        error: result.error,
      };
    }),
    readAll<ClaimEvidenceRow>("claim evidence", async (from, to) => {
      const result = await admin
        .from("brain_claim_evidence")
        .select("claim_id, doc_id")
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to);
      return {
        data: result.data as ClaimEvidenceRow[] | null,
        error: result.error,
      };
    }),
    readAll<ConflictRow>("claim conflicts", async (from, to) => {
      const result = await admin
        .from("brain_claim_conflicts")
        .select("id, claim_a_id, claim_b_id, status, created_at")
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to);
      return {
        data: result.data as ConflictRow[] | null,
        error: result.error,
      };
    }),
    readAll<ContextRunRow>("Context Runs", async (from, to) => {
      const result = await admin
        .rpc("brain_gardener_context_window", {
          p_organization_id: organizationId,
          p_scan_date: today,
          p_lookback_days: contextLookbackDays,
        })
        .order("id")
        .range(from, to);
      return {
        data: result.data as ContextRunRow[] | null,
        error: result.error,
      };
    }),
  ]);

  const activeProjects = new Set(
    projects.filter((project) => project.status === "active").map((project) => project.id),
  );
  const projectAllowed = (projectId: string | null): boolean =>
    projectId === null || activeProjects.has(projectId);
  const departmentByName = new Map<string, string>();
  for (const department of departments) {
    const existingId = departmentByName.get(department.name);
    if (existingId && existingId !== department.id) {
      throw new GardenerScanError(
        "invalid_source_state",
        "The department catalog contains an ambiguous duplicate name.",
      );
    }
    departmentByName.set(department.name, department.id);
  }
  const evidenceByClaim = new Map<string, string[]>();
  for (const evidence of claimEvidence) {
    evidenceByClaim.set(evidence.claim_id, [
      ...(evidenceByClaim.get(evidence.claim_id) ?? []),
      evidence.doc_id,
    ]);
  }

  const eligibleDocuments = documents.filter((document) =>
    projectAllowed(document.project_id),
  );
  const eligibleClaims = claims.filter((claim) => projectAllowed(claim.project_id));
  const claimsById = new Map(eligibleClaims.map((claim) => [claim.id, claim]));
  const documentInputs: BrainGardenerDocument[] = eligibleDocuments.map((document) => ({
    id: document.id,
    path: document.path,
    title: document.title,
    departmentId: document.department_id,
    projectId: document.project_id,
    currentVersion: document.current_version,
    reviewDueAt: document.review_due_at,
    // A claim citing a document does not prove that the document derives from
    // the claim. This detector stays uncovered until a canonical dependency
    // relation exists.
    derivedFromClaimIds: [],
  }));
  const claimInputs: BrainGardenerClaim[] = eligibleClaims.map((claim) => ({
    id: claim.id,
    departmentId: null,
    projectId: claim.project_id,
    lifecycle: claim.lifecycle,
    resolution: claim.resolution,
    evidenceDocumentIds: evidenceByClaim.get(claim.id) ?? [],
  }));
  const conflictInputs: BrainGardenerConflict[] = conflicts.flatMap((conflict) => {
    const left = claimsById.get(conflict.claim_a_id);
    const right = claimsById.get(conflict.claim_b_id);
    if (!left || !right || left.project_id !== right.project_id) return [];
    return [{
      id: conflict.id,
      departmentId: null,
      projectId: left.project_id,
      status: conflict.status,
      openedAt: conflict.created_at,
      claimIds: [conflict.claim_a_id, conflict.claim_b_id],
    }];
  });

  const groupedQuestions = new Map<string, BrainGardenerQuestion>();
  const latestQuestionState = new Map<
    string,
    { createdAt: string; contextRunId: string; hasGap: boolean }
  >();
  for (const run of contextRuns) {
    if (!projectAllowed(run.project_id)) continue;
    const normalizedQuestion = run.normalized_question;
    if (!normalizedQuestion) continue;
    if (
      run.department_name &&
      !departmentByName.has(run.department_name)
    ) {
      throw new GardenerScanError(
        "invalid_source_state",
        "A Context Receipt referenced an unknown department scope.",
      );
    }
    const departmentId = run.department_name
      ? departmentByName.get(run.department_name) ?? null
      : null;
    const key = [
      departmentId ?? "",
      run.project_id ?? "",
      normalizedQuestion,
    ].join("|");
    const latest = latestQuestionState.get(key);
    if (
      !latest ||
      run.created_at > latest.createdAt ||
      (run.created_at === latest.createdAt && run.id > latest.contextRunId)
    ) {
      latestQuestionState.set(key, {
        createdAt: run.created_at,
        contextRunId: run.id,
        hasGap: run.has_gap,
      });
    }
    if (!run.has_gap) continue;
    const existing = groupedQuestions.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      if (existing.contextRunIds.length < 100) existing.contextRunIds.push(run.id);
    } else {
      groupedQuestions.set(key, {
        normalizedQuestion,
        departmentId,
        projectId: run.project_id,
        occurrenceCount: 1,
        contextRunIds: [run.id],
      });
    }
  }
  const questionInputs = [...groupedQuestions.entries()]
    .filter(([key]) => latestQuestionState.get(key)?.hasGap === true)
    .map(([, question]) => question);
  const conflictAgeDays = numberSetting(
    settings,
    "gardenerConflictAgeDays",
    14,
    1,
    365,
  );
  const unansweredThreshold = numberSetting(
    settings,
    "gardenerUnansweredThreshold",
    3,
    2,
    100,
  );
  const analyzed = analyzeBrainGarden({
    today,
    documents: documentInputs,
    claims: claimInputs,
    conflicts: conflictInputs,
    unansweredQuestions: questionInputs,
    conflictAgeDays,
    unansweredThreshold,
  }).filter((finding) => finding.type !== "superseded_reference");

  const documentsById = new Map(eligibleDocuments.map((document) => [document.id, document]));
  const conflictsById = new Map(conflicts.map((conflict) => [conflict.id, conflict]));
  const questionsByScopeHash = new Map(
    questionInputs.map((question) => [
      scopedQuestionKey(
        question.departmentId,
        question.projectId,
        hash(question.normalizedQuestion),
      ),
      question,
    ]),
  );
  const findings = analyzed.map((finding): PersistedGardenerFinding => {
    if (finding.type === "stale_document") {
      const document = documentsById.get(finding.subjectId);
      if (!document) {
        throw new GardenerScanError(
          "invalid_source_state",
          "A stale-document finding lost its source before persistence.",
        );
      }
      return {
        ...finding,
        title: `Review overdue document: ${document.title}`,
        subjectKind: "document",
        targetDocId: document.id,
        targetClaimId: null,
        targetConflictId: null,
        sources: [{
          kind: "document_version",
          sourceId: document.id,
          sourceVersion: document.current_version,
          snapshot: {
            currentVersion: document.current_version,
            reviewDueAt: document.review_due_at,
          },
        }],
      };
    }
    if (finding.type === "weak_provenance") {
      const claim = claimsById.get(finding.subjectId);
      if (!claim) {
        throw new GardenerScanError(
          "invalid_source_state",
          "A weak-provenance finding lost its claim before persistence.",
        );
      }
      return {
        ...finding,
        title: "Accepted claim lacks exact provenance",
        subjectKind: "claim",
        targetDocId: null,
        targetClaimId: claim.id,
        targetConflictId: null,
        sources: [{
          kind: "claim",
          sourceId: claim.id,
          snapshot: {
            lifecycle: claim.lifecycle,
            resolution: claim.resolution,
            evidenceDocumentCount: 0,
            updatedAt: claim.updated_at,
          },
        }],
      };
    }
    if (finding.type === "unresolved_conflict") {
      const conflict = conflictsById.get(finding.subjectId);
      if (!conflict) {
        throw new GardenerScanError(
          "invalid_source_state",
          "A conflict finding lost its source before persistence.",
        );
      }
      return {
        ...finding,
        title: "Claim conflict needs steward review",
        subjectKind: "conflict",
        targetDocId: null,
        targetClaimId: null,
        targetConflictId: conflict.id,
        sources: [{
          kind: "claim_conflict",
          sourceId: conflict.id,
          snapshot: {
            status: conflict.status,
            openedAt: conflict.created_at,
            claimIds: [conflict.claim_a_id, conflict.claim_b_id],
          },
        }],
      };
    }
    const question = questionsByScopeHash.get(
      scopedQuestionKey(
        finding.departmentId,
        finding.projectId,
        finding.subjectId,
      ),
    );
    if (!question) {
      throw new GardenerScanError(
        "invalid_source_state",
        "A missing-knowledge finding lost its gap aggregate before persistence.",
      );
    }
    return {
      ...finding,
      title: "Repeated authorized knowledge gap",
      subjectKind: "question",
      targetDocId: null,
      targetClaimId: null,
      targetConflictId: null,
      sources: [{
        kind: "context_gap_aggregate",
        sourceId: finding.subjectId,
        snapshot: {
          occurrenceCount: question.occurrenceCount,
          contextRunIds: [...question.contextRunIds].sort(),
        },
      }],
    };
  });

  return {
    findings,
    stats: {
      scannedDocumentCount: eligibleDocuments.length,
      scannedClaimCount: eligibleClaims.length,
      scannedConflictCount: conflictInputs.length,
      scannedContextRunCount: contextRuns.length,
      contextLookbackDays,
      gapAggregateCount: questionInputs.length,
      detectorCoverage: [
        "stale_document",
        "unresolved_conflict",
        "weak_provenance",
        "missing_knowledge",
      ],
    },
  };
}

export async function runBrainGardener(input: {
  admin: SupabaseClient;
  organizationId: string;
  settings: Record<string, unknown>;
  now?: Date;
}): Promise<BrainGardenerRunResult> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const scheduleDate = brainGardenerScheduleDate(now);
  const logicalRunKey = brainGardenerLogicalKey(
    input.organizationId,
    scheduleDate,
  );
  const { data: startData, error: startError } = await input.admin.rpc(
    "brain_start_gardener_run",
    {
      p_organization_id: input.organizationId,
      p_logical_run_key: logicalRunKey,
      p_schedule_date: scheduleDate,
      p_scan_version: BRAIN_GARDENER_SCAN_VERSION,
      p_lease_seconds: 300,
    },
  );
  if (startError) {
    throw new GardenerScanError(
      "persistence_failed",
      "The gardener could not claim its durable run lease.",
    );
  }
  const start = (startData ?? {}) as StartResult;
  if (start.state === "complete" || start.state === "running") {
    return {
      organizationId: input.organizationId,
      state: start.state === "complete" ? "skipped" : "running",
      runId: start.runId ?? null,
      attempt: start.attempt ?? null,
      findingCount: 0,
      newFindingCount: 0,
      repeatFindingCount: 0,
      resolvedFindingCount: 0,
      durationMs: Date.now() - startedAt,
    };
  }
  if (!start.runId || !start.leaseToken) {
    throw new GardenerScanError(
      "persistence_failed",
      "The gardener lease response was incomplete.",
    );
  }

  try {
    const garden = await loadGarden(
      input.admin,
      input.organizationId,
      input.settings,
      scheduleDate,
    );
    const { data, error } = await input.admin.rpc(
      "brain_complete_gardener_run",
      {
        p_organization_id: input.organizationId,
        p_run_id: start.runId,
        p_lease_token: start.leaseToken,
        p_findings: garden.findings,
        p_stats: {
          ...garden.stats,
          durationMs: Date.now() - startedAt,
        },
      },
    );
    if (error) {
      throw new GardenerScanError(
        "persistence_failed",
        "The gardener could not atomically persist its findings.",
      );
    }
    const result = (data ?? {}) as {
      findingCount?: number;
      newFindingCount?: number;
      repeatFindingCount?: number;
      resolvedFindingCount?: number;
    };
    return {
      organizationId: input.organizationId,
      state: "complete",
      runId: start.runId,
      attempt: start.attempt,
      findingCount: result.findingCount ?? garden.findings.length,
      newFindingCount: result.newFindingCount ?? 0,
      repeatFindingCount: result.repeatFindingCount ?? 0,
      resolvedFindingCount: result.resolvedFindingCount ?? 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (caught) {
    const failure =
      caught instanceof GardenerScanError
        ? caught
        : new GardenerScanError(
            "invalid_source_state",
            "The gardener scan encountered an unexpected source state.",
          );
    let finalFailure = failure;
    try {
      const { error } = await input.admin.rpc("brain_fail_gardener_run", {
        p_organization_id: input.organizationId,
        p_run_id: start.runId,
        p_lease_token: start.leaseToken,
        p_failure_code: failure.code,
        p_failure_message: failure.message,
        p_stats: { durationMs: Date.now() - startedAt },
      });
      if (error) {
        finalFailure = new GardenerScanError(
          "persistence_failed",
          "The gardener failed and could not persist its durable failure state.",
        );
      }
    } catch {
      finalFailure = new GardenerScanError(
        "persistence_failed",
        "The gardener failed and could not persist its durable failure state.",
      );
    }
    throw finalFailure;
  }
}
