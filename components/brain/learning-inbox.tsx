"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileDiff,
  FileText,
  History,
  Inbox,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { brainDocHref } from "@/lib/brain/links";

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
  createdAt: string;
  reviewedAt: string | null;
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

type LearningMetrics = {
  pendingCandidates: number | null;
  materialRiskCandidates: number | null;
  promotedCandidates: number | null;
  evidenceCoveragePercent: number | null;
};

type LearningResponse = {
  mode: "off" | "shadow" | "review" | "auto_low_risk" | null;
  candidates: LearningCandidate[];
  batches: LearningBatch[];
  runs: LearningRun[];
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
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "No value recorded";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function scopeLabel(candidate: LearningCandidate) {
  if (candidate.projectName) return candidate.projectName;
  if (candidate.projectId) return `Project ${candidate.projectId}`;
  if (candidate.departmentName) return candidate.departmentName;
  if (candidate.departmentId) return `Department ${candidate.departmentId}`;
  return "Organization-wide";
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? fallback);
  return body;
}

async function fetchLearningData(): Promise<LearningResponse> {
  const response = await fetch("/api/brain/learning", { cache: "no-store" });
  return readResponse<LearningResponse>(response, "Could not load the Learning inbox.");
}

function RiskBadge({ risk }: { risk: LearningRisk }) {
  const Icon = risk === "critical" || risk === "material" ? ShieldAlert : Activity;
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
      <p className="mt-4 text-[25px] font-semibold tracking-[-0.04em] text-ink">{value}</p>
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
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-ink-dim">{description}</p>
      </div>
    </div>
  );
}

