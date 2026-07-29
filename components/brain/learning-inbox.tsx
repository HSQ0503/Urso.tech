"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileDiff,
  FileText,
  Gauge,
  History,
  Inbox,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
  X,
} from "lucide-react";
import { brainDocHref } from "@/lib/brain/links";
import {
  AssessmentPanel,
  BatchComposer,
  BatchDetail,
  DocumentPatchPanel,
  assessmentDraftFor,
  suggestedReplacements,
  type AssessmentDraft,
  type AssessmentVerdict,
  type BatchDraft,
  type CandidateAssessment,
  type PatchPreview,
  type PatchReplacement,
} from "./learning-operations";

type LearningView = "inbox" | "batches" | "gardener" | "history";
type LearningRisk = "informational" | "low" | "material" | "critical";
type LearningStatus =
  | "detected"
  | "queued"
  | "batched"
  | "proposed"
  | "dismissed"
  | "applied"
  | "expired";
type LearningDecision = "queue" | "dismiss" | "promote";

type LearningEvidence = {
  id: string;
  role: "supporting" | "contradicting" | "superseding";
  authority: "governing" | "reference";
  path: string | null;
  title: string | null;
  sourceVersion: number;
  excerpt: string | null;
  claimId: string | null;
  contextRunId: string | null;
};

type LearningCandidate = {
  id: string;
  candidateType:
    | "new_claim"
    | "update_claim"
    | "retire_claim"
    | "resolve_conflict"
    | "stale_document"
    | "missing_knowledge"
    | "document_patch";
  proposedAction: "create" | "update" | "supersede" | "retire" | "investigate";
  title: string;
  summary: string;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  confidence: number;
  risk: LearningRisk;
  status: LearningStatus;
  proposalKind: "claim" | "document" | null;
  proposalId: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
  occurrenceCount: number;
  canReview: boolean;
  reviewBlockReason: string | null;
  canPromote: boolean;
  promotionBlockReason: string | null;
  requiresPromotionNote: boolean;
  evidence: LearningEvidence[];
  batchIds: string[];
  assessment?: CandidateAssessment | null;
  patchPreview?: PatchPreview | null;
};

type LearningBatch = {
  id: string;
  title: string;
  summary: string;
  risk: LearningRisk;
  status: string;
  departmentName: string | null;
  projectName: string | null;
  candidateCount: number;
  evidenceCount: number;
  candidateIds?: string[];
  assignedTo?: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote?: string;
  allowedTransitions?: string[];
  canTransition?: boolean;
  transitionBlockReason?: string | null;
};

type LearningRun = {
  id: string;
  sourceType: "context_run" | "approved_artifact" | "gardener";
  mode: "off" | "shadow" | "review" | "auto_low_risk";
  status: "running" | "complete" | "failed";
  candidateCount: number;
  provider: string | null;
  model: string | null;
  failureMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type GardenerFinding = {
  id: string;
  findingType:
    | "stale_document"
    | "superseded_reference"
    | "unresolved_conflict"
    | "weak_provenance"
    | "missing_knowledge";
  risk: LearningRisk;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  subjectKind: "document" | "claim" | "conflict" | "question";
  subjectKey: string;
  title: string;
  message: string;
  state: "open" | "resolved";
  occurrenceCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
  lastRunId: string;
  sources: Array<{
    kind: string;
    sourceId: string;
    sourceVersion: number | null;
  }>;
};

type LearningMetrics = {
  pendingCandidates: number | null;
  materialRiskCandidates: number | null;
  promotedCandidates: number | null;
  evidenceCoveragePercent: number | null;
  reviewedCandidates?: number | null;
  reviewedCount?: number | null;
  assessedCandidates?: number | null;
  adjudicatedCandidates?: number | null;
  adjudicatedCount?: number | null;
  strictPrecisionSampleSize?: number | null;
  actionableYieldSampleSize?: number | null;
  strictPrecisionPercent?: number | null;
  actionableYieldPercent?: number | null;
  assessmentEvidenceCoveragePercent?: number | null;
  medianDecisionHours?: number | null;
  medianDecisionMs?: number | null;
  duplicateRatePercent?: number | null;
  oldestPendingHours?: number | null;
  guardrailViolations?: number | null;
  verdictCounts?: Partial<Record<AssessmentVerdict, number>>;
  assessmentHistoryCount?: number | null;
};

type LearningResponse = {
  mode: "off" | "shadow" | "review" | "auto_low_risk" | null;
  candidates: LearningCandidate[];
  batches: LearningBatch[];
  runs: LearningRun[];
  gardenerFindings: GardenerFinding[];
  metrics: LearningMetrics;
};

const riskOrder: Record<LearningRisk, number> = {
  critical: 0,
  material: 1,
  low: 2,
  informational: 3,
};

const riskClasses: Record<LearningRisk, string> = {
  informational: "border-edge bg-raise text-ink-dim",
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  material: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  critical: "border-red-500/25 bg-red-500/10 text-red-300",
};

const views: { id: LearningView; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "batches", label: "Batches", icon: Layers3 },
  { id: "gardener", label: "Gardener", icon: Bot },
  { id: "history", label: "History", icon: History },
];

function displayDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "")
    return "No value recorded";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value, null, 2);
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function scopeLabel(candidate: LearningCandidate) {
  if (candidate.projectName) return candidate.projectName;
  if (candidate.projectId) return `Project ${candidate.projectId}`;
  if (candidate.departmentName) return candidate.departmentName;
  if (candidate.departmentId) return `Department ${candidate.departmentId}`;
  return "Organization-wide";
}

function scopeKey(candidate: LearningCandidate) {
  return `${candidate.projectId ?? ""}:${candidate.departmentId ?? ""}`;
}

function gardenerScopeLabel(finding: GardenerFinding) {
  if (finding.projectName) return finding.projectName;
  if (finding.projectId) return `Project ${finding.projectId}`;
  if (finding.departmentName) return finding.departmentName;
  if (finding.departmentId) return `Department ${finding.departmentId}`;
  return "Organization-wide";
}

function displayPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

function displayHours(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value < 1) return `${Math.max(1, Math.round(value * 60))}m`;
  if (value < 48) return `${Math.round(value)}h`;
  return `${Math.round(value / 24)}d`;
}

