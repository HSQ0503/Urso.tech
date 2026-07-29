import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output, type LanguageModel } from "ai";
import {
  brainLearningExtractionSchema,
  reviewBrainConversation,
  type BrainLearningExtractor,
  type BrainLearningPolicy,
  type BrainLearningRun,
  type BrainLearningSteward,
} from "./learning";
import type { BrainContextReceipt, BrainPrincipal } from "./types";

type ContextRunRow = {
  id: string;
  organization_id: string;
  user_id: string;
  thread_id: string | null;
  project_id: string | null;
  query: string;
  status: "complete" | "partial" | "failed";
  receipt: unknown;
  created_at: string;
};

type ContextEvidenceRow = {
  evidence_id: string;
  doc_id: string;
  claim_id: string | null;
  source_version: number | null;
};

type LearningPersistenceResult = {
  runId?: string;
  run_id?: string;
  candidateCount?: number;
  candidate_count?: number;
  status?: "complete" | "failed";
};

export type BrainLearningRunSummary = {
  status: "skipped" | "complete" | "failed";
  runId: string | null;
  candidateCount: number;
  rejectionCount: number;
  error?: string;
};

export function createModelLearningExtractor(
  model: LanguageModel,
): BrainLearningExtractor {
  return async ({ prompt }) => {
    const result = await generateText({
      model,
      output: Output.object({ schema: brainLearningExtractionSchema }),
      prompt,
    });
    return result.output;
  };
}

const isReceipt = (
  value: unknown,
  contextRunId: string,
): value is BrainContextReceipt => {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<BrainContextReceipt>;
  return (
    row.runId === contextRunId &&
    !!row.scope &&
    typeof row.scope.organization === "string" &&
    !!row.plan &&
    Array.isArray(row.evidence) &&
    Array.isArray(row.missing)
  );
};

async function loadContextRun(
  admin: SupabaseClient,
  principal: BrainPrincipal,
  contextRunId: string,
): Promise<ContextRunRow> {
  const { data, error } = await admin
    .from("brain_context_runs")
    .select(
      "id, organization_id, user_id, thread_id, project_id, query, status, receipt, created_at",
    )
    .eq("organization_id", principal.organizationId)
    .eq("id", contextRunId)
    .maybeSingle();
  if (error) throw new Error(`learning context read failed: ${error.message}`);
  if (!data) throw new Error("Learning source Context Receipt was not found.");
  const run = data as ContextRunRow;
  if (run.status === "failed") {
    throw new Error("A failed Context Run cannot become a learning source.");
  }
  return run;
}

async function receiptDepartmentId(
  admin: SupabaseClient,
  organizationId: string,
  receipt: BrainContextReceipt,
): Promise<string | null> {
  const { data, error } = await admin
    .from("brain_departments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", receipt.scope.department)
    .maybeSingle();
  if (error) throw new Error(`learning department read failed: ${error.message}`);
  return data ? String(data.id) : null;
}

async function authorizeLearningSource(input: {
  admin: SupabaseClient;
  principal: BrainPrincipal;
  run: ContextRunRow;
  receipt: BrainContextReceipt;
  departmentId: string | null;
}): Promise<void> {
  const { principal, run, receipt, departmentId } = input;
  if (
    run.organization_id !== principal.organizationId ||
    receipt.scope.organization !== principal.organizationId ||
    (receipt.scope.project?.id ?? null) !== run.project_id
  ) {
    throw new Error("Context Run scope does not match its persisted receipt.");
  }
  if (
    receipt.evidence.some(
      (item) =>
        item.accessProjectId !== null &&
        item.accessProjectId !== run.project_id,
    )
  ) {
    throw new Error("Context Receipt evidence exceeds its persisted project scope.");
  }
  if (run.user_id === principal.userId || principal.role === "org_admin") return;
  if (
    principal.role !== "knowledge_steward" ||
    (departmentId !== null && departmentId !== principal.departmentId)
  ) {
    throw new Error("The caller cannot review this Context Run.");
  }
  if (!run.project_id) return;
  const { data, error } = await input.admin
    .from("brain_project_memberships")
    .select("user_id")
    .eq("organization_id", principal.organizationId)
    .eq("project_id", run.project_id)
    .eq("user_id", principal.userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) {
    throw new Error("The caller is not an active member of this project scope.");
  }
}

