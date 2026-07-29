import { z } from "zod";

export const BRAIN_LEARNING_ASSESSMENT_VERDICTS = [
  "correct",
  "partially_correct",
  "incorrect",
  "duplicate",
  "insufficient_evidence",
  "out_of_scope",
  "unsafe",
] as const;

export const BRAIN_LEARNING_ASSESSMENT_REASONS = [
  "accepted",
  "needs_correction",
  "duplicate",
  "insufficient_evidence",
  "out_of_scope",
  "unsafe",
  "other",
] as const;

export const BRAIN_LEARNING_BATCH_TRANSITIONS = [
  "assign",
  "start_review",
  "dismiss",
] as const;

const identifier = z.string().uuid();
const userIdentifier = z.string().trim().min(1).max(160);
const note = z.string().trim().max(1_000).optional();

const reviewLatestContextSchema = z.object({
  action: z.literal("review_latest_context"),
});

const createBatchSchema = z.object({
  action: z.literal("create_batch"),
  requestId: identifier,
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().max(2_000),
  candidateIds: z
    .array(identifier)
    .min(1)
    .max(25)
    .refine((values) => new Set(values).size === values.length),
  assignedTo: userIdentifier.optional(),
});

const assessCandidateSchema = z
  .object({
    action: z.literal("assess_candidate"),
    requestId: identifier,
    id: identifier,
    verdict: z.enum(BRAIN_LEARNING_ASSESSMENT_VERDICTS),
    reasonCode: z.enum(BRAIN_LEARNING_ASSESSMENT_REASONS),
    note,
  })
  .superRefine((assessment, context) => {
    const expectedReasons: Record<
      BrainLearningAssessmentVerdict,
      readonly BrainLearningAssessmentReason[]
    > = {
      correct: ["accepted"],
      partially_correct: ["needs_correction"],
      incorrect: ["needs_correction", "other"],
      duplicate: ["duplicate"],
      insufficient_evidence: ["insufficient_evidence"],
      out_of_scope: ["out_of_scope"],
      unsafe: ["unsafe"],
    };
    if (!expectedReasons[assessment.verdict].includes(assessment.reasonCode)) {
      context.addIssue({
        code: "custom",
        message: "Assessment reason does not match its verdict.",
        path: ["reasonCode"],
      });
    }
    if (assessment.reasonCode === "other" && !assessment.note) {
      context.addIssue({
        code: "custom",
        message: "Other assessments require a note.",
        path: ["note"],
      });
    }
  });

const transitionBatchSchema = z.object({
  action: z.literal("transition_batch"),
  id: identifier,
  transition: z.enum(BRAIN_LEARNING_BATCH_TRANSITIONS),
  note,
  assignedTo: userIdentifier.optional(),
});

const exactReplacementSchema = z.object({
  find: z.string().min(1).max(8_000),
  replace: z.string().max(8_000),
});

const promoteDocumentPatchSchema = z
  .object({
    action: z.literal("promote_document_patch"),
    id: identifier,
    replacements: z.array(exactReplacementSchema).min(1).max(10),
    note: z.string().trim().max(1_000).default(""),
  })
  .refine(
    ({ replacements }) =>
      new Set(replacements.map((replacement) => replacement.find)).size ===
      replacements.length,
  )
  .refine(
    ({ replacements }) =>
      replacements.reduce(
        (total, replacement) =>
          total + replacement.find.length + replacement.replace.length,
        0,
      ) <= 32_000,
  );

export const brainLearningOperationSchema = z.discriminatedUnion("action", [
  reviewLatestContextSchema,
  createBatchSchema,
  assessCandidateSchema,
  transitionBatchSchema,
  promoteDocumentPatchSchema,
]);

export type BrainLearningOperation = z.infer<
  typeof brainLearningOperationSchema
>;

export type BrainLearningAssessmentVerdict =
  (typeof BRAIN_LEARNING_ASSESSMENT_VERDICTS)[number];

export type BrainLearningAssessmentReason =
  (typeof BRAIN_LEARNING_ASSESSMENT_REASONS)[number];

export type BrainLearningBatchTransition =
  (typeof BRAIN_LEARNING_BATCH_TRANSITIONS)[number];

export type BrainLearningExactReplacement = z.infer<
  typeof exactReplacementSchema
>;

export const parseBrainLearningOperation = (
  value: unknown,
): BrainLearningOperation | null => {
  const result = brainLearningOperationSchema.safeParse(value);
  return result.success ? result.data : null;
};

export type BrainLearningMetricCandidate = {
  id: string;
  status: string;
  firstDetectedAt: string;
  hasEvidence: boolean;
};

export type BrainLearningMetricAssessment = {
  candidateId: string;
  verdict: BrainLearningAssessmentVerdict;
  createdAt: string;
};