async function readResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? fallback);
  return body;
}

async function fetchLearningData(): Promise<LearningResponse> {
  const response = await fetch("/api/brain/learning", { cache: "no-store" });
  return readResponse<LearningResponse>(
    response,
    "Could not load the Learning inbox.",
  );
}

function RiskBadge({ risk }: { risk: LearningRisk }) {
  const Icon =
    risk === "critical" || risk === "material" ? ShieldAlert : Activity;
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${riskClasses[risk]}`}
    >
      <Icon className="size-3" />
      {risk}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Inbox;
}) {
  return (
    <article className="min-w-0 rounded-[20px] border border-edge bg-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium text-ink-dim">{label}</p>
        <Icon className="size-4 shrink-0 text-ink-dimmer" />
      </div>
      <p className="mt-4 text-[25px] font-semibold tracking-[-0.04em] text-ink">
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-ink-dimmer">{detail}</p>
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Inbox;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-[22px] border border-dashed border-edge px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-raise text-ink-dim">
          <Icon className="size-5" />
        </span>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-ink-dim">
          {description}
        </p>
      </div>
    </div>
  );
}

function CandidateDetail({
  candidate,
  mode,
  note,
  assessmentDraft,
  assessmentActing,
  patchReplacements,
  patchNote,
  patchActing,
  acting,
  onNoteChange,
  onAssessmentDraftChange,
  onAssessment,
  onPatchReplacementsChange,
  onPatchNoteChange,
  onPatchPromote,
  onDecision,
}: {
  candidate: LearningCandidate;
  mode: LearningResponse["mode"];
  note: string;
  assessmentDraft: AssessmentDraft;
  assessmentActing: boolean;
  patchReplacements: PatchReplacement[];
  patchNote: string;
  patchActing: boolean;
  acting: LearningDecision | null;
  onNoteChange: (note: string) => void;
  onAssessmentDraftChange: (draft: AssessmentDraft) => void;
  onAssessment: () => void;
  onPatchReplacementsChange: (replacements: PatchReplacement[]) => void;
  onPatchNoteChange: (note: string) => void;
  onPatchPromote: () => void;
  onDecision: (decision: LearningDecision) => void;
}) {
  const canReview = ["detected", "queued", "batched"].includes(
    candidate.status,
  );
  const dismissNeedsNote = note.trim().length === 0;
  const promoteNeedsNote =
    candidate.requiresPromotionNote && note.trim().length === 0;
  const promotionModeBlocked =
    mode === null || mode === "off" || mode === "shadow";
  const promotionModeBlockReason = promotionModeBlocked
    ? mode === "shadow"
      ? "Promotion is disabled while Learning Mode is Shadow."
      : "Promotion is disabled because controlled learning is not active."
    : null;

  return (
    <article
      aria-labelledby={`candidate-title-${candidate.id}`}
      className="min-w-0 rounded-[24px] border border-edge bg-panel"
    >
      <header className="border-b border-edge px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge risk={candidate.risk} />
          <span className="inline-flex min-h-7 items-center rounded-full border border-edge bg-raise px-2.5 text-[10px] font-medium text-ink-dim">
            {titleCase(candidate.status)}
          </span>
          <span className="inline-flex min-h-7 items-center rounded-full border border-edge bg-raise px-2.5 text-[10px] font-medium text-ink-dim">
            {scopeLabel(candidate)}
          </span>
        </div>
        <h2
          id={`candidate-title-${candidate.id}`}
          className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-ink"
        >
          {candidate.title}
        </h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-dim">
          {candidate.summary}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-dimmer">
          <div className="flex items-center gap-1.5">
            <dt>Confidence</dt>
            <dd className="font-mono text-ink-dim">
              {Math.round(candidate.confidence * 100)}%
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Observed</dt>
            <dd className="font-mono text-ink-dim">
              {candidate.occurrenceCount}×
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Action</dt>
            <dd className="font-mono text-ink-dim">
              {titleCase(candidate.proposedAction)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="space-y-7 px-5 py-6 sm:px-6">
        <section aria-labelledby={`diff-${candidate.id}`}>
          <div className="mb-3 flex items-center gap-2">
            <FileDiff className="size-4 text-orange" />
            <h3
              id={`diff-${candidate.id}`}
              className="text-[13px] font-semibold text-ink"
            >
              Current versus proposed
            </h3>
          </div>
          <div className="grid overflow-hidden rounded-[16px] border border-edge md:grid-cols-2">
            <div className="min-w-0 border-b border-edge bg-bg p-4 md:border-r md:border-b-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-dimmer">
                Current
              </p>
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-ink-dim">
                {displayValue(candidate.currentValue)}
              </pre>
            </div>
            <div className="min-w-0 bg-orange-soft p-4">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-orange">
                Proposed
              </p>
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-ink">
                {displayValue(candidate.proposedValue)}
              </pre>
            </div>
          </div>
          {candidate.currentValue === null &&
            candidate.proposedValue === null && (
              <p className="mt-2 text-[11px] leading-5 text-ink-dimmer">
                This candidate is investigative. The learning pipeline did not
                provide a value-level diff.
              </p>
            )}
        </section>

        <section aria-labelledby={`evidence-${candidate.id}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SearchCheck className="size-4 text-orange" />
              <h3
                id={`evidence-${candidate.id}`}
                className="text-[13px] font-semibold text-ink"
              >
                Evidence and provenance
              </h3>
            </div>
            <span className="font-mono text-[10px] text-ink-dimmer">
              {candidate.evidence.length} source
              {candidate.evidence.length === 1 ? "" : "s"}
            </span>
          </div>
          {candidate.evidence.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-edge px-4 py-5 text-[12px] leading-5 text-ink-dim">
              No exact evidence was attached. Promotion remains disabled until
              provenance is available.
            </div>
          ) : (
            <ul className="space-y-2">
              {candidate.evidence.map((evidence) => (
                <li
                  key={evidence.id}
                  className="rounded-[14px] border border-edge bg-bg p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <FileText className="size-4 shrink-0 text-ink-dimmer" />
                    {evidence.path ? (
                      <Link
                        href={brainDocHref(evidence.path, candidate.projectId)}
                        className="inline-flex min-h-11 min-w-0 flex-1 items-center truncate rounded-sm text-[12px] font-medium text-ink underline-offset-4 hover:text-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                      >
                        {evidence.title ?? evidence.path}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                        Authorized source
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-ink-dimmer">
                      v{evidence.sourceVersion}
                    </span>
                    <span className="rounded-full border border-edge px-2 py-0.5 text-[9px] capitalize text-ink-dim">
                      {evidence.role}
                    </span>
                    <span className="rounded-full border border-edge px-2 py-0.5 text-[9px] capitalize text-ink-dim">
                      {evidence.authority}
                    </span>
                  </div>
                  {evidence.excerpt ? (
                    <blockquote className="mt-3 border-l-2 border-orange/40 pl-3 text-[12px] leading-5 text-ink-dim">
                      {evidence.excerpt}
                    </blockquote>
                  ) : (
                    <p className="mt-3 text-[11px] text-ink-dimmer">
                      No excerpt was persisted for this evidence row.
                    </p>
                  )}
                  <p className="mt-3 truncate font-mono text-[9px] text-ink-dimmer">
                    {evidence.path ??
                      `Context run ${evidence.contextRunId ?? "not recorded"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AssessmentPanel
          candidate={candidate}
          draft={assessmentDraft}
          acting={assessmentActing}
          onDraftChange={onAssessmentDraftChange}
          onSubmit={onAssessment}
        />

        {candidate.candidateType === "document_patch" && (
          <DocumentPatchPanel
            candidate={candidate}
            mode={mode}
            replacements={patchReplacements}
            note={patchNote}
            acting={patchActing}
            onReplacementsChange={onPatchReplacementsChange}
            onNoteChange={onPatchNoteChange}
            onSubmit={onPatchPromote}
          />
        )}

        <section aria-labelledby={`review-${candidate.id}`}>
          <label
            id={`review-${candidate.id}`}
            htmlFor={`learning-note-${candidate.id}`}
            className="text-[11px] font-medium text-ink"
          >
            Steward note
          </label>
          <textarea
            id={`learning-note-${candidate.id}`}
            value={note}
            rows={3}
            maxLength={1_000}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Record the reasoning behind this review decision."
            className="mt-2 block min-h-24 w-full resize-y rounded-[14px] border border-edge bg-bg px-4 py-3 text-[13px] leading-5 text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
          />
          <p className="mt-2 text-[10px] leading-5 text-ink-dimmer">
            Promotion creates a governed proposal. It never writes directly to
            current truth.
          </p>

          {canReview ? (
            <>
              {(candidate.reviewBlockReason ||
                candidate.promotionBlockReason ||
                promotionModeBlockReason) && (
                <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-ink-dimmer">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {candidate.reviewBlockReason ??
                    candidate.promotionBlockReason ??
                    promotionModeBlockReason}
                </p>
              )}
              <div
                className={`mt-4 grid gap-2 ${
                  candidate.candidateType === "document_patch"
                    ? "sm:grid-cols-2"
                    : "sm:grid-cols-3"
                }`}
              >
                <button
                  type="button"
                  disabled={
                    acting !== null ||
                    !candidate.canReview ||
                    candidate.status !== "detected"
                  }
                  onClick={() => onDecision("queue")}
                  className="ob-btn min-h-11 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    candidate.status !== "detected"
                      ? "Only newly detected candidates can be queued"
                      : (candidate.reviewBlockReason ?? undefined)
                  }
                >
                  {acting === "queue" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                  Queue
                </button>
                <button
                  type="button"
                  disabled={
                    acting !== null || !candidate.canReview || dismissNeedsNote
                  }
                  onClick={() => onDecision("dismiss")}
                  className="ob-btn min-h-11 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    dismissNeedsNote
                      ? "Add a steward note before dismissing"
                      : undefined
                  }
                >
                  {acting === "dismiss" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                  Dismiss
                </button>
                {candidate.candidateType !== "document_patch" && (
                  <button
                    type="button"
                    disabled={
                      acting !== null ||
                      !candidate.canReview ||
                      !candidate.canPromote ||
                      promotionModeBlocked ||
                      promoteNeedsNote
                    }
                    onClick={() => onDecision("promote")}
                    className="ob-btn ob-btn-cta min-h-11 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      candidate.promotionBlockReason ??
                      promotionModeBlockReason ??
                      (promoteNeedsNote
                        ? "Material and critical promotions require a steward note"
                        : undefined)
                    }
                  >
                    {acting === "promote" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    Promote
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 flex min-h-11 items-center gap-2 rounded-[14px] border border-edge bg-raise px-4 text-[12px] text-ink-dim">
              <Check className="size-4 text-orange" />
              This candidate has already left the review queue.
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

export function LearningInbox() {
  const [data, setData] = useState<LearningResponse | null>(null);
  const [view, setView] = useState<LearningView>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assessmentDrafts, setAssessmentDrafts] = useState<
    Record<string, AssessmentDraft>
  >({});
  const [assessmentRequestIds, setAssessmentRequestIds] = useState<
    Record<string, string>
  >({});
  const [patchReplacements, setPatchReplacements] = useState<
    Record<string, PatchReplacement[]>
  >({});
  const [patchNotes, setPatchNotes] = useState<Record<string, string>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
    [],
  );
  const [batchDraft, setBatchDraft] = useState<BatchDraft>({
    title: "",
    summary: "",
    assignedTo: "",
  });
  const [batchRequestId, setBatchRequestId] = useState<string | null>(null);
  const [batchRequestPayloadKey, setBatchRequestPayloadKey] = useState<
    string | null
  >(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchNotes, setBatchNotes] = useState<Record<string, string>>({});
  const [batchAssignees, setBatchAssignees] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<{
    id: string;
    decision: LearningDecision;
  } | null>(null);
  const [assessingId, setAssessingId] = useState<string | null>(null);
  const [promotingPatchId, setPromotingPatchId] = useState<string | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [transitioningBatch, setTransitioningBatch] = useState<{
    id: string;
    transition: string;
  } | null>(null);
  const [runningContextReview, setRunningContextReview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await fetchLearningData();
      setError("");
      setData(next);
      setSelectedCandidateIds((current) =>
        current.filter((id) =>
          next.candidates.some(
            (candidate) =>
              candidate.id === id &&
              ["detected", "queued"].includes(candidate.status),
          ),
        ),
      );
      setSelectedBatchId((current) =>
        current && next.batches.some((batch) => batch.id === current)
          ? current
          : (next.batches[0]?.id ?? null),
      );
      setSelectedId((current) => {
        if (
          current &&
          next.candidates.some(
            (candidate) =>
              candidate.id === current &&
              ["detected", "queued", "batched"].includes(candidate.status),
          )
        ) {
          return current;
        }
        return (
          next.candidates.find((candidate) =>
            ["detected", "queued", "batched"].includes(candidate.status),
          )?.id ??
          next.candidates[0]?.id ??
          null
        );
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLearningData()
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setSelectedBatchId(next.batches[0]?.id ?? null);
        setSelectedId(
          next.candidates.find((candidate) =>
            ["detected", "queued", "batched"].includes(candidate.status),
          )?.id ??
            next.candidates[0]?.id ??
            null,
        );
      })
      .catch((caught) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const pendingCandidates = useMemo(
    () =>
      (data?.candidates ?? [])
        .filter((candidate) =>
          ["detected", "queued", "batched"].includes(candidate.status),
        )
        .sort(
          (left, right) =>
            riskOrder[left.risk] - riskOrder[right.risk] ||
            new Date(right.lastDetectedAt).getTime() -
              new Date(left.lastDetectedAt).getTime(),
        ),
    [data],
  );
  const historyCandidates = useMemo(
    () =>
      (data?.candidates ?? [])
        .filter(
          (candidate) =>
            !["detected", "queued", "batched"].includes(candidate.status),
        )
        .sort(
          (left, right) =>
            new Date(right.lastDetectedAt).getTime() -
            new Date(left.lastDetectedAt).getTime(),
        ),
    [data],
  );
  const selected =
    data?.candidates.find((candidate) => candidate.id === selectedId) ??
    pendingCandidates[0] ??
    null;
  const selectedForBatch = pendingCandidates.filter((candidate) =>
    selectedCandidateIds.includes(candidate.id),
  );
  const selectedScopeKey = selectedForBatch[0]
    ? scopeKey(selectedForBatch[0])
    : null;
  const selectedBatch =
    data?.batches.find((batch) => batch.id === selectedBatchId) ??
    data?.batches[0] ??
    null;
  const selectedBatchCandidates = selectedBatch
    ? (data?.candidates ?? []).filter(
        (candidate) =>
          selectedBatch.candidateIds?.includes(candidate.id) ||
          candidate.batchIds.includes(selectedBatch.id),
      )
    : [];
  const gardenerRuns = (data?.runs ?? []).filter(
    (run) => run.sourceType === "gardener",
  );
  const gardenerFindings = [...(data?.gardenerFindings ?? [])].sort(
    (left, right) =>
      Number(left.state === "resolved") - Number(right.state === "resolved") ||
      riskOrder[left.risk] - riskOrder[right.risk] ||
      new Date(right.lastDetectedAt).getTime() -
        new Date(left.lastDetectedAt).getTime(),
  );

  const handleViewKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: LearningView,
  ) => {
    const currentIndex = views.findIndex((item) => item.id === currentView);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % views.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + views.length) % views.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = views.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextView = views[nextIndex].id;
    setView(nextView);
    requestAnimationFrame(() =>
      document.getElementById(`learning-tab-${nextView}`)?.focus(),
    );
  };

  const decide = async (
    candidate: LearningCandidate,
    decision: LearningDecision,
  ) => {
    setActing({ id: candidate.id, decision });
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brain/learning", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: candidate.id,
          decision,
          note: notes[candidate.id]?.trim() || undefined,
        }),
      });
      const result = await readResponse<{ proposalId?: string | null }>(
        response,
        "Could not record the learning review.",
      );
      setNotice(
        decision === "promote"
          ? `Candidate promoted${result.proposalId ? " to a governed proposal" : ""}.`
          : decision === "dismiss"
            ? "Candidate dismissed with its review note."
            : "Candidate added to the steward queue.",
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setActing(null);
    }
  };

  const assessCandidate = async (candidate: LearningCandidate) => {
    const draft =
      assessmentDrafts[candidate.id] ?? assessmentDraftFor(candidate);
    if (!draft.verdict || !draft.reasonCode) return;
    const requestId = assessmentRequestIds[candidate.id] ?? crypto.randomUUID();
    setAssessmentRequestIds((current) => ({
      ...current,
      [candidate.id]: requestId,
    }));
    setAssessingId(candidate.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brain/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "assess_candidate",
          id: candidate.id,
          verdict: draft.verdict,
          reasonCode: draft.reasonCode,
          note: draft.note.trim() || undefined,
          requestId,
        }),
      });
      await readResponse<{ assessmentId?: string }>(
        response,
        "Could not record the candidate assessment.",
      );
      setAssessmentRequestIds((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      setNotice("Steward assessment recorded for learning calibration.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAssessingId(null);
    }
  };

  const createBatch = async () => {
    if (!selectedForBatch.length || !batchDraft.title.trim()) return;
    const requestPayloadKey = JSON.stringify({
      title: batchDraft.title.trim(),
      summary: batchDraft.summary.trim(),
      assignedTo: batchDraft.assignedTo.trim(),
      candidateIds: selectedForBatch.map((candidate) => candidate.id).sort(),
    });
    const requestId =
      batchRequestId && batchRequestPayloadKey === requestPayloadKey
        ? batchRequestId
        : crypto.randomUUID();
    setBatchRequestId(requestId);
    setBatchRequestPayloadKey(requestPayloadKey);
    setCreatingBatch(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brain/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_batch",
          title: batchDraft.title.trim(),
          summary: batchDraft.summary.trim(),
          candidateIds: selectedForBatch.map((candidate) => candidate.id),
          assignedTo: batchDraft.assignedTo.trim() || undefined,
          requestId,
        }),
      });
      const result = await readResponse<{
        batchId?: string;
        candidateCount?: number;
      }>(response, "Could not create the learning batch.");
      setSelectedCandidateIds([]);
      setBatchDraft({ title: "", summary: "", assignedTo: "" });
      setBatchRequestId(null);
      setBatchRequestPayloadKey(null);
      if (result.batchId) setSelectedBatchId(result.batchId);
      setNotice(
        `Created a governed batch with ${result.candidateCount ?? selectedForBatch.length} candidate${
          (result.candidateCount ?? selectedForBatch.length) === 1 ? "" : "s"
        }.`,
      );
      setView("batches");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreatingBatch(false);
    }
  };

  const transitionBatch = async (batch: LearningBatch, transition: string) => {
    setTransitioningBatch({ id: batch.id, transition });
    setError("");
    setNotice("");
    try {
      const note = batchNotes[batch.id]?.trim();
      const assignedTo = batchAssignees[batch.id]?.trim();
      const response = await fetch("/api/brain/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "transition_batch",
          id: batch.id,
          transition,
          note: note || undefined,
          assignedTo:
            transition === "dismiss" ? undefined : assignedTo || undefined,
        }),
      });
      await readResponse<{ status?: string }>(
        response,
        "Could not transition the learning batch.",
      );
      setNotice(`Batch transition recorded: ${titleCase(transition)}.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setTransitioningBatch(null);
    }
  };

  const promoteDocumentPatch = async (candidate: LearningCandidate) => {
    const replacements =
      patchReplacements[candidate.id] ?? suggestedReplacements(candidate);
    setPromotingPatchId(candidate.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brain/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "promote_document_patch",
          id: candidate.id,
          replacements,
          note: patchNotes[candidate.id]?.trim() ?? "",
        }),
      });
      const result = await readResponse<{
        proposalId?: string;
        targetBaseVersion?: number;
      }>(response, "Could not create the governed document-patch proposal.");
      setNotice(
        `Governed patch proposal created${
          result.proposalId ? ` (${result.proposalId.slice(0, 8)})` : ""
        }${result.targetBaseVersion ? ` against v${result.targetBaseVersion}` : ""}.`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPromotingPatchId(null);
    }
  };

  const runContextReview = async () => {
    setRunningContextReview(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brain/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review_latest_context" }),
      });
      const result = await readResponse<{
        runId: string;
        candidateCount?: number;
      }>(response, "Could not review the latest authorized Context Receipt.");
      setNotice(
        typeof result.candidateCount === "number"
          ? `Latest-context review completed with ${result.candidateCount} candidate${result.candidateCount === 1 ? "" : "s"}.`
          : `Latest-context review started (${result.runId.slice(0, 8)}).`,
      );
      setView("inbox");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunningContextReview(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-12 grid min-h-80 place-items-center rounded-[24px] border border-edge bg-panel">
        <div className="flex items-center gap-2 text-[13px] text-ink-dim">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          Loading authorized learning reviews…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-12 rounded-[24px] border border-edge bg-panel p-7">
        <div className="flex items-start gap-3 text-ink">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-orange" />
          <div>
            <h2 className="text-[15px] font-semibold">
              Learning data could not be loaded
            </h2>
            <p role="alert" className="mt-2 text-[13px] leading-6 text-ink-dim">
              {error ||
                "The server did not return a supported Learning inbox response."}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="ob-btn mt-5 min-h-11"
            >
              <RefreshCw className="size-4" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const metrics = data.metrics;
  const modeLabel = data.mode ? titleCase(data.mode) : "Not configured";
  const contextReviewEnabled = data.mode !== null && data.mode !== "off";
  const operationBusy =
    acting !== null ||
    assessingId !== null ||
    promotingPatchId !== null ||
    creatingBatch ||
    transitioningBatch !== null;
  const adjudicatedCount =
    metrics.strictPrecisionSampleSize ??
    metrics.adjudicatedCandidates ??
    metrics.adjudicatedCount ??
    metrics.reviewedCandidates ??
    null;
  const reviewedCount =
    metrics.reviewedCount ??
    metrics.assessedCandidates ??
    metrics.reviewedCandidates ??
    adjudicatedCount;
  const actionableYieldSampleSize =
    metrics.actionableYieldSampleSize ?? reviewedCount;
  const medianDecisionHours =
    metrics.medianDecisionHours ??
    (metrics.medianDecisionMs === null || metrics.medianDecisionMs === undefined
      ? null
      : metrics.medianDecisionMs / 3_600_000);

  return (
    <div className="pt-10 sm:pt-12">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Strict precision"
          value={displayPercent(metrics.strictPrecisionPercent)}
          detail={
            adjudicatedCount === null
              ? "Awaiting an adjudicated denominator"
              : `Correct outcomes · n=${adjudicatedCount}`
          }
          icon={Target}
        />
        <MetricCard
          label="Actionable yield"
          value={displayPercent(metrics.actionableYieldPercent)}
          detail={
            actionableYieldSampleSize === null
              ? "Awaiting a reviewed denominator"
              : `Correct + partial · n=${actionableYieldSampleSize}`
          }
          icon={Gauge}
        />
        <MetricCard
          label="Median decision"
          value={displayHours(medianDecisionHours)}
          detail={
            reviewedCount === null
              ? "No steward decisions measured"
              : `Detection to assessment · n=${reviewedCount}`
          }
          icon={Timer}
        />
        <MetricCard
          label="Guardrail flags"
          value={
            metrics.guardrailViolations === null ||
            metrics.guardrailViolations === undefined
              ? "—"
              : String(metrics.guardrailViolations)
          }
          detail={`Unsafe or out-of-scope verdicts · ${modeLabel}`}
          icon={ShieldAlert}
        />
      </div>

      <section
        aria-labelledby="operations-summary-title"
        className="mt-3 rounded-[20px] border border-edge bg-panel p-4 sm:p-5"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="operations-summary-title"
              className="text-[12px] font-semibold text-ink"
            >
              Learning operations
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-ink-dimmer">
              Queue health and source coverage are operational signals, not
              steward-confirmed precision.
            </p>
          </div>
          <span className="mt-2 inline-flex min-h-7 w-fit items-center rounded-full border border-edge bg-raise px-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-dim sm:mt-0">
            {modeLabel}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-[14px] bg-bg p-3">
            <dt className="flex items-center gap-2 text-[10px] text-ink-dimmer">
              <Inbox className="size-3.5" />
              Pending review
            </dt>
            <dd className="mt-2 font-mono text-[17px] text-ink">
              {metrics.pendingCandidates === null
                ? "—"
                : metrics.pendingCandidates}
            </dd>
            <p className="mt-1 text-[9px] text-ink-dimmer">
              Oldest · {displayHours(metrics.oldestPendingHours)}
            </p>
          </div>
          <div className="rounded-[14px] bg-bg p-3">
            <dt className="flex items-center gap-2 text-[10px] text-ink-dimmer">
              <Sparkles className="size-3.5" />
              Promoted
            </dt>
            <dd className="mt-2 font-mono text-[17px] text-ink">
              {metrics.promotedCandidates === null
                ? "—"
                : metrics.promotedCandidates}
            </dd>
          </div>
          <div className="rounded-[14px] bg-bg p-3">
            <dt className="flex items-center gap-2 text-[10px] text-ink-dimmer">
              <ShieldAlert className="size-3.5" />
              Material risk
            </dt>
            <dd className="mt-2 font-mono text-[17px] text-ink">
              {metrics.materialRiskCandidates === null
                ? "—"
                : metrics.materialRiskCandidates}
            </dd>
          </div>
          <div className="rounded-[14px] bg-bg p-3">
            <dt className="flex items-center gap-2 text-[10px] text-ink-dimmer">
              <SearchCheck className="size-3.5" />
              Source evidence coverage
            </dt>
            <dd className="mt-2 font-mono text-[17px] text-ink">
              {displayPercent(metrics.evidenceCoveragePercent)}
            </dd>
          </div>
          <div className="rounded-[14px] bg-bg p-3">
            <dt className="flex items-center gap-2 text-[10px] text-ink-dimmer">
              <ClipboardCheck className="size-3.5" />
              Assessed evidence coverage
            </dt>
            <dd className="mt-2 font-mono text-[17px] text-ink">
              {displayPercent(metrics.assessmentEvidenceCoveragePercent)}
            </dd>
          </div>
          <div className="rounded-[14px] bg-bg p-3">
            <dt className="flex items-center gap-2 text-[10px] text-ink-dimmer">
              <FileDiff className="size-3.5" />
              Duplicate rate
            </dt>
            <dd className="mt-2 font-mono text-[17px] text-ink">
              {displayPercent(metrics.duplicateRatePercent)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-7 flex flex-col gap-3 border-b border-edge pb-4 md:flex-row md:items-center md:justify-between">
        <div
          className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Learning views"
        >
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`learning-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={view === id}
              aria-controls="learning-panel"
              tabIndex={view === id ? 0 : -1}
              onClick={() => setView(id)}
              onKeyDown={(event) => handleViewKeyDown(event, id)}
              className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                view === id
                  ? "bg-raise text-ink"
                  : "text-ink-dim hover:bg-raise hover:text-ink"
              }`}
            >
              <Icon className="size-4" />
              {label}
              {id === "inbox" && pendingCandidates.length > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-orange-soft px-1.5 py-0.5 font-mono text-[9px] text-orange">
                  {pendingCandidates.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || runningContextReview || operationBusy}
            className="ob-btn min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runContextReview()}
            disabled={
              refreshing ||
              runningContextReview ||
              operationBusy ||
              !contextReviewEnabled
            }
            className="ob-btn ob-btn-cta min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              contextReviewEnabled
                ? "Review your latest persisted Context Receipt"
                : "Controlled learning is disabled"
            }
          >
            {runningContextReview ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Play className="size-4" />
            )}
            Review latest context
          </button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-0">
        {notice && (
          <p className="mt-4 flex items-start gap-2 rounded-[14px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[12px] leading-5 text-emerald-200">
            <Check className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-[14px] border border-orange/25 bg-orange-soft px-4 py-3 text-[12px] leading-5 text-ink"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-orange" />
            {error}
          </p>
        )}
      </div>

      <div
        id="learning-panel"
        role="tabpanel"
        aria-labelledby={`learning-tab-${view}`}
        className="mt-6"
      >
        {view === "inbox" &&
          (pendingCandidates.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Learning inbox is clear"
              description="No detected, queued, or batched candidates currently need a steward decision."
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.38fr)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
              <section
                aria-label="Learning candidates"
                className="rounded-[22px] border border-edge bg-panel p-2 lg:sticky lg:top-4"
              >
                {selectedForBatch.length > 0 && (
                  <div className="mb-2">
                    <BatchComposer
                      candidates={selectedForBatch}
                      scope={scopeLabel(selectedForBatch[0])}
                      draft={batchDraft}
                      acting={creatingBatch}
                      onDraftChange={(draft) => {
                        setBatchDraft(draft);
                        setBatchRequestId(null);
                        setBatchRequestPayloadKey(null);
                      }}
                      onCreate={() => void createBatch()}
                      onClear={() => {
                        setSelectedCandidateIds([]);
                        setBatchRequestId(null);
                        setBatchRequestPayloadKey(null);
                      }}
                    />
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="text-[10px] leading-5 text-ink-dimmer">
                    Select up to 25 candidates to batch. After the first
                    selection, candidates outside its exact project and
                    department are disabled.
                  </p>
                </div>
                <ul className="max-h-[50vh] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-220px)]">
                  {pendingCandidates.map((candidate) => {
                    const isSelectedForBatch = selectedCandidateIds.includes(
                      candidate.id,
                    );
                    const alreadyBatched = candidate.status === "batched";
                    const notReviewable = !candidate.canReview;
                    const differentScope =
                      selectedScopeKey !== null &&
                      scopeKey(candidate) !== selectedScopeKey;
                    const atLimit =
                      selectedCandidateIds.length >= 25 && !isSelectedForBatch;
                    const selectionDisabled =
                      creatingBatch ||
                      alreadyBatched ||
                      notReviewable ||
                      differentScope ||
                      atLimit;
                    const selectionReason =
                      (creatingBatch
                        ? "Batch creation is in progress"
                        : candidate.reviewBlockReason) ??
                      (alreadyBatched
                        ? "Candidate already belongs to a batch"
                        : differentScope
                          ? "Candidate is outside the selected project and department"
                          : atLimit
                            ? "A batch can contain at most 25 candidates"
                            : undefined);
                    return (
                      <li
                        key={candidate.id}
                        className="flex min-h-20 items-stretch rounded-[16px]"
                      >
                        <label
                          className={`grid w-11 shrink-0 place-items-center rounded-l-[16px] focus-within:ring-2 focus-within:ring-orange/40 ${
                            selectionDisabled
                              ? "cursor-not-allowed text-ink-dimmer opacity-45"
                              : "cursor-pointer text-orange hover:bg-raise"
                          }`}
                          title={selectionReason}
                        >
                          <input
                            type="checkbox"
                            checked={isSelectedForBatch}
                            disabled={selectionDisabled}
                            onChange={() => {
                              setSelectedCandidateIds((current) =>
                                current.includes(candidate.id)
                                  ? current.filter((id) => id !== candidate.id)
                                  : [...current, candidate.id],
                              );
                              setBatchRequestId(null);
                              setBatchRequestPayloadKey(null);
                            }}
                            className="size-4 cursor-pointer accent-orange focus-visible:outline-none disabled:cursor-not-allowed"
                            aria-label={`Select ${candidate.title} for a batch`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSelectedId(candidate.id)}
                          aria-current={
                            selected?.id === candidate.id ? "true" : undefined
                          }
                          className={`group flex min-h-20 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-r-[16px] p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                            selected?.id === candidate.id
                              ? "bg-raise"
                              : "hover:bg-raise/70"
                          }`}
                        >
                          <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-bg text-ink-dim">
                            <FileDiff className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-[12.5px] font-medium leading-5 text-ink">
                              {candidate.title}
                            </span>
                            <span className="mt-1.5 flex min-w-0 items-center gap-2 text-[10px] text-ink-dimmer">
                              <span className="capitalize">
                                {candidate.risk}
                              </span>
                              <span aria-hidden>·</span>
                              <span className="truncate">
                                {scopeLabel(candidate)}
                              </span>
                            </span>
                          </span>
                          <ChevronRight className="mt-2 size-4 shrink-0 text-ink-dimmer transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
              {selected && (
                <CandidateDetail
                  candidate={selected}
                  mode={data.mode}
                  note={notes[selected.id] ?? ""}
                  assessmentDraft={
                    assessmentDrafts[selected.id] ??
                    assessmentDraftFor(selected)
                  }
                  assessmentActing={assessingId === selected.id}
                  patchReplacements={
                    patchReplacements[selected.id] ??
                    suggestedReplacements(selected)
                  }
                  patchNote={patchNotes[selected.id] ?? ""}
                  patchActing={promotingPatchId === selected.id}
                  acting={acting?.id === selected.id ? acting.decision : null}
                  onNoteChange={(note) =>
                    setNotes((current) => ({ ...current, [selected.id]: note }))
                  }
                  onAssessmentDraftChange={(draft) => {
                    setAssessmentDrafts((current) => ({
                      ...current,
                      [selected.id]: draft,
                    }));
                    setAssessmentRequestIds((current) => {
                      const next = { ...current };
                      delete next[selected.id];
                      return next;
                    });
                  }}
                  onAssessment={() => void assessCandidate(selected)}
                  onPatchReplacementsChange={(replacements) =>
                    setPatchReplacements((current) => ({
                      ...current,
                      [selected.id]: replacements,
                    }))
                  }
                  onPatchNoteChange={(note) =>
                    setPatchNotes((current) => ({
                      ...current,
                      [selected.id]: note,
                    }))
                  }
                  onPatchPromote={() => void promoteDocumentPatch(selected)}
                  onDecision={(decision) => void decide(selected, decision)}
                />
              )}
            </div>
          ))}

        {view === "batches" &&
          (data.batches.length === 0 ? (
            <EmptyState
              icon={Layers3}
              title="No learning batches"
              description="Related learning candidates will appear here after the governed batching workflow groups them."
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.38fr)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
              <section
                aria-label="Learning batches"
                className="rounded-[22px] border border-edge bg-panel p-2 lg:sticky lg:top-4"
              >
                <ul className="max-h-[50vh] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-220px)]">
                  {data.batches.map((batch) => (
                    <li key={batch.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedBatchId(batch.id)}
                        aria-current={
                          selectedBatch?.id === batch.id ? "true" : undefined
                        }
                        className={`group flex min-h-20 w-full cursor-pointer items-start gap-3 rounded-[16px] p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                          selectedBatch?.id === batch.id
                            ? "bg-raise"
                            : "hover:bg-raise/70"
                        }`}
                      >
                        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-bg text-ink-dim">
                          <Layers3 className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[12.5px] font-medium leading-5 text-ink">
                            {batch.title}
                          </span>
                          <span className="mt-1.5 flex min-w-0 items-center gap-2 text-[10px] text-ink-dimmer">
                            <span>{batch.candidateCount} candidates</span>
                            <span aria-hidden>·</span>
                            <span className="capitalize">
                              {titleCase(batch.status)}
                            </span>
                          </span>
                        </span>
                        <ChevronRight className="mt-2 size-4 shrink-0 text-ink-dimmer transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              {selectedBatch && (
                <BatchDetail
                  batch={selectedBatch}
                  candidates={selectedBatchCandidates.map((candidate) => ({
                    id: candidate.id,
                    title: candidate.title,
                    risk: candidate.risk,
                    status: candidate.status,
                    evidenceCount: candidate.evidence.length,
                    assessment: candidate.assessment,
                  }))}
                  note={
                    batchNotes[selectedBatch.id] ??
                    selectedBatch.reviewNote ??
                    ""
                  }
                  assignedTo={
                    batchAssignees[selectedBatch.id] ??
                    selectedBatch.assignedTo ??
                    ""
                  }
                  acting={
                    transitioningBatch?.id === selectedBatch.id
                      ? transitioningBatch.transition
                      : null
                  }
                  onNoteChange={(note) =>
                    setBatchNotes((current) => ({
                      ...current,
                      [selectedBatch.id]: note,
                    }))
                  }
                  onAssignedToChange={(assignedTo) =>
                    setBatchAssignees((current) => ({
                      ...current,
                      [selectedBatch.id]: assignedTo,
                    }))
                  }
                  onTransition={(transition) =>
                    void transitionBatch(selectedBatch, transition)
                  }
                />
              )}
            </div>
          ))}

        {view === "gardener" &&
          (gardenerRuns.length === 0 && gardenerFindings.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No gardener runs recorded"
              description="Scheduled gardener scans will appear here when that source pipeline records them. The manual action above reviews only your latest authorized Context Receipt."
            />
          ) : (
            <div className="space-y-4">
              {gardenerFindings.length > 0 && (
                <section
                  aria-labelledby="gardener-findings-title"
                  className="overflow-hidden rounded-[22px] border border-edge bg-panel"
                >
                  <header className="flex flex-col gap-2 border-b border-edge px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <h2
                        id="gardener-findings-title"
                        className="text-[13px] font-semibold text-ink"
                      >
                        Maintenance findings
                      </h2>
                      <p className="mt-1 text-[11px] leading-5 text-ink-dimmer">
                        Deterministic observations only. Gardener findings
                        cannot write or propose truth.
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-ink-dimmer">
                      {
                        gardenerFindings.filter(
                          (finding) => finding.state === "open",
                        ).length
                      }{" "}
                      open
                    </span>
                  </header>
                  <ul className="divide-y divide-edge">
                    {gardenerFindings.map((finding) => (
                      <li key={finding.id} className="p-5 sm:px-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <RiskBadge risk={finding.risk} />
                              <span className="rounded-full border border-edge bg-raise px-2.5 py-1 text-[9px] capitalize text-ink-dim">
                                {finding.state}
                              </span>
                              <span className="text-[10px] text-ink-dimmer">
                                {gardenerScopeLabel(finding)}
                              </span>
                            </div>
                            <h3 className="mt-3 text-[14px] font-semibold text-ink">
                              {finding.title}
                            </h3>
                            <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-ink-dim">
                              {finding.message}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-ink-dimmer">
                              <span>{titleCase(finding.findingType)}</span>
                              <span>Observed {finding.occurrenceCount}×</span>
                              <span>
                                Last seen {displayDate(finding.lastDetectedAt)}
                              </span>
                            </div>
                          </div>
                          <div className="min-w-0 rounded-[14px] border border-edge bg-bg px-4 py-3 lg:w-80">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-dimmer">
                              Exact source snapshot
                            </p>
                            {finding.sources.length ? (
                              <ul className="mt-2 space-y-2">
                                {finding.sources.map((source) => (
                                  <li
                                    key={`${source.kind}:${source.sourceId}`}
                                    className="min-w-0"
                                  >
                                    <p className="truncate text-[10px] text-ink-dim">
                                      {titleCase(source.kind)}
                                      {source.sourceVersion === null
                                        ? ""
                                        : ` · v${source.sourceVersion}`}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[9px] text-ink-dimmer">
                                      {source.sourceId}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-[10px] leading-5 text-ink-dimmer">
                                No source snapshot was returned for this
                                finding.
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {gardenerRuns.length > 0 && (
                <section
                  aria-labelledby="gardener-runs-title"
                  className="overflow-hidden rounded-[22px] border border-edge bg-panel"
                >
                  <header className="border-b border-edge px-5 py-4 sm:px-6">
                    <h2
                      id="gardener-runs-title"
                      className="text-[13px] font-semibold text-ink"
                    >
                      Scheduled runs
                    </h2>
                  </header>
                  <ul className="divide-y divide-edge">
                    {gardenerRuns.map((run) => (
                      <li
                        key={run.id}
                        className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raise text-ink-dim">
                            {run.status === "running" ? (
                              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                            ) : run.status === "failed" ? (
                              <CircleAlert className="size-4 text-orange" />
                            ) : (
                              <Bot className="size-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-[13px] font-medium text-ink">
                              {titleCase(run.mode)} gardener scan
                            </h3>
                            <p className="mt-1 text-[11px] text-ink-dimmer">
                              {displayDate(run.startedAt)} · Deterministic
                              detector
                            </p>
                            {run.failureMessage && (
                              <p className="mt-2 text-[11px] leading-5 text-orange">
                                {run.failureMessage}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pl-13 sm:pl-0">
                          <span className="font-mono text-[11px] text-ink-dim">
                            {run.candidateCount} finding
                            {run.candidateCount === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-full border border-edge px-2.5 py-1 text-[9px] capitalize text-ink-dimmer">
                            {run.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ))}

        {view === "history" &&
          (historyCandidates.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No review history"
              description="Promoted, dismissed, applied, and expired learning candidates will appear here with their durable status."
            />
          ) : (
            <section
              aria-label="Learning review history"
              className="overflow-hidden rounded-[22px] border border-edge bg-panel"
            >
              <ul className="divide-y divide-edge">
                {historyCandidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-dimmer">
                          {titleCase(candidate.status)}
                        </span>
                        <span className="text-[10px] text-ink-dimmer">
                          {scopeLabel(candidate)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[13px] font-medium text-ink">
                        {candidate.title}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-dimmer">
                        Last observed {displayDate(candidate.lastDetectedAt)}
                      </p>
                      {candidate.reviewedAt && (
                        <p className="mt-1 text-[10px] text-ink-dimmer">
                          Reviewed {displayDate(candidate.reviewedAt)}
                        </p>
                      )}
                      {candidate.reviewNote && (
                        <p className="mt-2 line-clamp-2 max-w-2xl text-[11px] leading-5 text-ink-dim">
                          {candidate.reviewNote}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {candidate.assessment && (
                        <span className="inline-flex min-h-7 items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[9px] font-medium text-emerald-200">
                          {titleCase(candidate.assessment.verdict)}
                        </span>
                      )}
                      <RiskBadge risk={candidate.risk} />
                      {candidate.proposalId && (
                        <span className="font-mono text-[9px] text-ink-dimmer">
                          Proposal {candidate.proposalId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