async function loadAndVerifyEvidence(
  admin: SupabaseClient,
  receipt: BrainContextReceipt,
): Promise<Map<string, ContextEvidenceRow>> {
  const { data, error } = await admin
    .from("brain_context_evidence")
    .select("evidence_id, doc_id, claim_id, source_version")
    .eq("context_run_id", receipt.runId);
  if (error) throw new Error(`learning evidence read failed: ${error.message}`);
  const rows = (data ?? []) as ContextEvidenceRow[];
  const byId = new Map(rows.map((row) => [row.evidence_id, row]));
  for (const evidence of receipt.evidence) {
    const persisted = byId.get(evidence.id);
    if (
      !persisted ||
      !Number.isInteger(persisted.source_version) ||
      persisted.source_version !== evidence.version ||
      (evidence.claim?.id ?? null) !== persisted.claim_id
    ) {
      throw new Error(
        `Context Receipt evidence ${evidence.id} does not match its persisted source version.`,
      );
    }
  }
  if (rows.length !== receipt.evidence.length) {
    throw new Error("Context Receipt evidence cardinality does not match persistence.");
  }
  return byId;
}

async function loadAssistantObservation(
  admin: SupabaseClient,
  run: ContextRunRow,
): Promise<string> {
  if (!run.thread_id) return "";
  const { data, error } = await admin
    .from("brain_messages")
    .select("role, parts, created_at")
    .eq("thread_id", run.thread_id)
    .gte("created_at", run.created_at)
    .order("created_at")
    .limit(8);
  if (error) throw new Error(`learning conversation read failed: ${error.message}`);
  const message = (data ?? []).find((item) => item.role === "assistant") as
    | { parts?: unknown }
    | undefined;
  if (!message || !Array.isArray(message.parts)) return "";
  return message.parts
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const row = part as { type?: unknown; text?: unknown };
      return row.type === "text" && typeof row.text === "string" ? [row.text] : [];
    })
    .join("\n")
    .trim()
    .slice(0, 20_000);
}

async function loadStewards(
  admin: SupabaseClient,
  organizationId: string,
): Promise<BrainLearningSteward[]> {
  const { data: memberships, error } = await admin
    .from("brain_memberships")
    .select("user_id, role, department_id, active")
    .eq("organization_id", organizationId)
    .in("role", ["org_admin", "knowledge_steward"])
    .eq("active", true);
  if (error) throw new Error(`learning steward read failed: ${error.message}`);
  const { data: projects, error: projectError } = await admin
    .from("brain_project_memberships")
    .select("user_id, project_id")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (projectError) {
    throw new Error(`learning steward project read failed: ${projectError.message}`);
  }
  const projectsByUser = new Map<string, string[]>();
  for (const membership of projects ?? []) {
    const userId = String(membership.user_id);
    projectsByUser.set(userId, [
      ...(projectsByUser.get(userId) ?? []),
      String(membership.project_id),
    ]);
  }
  return (memberships ?? []).map((membership) => ({
    userId: String(membership.user_id),
    role:
      membership.role === "org_admin" ? "org_admin" : "knowledge_steward",
    departmentId: membership.department_id
      ? String(membership.department_id)
      : null,
    projectIds: projectsByUser.get(String(membership.user_id)) ?? [],
    active: true,
  }));
}

const persistenceRun = (run: BrainLearningRun): Record<string, unknown> => ({
  sourceType: run.sourceType,
  sourceContextRunId: run.sourceContextRunId,
  organizationId: run.organizationId,
  mode: run.mode,
  policyVersion: run.policyVersion,
  promptVersion: run.promptVersion,
  provider: run.provider,
  model: run.model,
  idempotencyKey: run.idempotencyKey,
  status: run.status,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  failureCode: run.failureCode,
  failureMessage: run.failureMessage,
});