export type BrainLearningOperationMetrics = {
  pendingCandidates: number;
  materialRiskCandidates: number;
  promotedCandidates: number;
  evidenceCoveragePercent: number | null;
  assessedCandidates: number;
  adjudicatedCandidates: number;
  strictPrecisionPercent: number | null;
  strictPrecisionSampleSize: number;
  actionableYieldPercent: number | null;
  actionableYieldSampleSize: number;
  medianDecisionHours: number | null;
  duplicateRatePercent: number | null;
  oldestPendingHours: number | null;
  guardrailViolations: number;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const normalizeLearningOperationMetrics = (input: {
  candidates: BrainLearningMetricCandidate[];
  assessments: BrainLearningMetricAssessment[];
  materialCandidateIds?: ReadonlySet<string>;
  now?: Date;
}): BrainLearningOperationMetrics => {
  const now = input.now ?? new Date();
  const pendingStatuses = new Set(["detected", "queued", "batched"]);
  const pending = input.candidates.filter((candidate) =>
    pendingStatuses.has(candidate.status),
  );
  const adjudicated = input.assessments.filter(
    (assessment) => assessment.verdict !== "insufficient_evidence",
  );
  const correct = adjudicated.filter(
    (assessment) => assessment.verdict === "correct",
  ).length;
  const actionable = input.assessments.filter((assessment) =>
    ["correct", "partially_correct"].includes(assessment.verdict),
  ).length;
  const byId = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const decisionHours = input.assessments.flatMap((assessment) => {
    const firstDetectedAt = byId.get(assessment.candidateId)?.firstDetectedAt;
    if (!firstDetectedAt) return [];
    const elapsed =
      new Date(assessment.createdAt).getTime() -
      new Date(firstDetectedAt).getTime();
    return Number.isFinite(elapsed) && elapsed >= 0
      ? [elapsed / 3_600_000]
      : [];
  });
  const oldestPendingTime = pending.reduce<number | null>((oldest, candidate) => {
    const detected = new Date(candidate.firstDetectedAt).getTime();
    if (!Number.isFinite(detected)) return oldest;
    return oldest === null ? detected : Math.min(oldest, detected);
  }, null);
  const withEvidence = input.candidates.filter(
    (candidate) => candidate.hasEvidence,
  ).length;

  return {
    pendingCandidates: pending.length,
    materialRiskCandidates: pending.filter((candidate) =>
      input.materialCandidateIds?.has(candidate.id),
    ).length,
    promotedCandidates: input.candidates.filter((candidate) =>
      ["proposed", "applied"].includes(candidate.status),
    ).length,
    evidenceCoveragePercent: input.candidates.length
      ? (withEvidence / input.candidates.length) * 100
      : null,
    assessedCandidates: input.assessments.length,
    adjudicatedCandidates: adjudicated.length,
    strictPrecisionPercent: adjudicated.length
      ? (correct / adjudicated.length) * 100
      : null,
    strictPrecisionSampleSize: adjudicated.length,
    actionableYieldPercent: input.assessments.length
      ? (actionable / input.assessments.length) * 100
      : null,
    actionableYieldSampleSize: input.assessments.length,
    medianDecisionHours: median(decisionHours),
    duplicateRatePercent: input.assessments.length
      ? (input.assessments.filter(
          (assessment) => assessment.verdict === "duplicate",
        ).length /
          input.assessments.length) *
        100
      : null,
    oldestPendingHours:
      oldestPendingTime === null
        ? null
        : Math.max(0, (now.getTime() - oldestPendingTime) / 3_600_000),
    guardrailViolations: input.assessments.filter((assessment) =>
      ["out_of_scope", "unsafe"].includes(assessment.verdict),
    ).length,
  };
};

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9]{16,}\b/i,
  /\bsk-[a-z0-9_-]{16,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bxox[baprs]-[a-z0-9-]{20,}\b/i,
  /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/i,
  /\bBearer\s+[a-z0-9._~+/=-]{20,}\b/i,
  /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^:\s]+:[^@\s]+@/i,
  /\b(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password)\s*[:=]\s*["']?[^\s"']{12,}/i,
];

const PROMPT_INJECTION =
  /\b(?:ignore|disregard|override|forget|bypass)\b.{0,80}\b(?:instruction|prompt|policy|rule|message|above|previous|prior|system|developer)\b|\b(?:system prompt|developer message|jailbreak|prompt injection)\b|\b(?:call|invoke|execute|run)\b.{0,40}\b(?:tool|command|instruction)\b/i;

export const replacementIntroducesUnsafeText = (
  replacements: BrainLearningExactReplacement[],
): boolean =>
  replacements.some(
    ({ replace }) =>
      SECRET_PATTERNS.some((pattern) => pattern.test(replace)) ||
      PROMPT_INJECTION.test(replace),
  );

export const previewExactReplacements = (
  content: string,
  replacements: BrainLearningExactReplacement[],
): { content: string; changed: boolean } | null => {
  let next = content;
  for (const replacement of replacements) {
    if (next.split(replacement.find).length - 1 !== 1) return null;
    next = next.replace(replacement.find, replacement.replace);
  }
  return { content: next, changed: next !== content };
};