function CandidateDetail({
  candidate,
  note,
  acting,
  onNoteChange,
  onDecision,
}: {
  candidate: LearningCandidate;
  note: string;
  acting: LearningDecision | null;
  onNoteChange: (note: string) => void;
  onDecision: (decision: LearningDecision) => void;
}) {
  const canReview = ["detected", "queued", "batched"].includes(candidate.status);
  const dismissNeedsNote = note.trim().length === 0;
  const promoteNeedsNote = candidate.requiresPromotionNote && note.trim().length === 0;

  return (
    <article aria-labelledby={`candidate-title-${candidate.id}`} className="min-w-0 rounded-[24px] border border-edge bg-panel">
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
        <h2 id={`candidate-title-${candidate.id}`} className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-ink">
          {candidate.title}
        </h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-dim">{candidate.summary}</p>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-dimmer">
          <div className="flex items-center gap-1.5">
            <dt>Confidence</dt>
            <dd className="font-mono text-ink-dim">{Math.round(candidate.confidence * 100)}%</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Observed</dt>
            <dd className="font-mono text-ink-dim">{candidate.occurrenceCount}×</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Action</dt>
            <dd className="font-mono text-ink-dim">{titleCase(candidate.proposedAction)}</dd>
          </div>
        </dl>
      </header>

      <div className="space-y-7 px-5 py-6 sm:px-6">
        <section aria-labelledby={`diff-${candidate.id}`}>
          <div className="mb-3 flex items-center gap-2">
            <FileDiff className="size-4 text-orange" />
            <h3 id={`diff-${candidate.id}`} className="text-[13px] font-semibold text-ink">
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
          {candidate.currentValue === null && candidate.proposedValue === null && (
            <p className="mt-2 text-[11px] leading-5 text-ink-dimmer">
              This candidate is investigative. The learning pipeline did not provide a value-level diff.
            </p>
          )}
        </section>

        <section aria-labelledby={`evidence-${candidate.id}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SearchCheck className="size-4 text-orange" />
              <h3 id={`evidence-${candidate.id}`} className="text-[13px] font-semibold text-ink">
                Evidence and provenance
              </h3>
            </div>
            <span className="font-mono text-[10px] text-ink-dimmer">
              {candidate.evidence.length} source{candidate.evidence.length === 1 ? "" : "s"}
            </span>
          </div>
          {candidate.evidence.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-edge px-4 py-5 text-[12px] leading-5 text-ink-dim">
              No exact evidence was attached. Promotion remains disabled until provenance is available.
            </div>
          ) : (
            <ul className="space-y-2">
              {candidate.evidence.map((evidence) => (
                <li key={evidence.id} className="rounded-[14px] border border-edge bg-bg p-4">
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
                    <span className="font-mono text-[9px] text-ink-dimmer">v{evidence.sourceVersion}</span>
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
                    <p className="mt-3 text-[11px] text-ink-dimmer">No excerpt was persisted for this evidence row.</p>
                  )}
                  <p className="mt-3 truncate font-mono text-[9px] text-ink-dimmer">
                    {evidence.path ?? `Context run ${evidence.contextRunId ?? "not recorded"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

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
            Promotion creates a governed proposal. It never writes directly to current truth.
          </p>

          {canReview ? (
            <>
              {(candidate.reviewBlockReason || candidate.promotionBlockReason) && (
                <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-ink-dimmer">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {candidate.reviewBlockReason ?? candidate.promotionBlockReason}
                </p>
              )}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={acting !== null || !candidate.canReview || candidate.status !== "detected"}
                onClick={() => onDecision("queue")}
                className="ob-btn min-h-11 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
                title={candidate.status !== "detected" ? "Only newly detected candidates can be queued" : candidate.reviewBlockReason ?? undefined}
              >
                {acting === "queue" ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
                Queue
              </button>
              <button
                type="button"
                disabled={acting !== null || !candidate.canReview || dismissNeedsNote}
                onClick={() => onDecision("dismiss")}
                className="ob-btn min-h-11 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
                title={dismissNeedsNote ? "Add a steward note before dismissing" : undefined}
              >
                {acting === "dismiss" ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}
                Dismiss
              </button>
              <button
                type="button"
                disabled={
                  acting !== null ||
                  !candidate.canReview ||
                  !candidate.canPromote ||
                  promoteNeedsNote
                }
                onClick={() => onDecision("promote")}
                className="ob-btn ob-btn-cta min-h-11 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  candidate.promotionBlockReason ??
                  (promoteNeedsNote ? "Material and critical promotions require a steward note" : undefined)
                }
              >
                {acting === "promote" ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Promote
              </button>
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<{ id: string; decision: LearningDecision } | null>(null);
  const [runningContextReview, setRunningContextReview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await fetchLearningData();
      setError("");
      setData(next);
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
        return next.candidates.find((candidate) => ["detected", "queued", "batched"].includes(candidate.status))?.id ??
          next.candidates[0]?.id ??
          null;
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
        setSelectedId(
          next.candidates.find((candidate) =>
            ["detected", "queued", "batched"].includes(candidate.status),
          )?.id ??
            next.candidates[0]?.id ??
            null,
        );
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
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
        .filter((candidate) => ["detected", "queued", "batched"].includes(candidate.status))
        .sort(
          (left, right) =>
            riskOrder[left.risk] - riskOrder[right.risk] ||
            new Date(right.lastDetectedAt).getTime() - new Date(left.lastDetectedAt).getTime(),
        ),
    [data],
  );
  const historyCandidates = useMemo(
    () =>
      (data?.candidates ?? [])
        .filter((candidate) => !["detected", "queued", "batched"].includes(candidate.status))
        .sort((left, right) => new Date(right.lastDetectedAt).getTime() - new Date(left.lastDetectedAt).getTime()),
    [data],
  );
  const selected = data?.candidates.find((candidate) => candidate.id === selectedId) ?? pendingCandidates[0] ?? null;
  const gardenerRuns = (data?.runs ?? []).filter((run) => run.sourceType === "gardener");

  const decide = async (candidate: LearningCandidate, decision: LearningDecision) => {
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
      const result = await readResponse<{ runId: string; candidateCount?: number }>(
        response,
        "Could not review the latest authorized Context Receipt.",
      );
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
            <h2 className="text-[15px] font-semibold">Learning data could not be loaded</h2>
            <p role="alert" className="mt-2 text-[13px] leading-6 text-ink-dim">
              {error || "The server did not return a supported Learning inbox response."}
            </p>
            <button type="button" onClick={() => void load()} className="ob-btn mt-5 min-h-11">
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

  return (
    <div className="pt-10 sm:pt-12">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending review"
          value={metrics.pendingCandidates === null ? "—" : String(metrics.pendingCandidates)}
          detail="Detected, queued, or batched"
          icon={Inbox}
        />
        <MetricCard
          label="Material risk"
          value={metrics.materialRiskCandidates === null ? "—" : String(metrics.materialRiskCandidates)}
          detail="Material and critical candidates"
          icon={ShieldAlert}
        />
        <MetricCard
          label="Promoted"
          value={metrics.promotedCandidates === null ? "—" : String(metrics.promotedCandidates)}
          detail="Moved into governed proposals"
          icon={Sparkles}
        />
        <MetricCard
          label="Evidence coverage"
          value={
            metrics.evidenceCoveragePercent === null
              ? "—"
              : `${Math.round(metrics.evidenceCoveragePercent)}%`
          }
          detail={`Learning mode · ${modeLabel}`}
          icon={SearchCheck}
        />
      </div>

      <div className="mt-7 flex flex-col gap-3 border-b border-edge pb-4 md:flex-row md:items-center md:justify-between">
        <div className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Learning views">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                view === id ? "bg-raise text-ink" : "text-ink-dim hover:bg-raise hover:text-ink"
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
            disabled={refreshing || runningContextReview}
            className="ob-btn min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runContextReview()}
            disabled={refreshing || runningContextReview || !contextReviewEnabled}
            className="ob-btn ob-btn-cta min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              contextReviewEnabled
                ? "Review your latest persisted Context Receipt"
                : "Controlled learning is disabled"
            }
          >
            {runningContextReview ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Play className="size-4" />}
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
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-[14px] border border-orange/25 bg-orange-soft px-4 py-3 text-[12px] leading-5 text-ink">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-orange" />
            {error}
          </p>
        )}
      </div>

      <div className="mt-6">
        {view === "inbox" && (
          pendingCandidates.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Learning inbox is clear"
              description="No detected, queued, or batched candidates currently need a steward decision."
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.38fr)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
              <section aria-label="Learning candidates" className="rounded-[22px] border border-edge bg-panel p-2 lg:sticky lg:top-4">
                <ul className="max-h-none space-y-1 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
                  {pendingCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(candidate.id)}
                        aria-current={selected?.id === candidate.id ? "true" : undefined}
                        className={`group flex min-h-20 w-full cursor-pointer items-start gap-3 rounded-[16px] p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                          selected?.id === candidate.id ? "bg-raise" : "hover:bg-raise/70"
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
                            <span className="capitalize">{candidate.risk}</span>
                            <span aria-hidden>·</span>
                            <span className="truncate">{scopeLabel(candidate)}</span>
                          </span>
                        </span>
                        <ChevronRight className="mt-2 size-4 shrink-0 text-ink-dimmer transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              {selected && (
                <CandidateDetail
                  candidate={selected}
                  note={notes[selected.id] ?? ""}
                  acting={acting?.id === selected.id ? acting.decision : null}
                  onNoteChange={(note) => setNotes((current) => ({ ...current, [selected.id]: note }))}
                  onDecision={(decision) => void decide(selected, decision)}
                />
              )}
            </div>
          )
        )}

        {view === "batches" && (
          data.batches.length === 0 ? (
            <EmptyState
              icon={Layers3}
              title="No learning batches"
              description="Related learning candidates will appear here after the governed batching workflow groups them."
            />
          ) : (
            <section aria-label="Learning batches" className="overflow-hidden rounded-[22px] border border-edge bg-panel">
              <ul className="divide-y divide-edge">
                {data.batches.map((batch) => (
                  <li key={batch.id} className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <RiskBadge risk={batch.risk} />
                          <span className="text-[10px] capitalize text-ink-dimmer">{batch.status}</span>
                        </div>
                        <h2 className="mt-3 text-[15px] font-semibold text-ink">{batch.title}</h2>
                        <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-ink-dim">{batch.summary}</p>
                        <p className="mt-3 text-[10px] text-ink-dimmer">
                          {batch.projectName ?? batch.departmentName ?? "Organization-wide"} · Created {displayDate(batch.createdAt)}
                        </p>
                      </div>
                      <dl className="grid shrink-0 grid-cols-2 gap-2">
                        <div className="min-w-24 rounded-[14px] bg-bg p-3">
                          <dt className="text-[9px] uppercase tracking-[0.08em] text-ink-dimmer">Candidates</dt>
                          <dd className="mt-1 font-mono text-[16px] text-ink">{batch.candidateCount}</dd>
                        </div>
                        <div className="min-w-24 rounded-[14px] bg-bg p-3">
                          <dt className="text-[9px] uppercase tracking-[0.08em] text-ink-dimmer">Evidence</dt>
                          <dd className="mt-1 font-mono text-[16px] text-ink">{batch.evidenceCount}</dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        {view === "gardener" && (
          gardenerRuns.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No gardener runs recorded"
              description="Scheduled gardener scans will appear here when that source pipeline records them. The manual action above reviews only your latest authorized Context Receipt."
            />
          ) : (
            <section aria-label="Gardener runs" className="overflow-hidden rounded-[22px] border border-edge bg-panel">
              <ul className="divide-y divide-edge">
                {gardenerRuns.map((run) => (
                  <li key={run.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
                        <h2 className="text-[13px] font-medium text-ink">
                          {titleCase(run.mode)} gardener review
                        </h2>
                        <p className="mt-1 text-[11px] text-ink-dimmer">
                          {displayDate(run.startedAt)} · {run.provider && run.model ? `${run.provider} / ${run.model}` : "Model not recorded"}
                        </p>
                        {run.failureMessage && (
                          <p className="mt-2 text-[11px] leading-5 text-orange">{run.failureMessage}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-13 sm:pl-0">
                      <span className="font-mono text-[11px] text-ink-dim">
                        {run.candidateCount} candidate{run.candidateCount === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full border border-edge px-2.5 py-1 text-[9px] capitalize text-ink-dimmer">
                        {run.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        {view === "history" && (
          historyCandidates.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No review history"
              description="Promoted, dismissed, applied, and expired learning candidates will appear here with their durable status."
            />
          ) : (
            <section aria-label="Learning review history" className="overflow-hidden rounded-[22px] border border-edge bg-panel">
              <ul className="divide-y divide-edge">
                {historyCandidates.map((candidate) => (
                  <li key={candidate.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-dimmer">
                          {titleCase(candidate.status)}
                        </span>
                        <span className="text-[10px] text-ink-dimmer">{scopeLabel(candidate)}</span>
                      </div>
                      <p className="mt-1.5 truncate text-[13px] font-medium text-ink">{candidate.title}</p>
                      <p className="mt-1 text-[10px] text-ink-dimmer">Last observed {displayDate(candidate.lastDetectedAt)}</p>
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
          )
        )}
      </div>
    </div>
  );
}