export async function runAuthorizedContextLearningReview(input: {
  admin: SupabaseClient;
  principal: BrainPrincipal;
  contextRunId: string;
  policy: BrainLearningPolicy;
  provider?: string | null;
  modelId?: string | null;
  model?: LanguageModel;
  extract?: BrainLearningExtractor;
}): Promise<BrainLearningRunSummary> {
  if (input.policy.mode === "off") {
    return {
      status: "skipped",
      runId: null,
      candidateCount: 0,
      rejectionCount: 0,
    };
  }
  const extract =
    input.extract ?? (input.model ? createModelLearningExtractor(input.model) : null);
  if (!extract) throw new Error("Learning review needs a model or extractor.");

  const run = await loadContextRun(
    input.admin,
    input.principal,
    input.contextRunId,
  );
  if (!isReceipt(run.receipt, run.id)) {
    throw new Error("Learning source has an invalid Context Receipt.");
  }
  const receipt = run.receipt;
  const departmentId = await receiptDepartmentId(
    input.admin,
    input.principal.organizationId,
    receipt,
  );
  await authorizeLearningSource({
    admin: input.admin,
    principal: input.principal,
    run,
    receipt,
    departmentId,
  });
  const [evidence, assistantText, stewards] = await Promise.all([
    loadAndVerifyEvidence(input.admin, receipt),
    loadAssistantObservation(input.admin, run),
    loadStewards(input.admin, input.principal.organizationId),
  ]);

  let persisted: LearningPersistenceResult | null = null;
  const result = await reviewBrainConversation({
    source: {
      receipt,
      departmentId,
      userText: run.query,
      assistantText,
      provider: input.provider ?? null,
      model: input.modelId ?? null,
    },
    policy: input.policy,
    extract,
    stewards,
    persist: async ({ run: learningRun, candidates }) => {
      const enriched = candidates.map((candidate) => {
        const targetEvidence = candidate.targetDocumentPath
          ? candidate.evidence.find(
              (item) => item.sourcePath === candidate.targetDocumentPath,
            )
          : null;
        return {
          ...candidate,
          targetDocId: targetEvidence
            ? evidence.get(targetEvidence.contextEvidenceId)?.doc_id ?? null
            : null,
          ...(candidate.type === "document_patch"
            ? {
                proposedChange: {
                  automation_kind: candidate.automationKind,
                  target_base_version: targetEvidence?.sourceVersion ?? null,
                },
              }
            : {}),
          evidence: candidate.evidence.map((item) => ({
            ...item,
            documentId: evidence.get(item.contextEvidenceId)?.doc_id ?? null,
          })),
        };
      });
      const { data, error } = await input.admin.rpc(
        "brain_persist_learning_run",
        {
          p_run: persistenceRun(learningRun),
          p_candidates: enriched,
        },
      );
      if (error) {
        throw new Error(`learning run persistence failed: ${error.message}`);
      }
      persisted = (data ?? null) as LearningPersistenceResult | null;
    },
  });

  if (result.status === "skipped") {
    return {
      status: "skipped",
      runId: null,
      candidateCount: 0,
      rejectionCount: 0,
    };
  }
  const persistence = persisted as LearningPersistenceResult | null;
  const persistedStatus = persistence?.status ?? result.status;
  return {
    status: persistedStatus,
    runId:
      persistence?.runId ??
      persistence?.run_id ??
      null,
    candidateCount:
      persistence?.candidateCount ??
      persistence?.candidate_count ??
      result.candidates.length,
    rejectionCount: result.rejections.length,
    ...(persistedStatus === "failed"
      ? {
          error:
            result.status === "failed"
              ? result.error
              : "This learning attempt was previously recorded as failed.",
        }
      : {}),
  };
}
