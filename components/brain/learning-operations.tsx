import {
  Activity,
  ArrowRight,
  Ban,
  Check,
  CircleAlert,
  ClipboardCheck,
  FileDiff,
  LoaderCircle,
  Minus,
  PencilLine,
  Play,
  Plus,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";

export type AssessmentVerdict =
  | "correct"
  | "partially_correct"
  | "incorrect"
  | "duplicate"
  | "insufficient_evidence"
  | "out_of_scope"
  | "unsafe";

export type AssessmentReason =
  | "accepted"
  | "needs_correction"
  | "duplicate"
  | "insufficient_evidence"
  | "out_of_scope"
  | "unsafe"
  | "other";

export type CandidateAssessment = {
  id: string;
  verdict: AssessmentVerdict;
  reasonCode: string;
  note: string;
  assessedAt: string;
  assessedBy: string | null;
};

export type PatchReplacement = {
  find: string;
  replace: string;
};

export type PatchPreview = {
  targetDocId: string | null;
  targetPath: string | null;
  targetTitle: string | null;
  targetBaseVersion: number | null;
  currentVersion: number | null;
  baseContentHash: string | null;
  baseContent: string | null;
  isStale: boolean;
  canPromote: boolean;
  blockReason: string | null;
  replacements?: PatchReplacement[];
};

export type AssessmentDraft = {
  verdict: AssessmentVerdict | "";
  reasonCode: AssessmentReason | "";
  note: string;
};

export type BatchDraft = {
  title: string;
  summary: string;
  assignedTo: string;
};

type LearningRisk = "informational" | "low" | "material" | "critical";
type LearningMode = "off" | "shadow" | "review" | "auto_low_risk" | null;

type AssessmentCandidate = {
  id: string;
  canReview: boolean;
  reviewBlockReason: string | null;
  assessment?: CandidateAssessment | null;
};

type PatchCandidate = {
  id: string;
  risk: LearningRisk;
  canPromote: boolean;
  promotionBlockReason: string | null;
  patchPreview?: PatchPreview | null;
};

type BatchCandidate = {
  id: string;
  title: string;
  risk: LearningRisk;
  status: string;
  evidenceCount: number;
  assessment?: CandidateAssessment | null;
};

type BatchSummary = {
  id: string;
  title: string;
  summary: string;
  risk: LearningRisk;
  status: string;
  projectName: string | null;
  departmentName: string | null;
  assignedTo?: string | null;
  createdAt: string;
  reviewNote?: string;
  allowedTransitions?: string[];
  canTransition?: boolean;
  transitionBlockReason?: string | null;
};

const verdictOptions: { value: AssessmentVerdict; label: string }[] = [
  { value: "correct", label: "Correct" },
  { value: "partially_correct", label: "Partially correct" },
  { value: "incorrect", label: "Incorrect" },
  { value: "duplicate", label: "Duplicate" },
  { value: "insufficient_evidence", label: "Insufficient evidence" },
  { value: "out_of_scope", label: "Out of scope" },
  { value: "unsafe", label: "Unsafe" },
];

const reasonOptions: { value: AssessmentReason; label: string }[] = [
  { value: "accepted", label: "Accepted as proposed" },
  { value: "needs_correction", label: "Needs a correction" },
  { value: "duplicate", label: "Duplicate knowledge" },
  { value: "insufficient_evidence", label: "Insufficient evidence" },
  { value: "out_of_scope", label: "Outside this scope" },
  { value: "unsafe", label: "Unsafe to promote" },
  { value: "other", label: "Other" },
];

function reasonsForVerdict(
  verdict: AssessmentVerdict | "",
): AssessmentReason[] {
  if (verdict === "correct") return ["accepted"];
  if (verdict === "partially_correct") return ["needs_correction"];
  if (verdict === "incorrect") return ["needs_correction", "other"];
  if (verdict === "duplicate") return ["duplicate"];
  if (verdict === "insufficient_evidence") return ["insufficient_evidence"];
  if (verdict === "out_of_scope") return ["out_of_scope"];
  if (verdict === "unsafe") return ["unsafe"];
  return [];
}

const riskClasses: Record<LearningRisk, string> = {
  informational: "border-edge bg-raise text-ink-dim",
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  material: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  critical: "border-red-500/25 bg-red-500/10 text-red-300",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

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

export function assessmentDraftFor(
  candidate: AssessmentCandidate,
): AssessmentDraft {
  const supportedReasons: AssessmentReason[] = [
    "accepted",
    "needs_correction",
    "duplicate",
    "insufficient_evidence",
    "out_of_scope",
    "unsafe",
    "other",
  ];
  const reason = candidate.assessment?.reasonCode;
  return {
    verdict: candidate.assessment?.verdict ?? "",
    reasonCode:
      reason && supportedReasons.includes(reason as AssessmentReason)
        ? (reason as AssessmentReason)
        : "",
    note: candidate.assessment?.note ?? "",
  };
}

export function suggestedReplacements(candidate: {
  patchPreview?: PatchPreview | null;
  proposedValue: unknown;
}): PatchReplacement[] {
  if (candidate.patchPreview?.replacements?.length) {
    return candidate.patchPreview.replacements
      .slice(0, 10)
      .map((operation) => ({
        find: operation.find,
        replace: operation.replace,
      }));
  }
  const proposed = candidate.proposedValue;
  if (
    typeof proposed === "object" &&
    proposed !== null &&
    "replacements" in proposed
  ) {
    const replacements = (proposed as { replacements?: unknown }).replacements;
    if (Array.isArray(replacements)) {
      const valid = replacements
        .filter(
          (operation): operation is Record<string, unknown> =>
            typeof operation === "object" && operation !== null,
        )
        .map((operation) => ({
          find: typeof operation.find === "string" ? operation.find : "",
          replace:
            typeof operation.replace === "string"
              ? operation.replace
              : typeof operation.replaceWith === "string"
                ? operation.replaceWith
                : "",
        }))
        .slice(0, 10);
      if (valid.length) return valid;
    }
  }
  return [{ find: "", replace: "" }];
}

function previewPatch(baseContent: string, replacements: PatchReplacement[]) {
  let content = baseContent;
  const issues: string[] = [];
  const findValues = replacements
    .map((operation) => operation.find)
    .filter(Boolean);
  if (new Set(findValues).size !== findValues.length) {
    issues.push("Each operation must find different exact text.");
  }
  const patchSize = replacements.reduce(
    (total, operation) =>
      total + operation.find.length + operation.replace.length,
    0,
  );
  if (patchSize > 32_000) {
    issues.push("Combined patch text must stay within 32,000 characters.");
  }
  replacements.forEach((operation, index) => {
    if (operation.find.length > 8_000 || operation.replace.length > 8_000) {
      issues.push(
        `Operation ${index + 1} exceeds the 8,000-character field limit.`,
      );
      return;
    }
    if (!operation.find) {
      issues.push(`Operation ${index + 1} needs exact text to find.`);
      return;
    }
    if (operation.find === operation.replace) {
      issues.push(`Operation ${index + 1} does not change the document.`);
      return;
    }
    const occurrences = content.split(operation.find).length - 1;
    if (occurrences !== 1) {
      issues.push(
        `Operation ${index + 1} matches ${occurrences} places; exact patches require one match.`,
      );
      return;
    }
    content = content.replace(operation.find, operation.replace);
  });
  if (issues.length === 0 && content === baseContent) {
    issues.push("Combined operations leave the document unchanged.");
  }
  return { content, issues };
}

export function AssessmentPanel({
  candidate,
  draft,
  acting,
  onDraftChange,
  onSubmit,
}: {
  candidate: AssessmentCandidate;
  draft: AssessmentDraft;
  acting: boolean;
  onDraftChange: (draft: AssessmentDraft) => void;
  onSubmit: () => void;
}) {
  const existing = candidate.assessment;
  const canAssess = candidate.canReview;
  const validReasons = reasonsForVerdict(draft.verdict);
  const reasonIsValid =
    draft.reasonCode !== "" && validReasons.includes(draft.reasonCode);
  const ready =
    Boolean(draft.verdict) &&
    reasonIsValid &&
    (draft.reasonCode !== "other" || draft.note.trim().length > 0);
  return (
    <section
      aria-labelledby={`assessment-${candidate.id}`}
      className="rounded-[18px] border border-edge bg-bg p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raise text-orange">
          <ClipboardCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={`assessment-${candidate.id}`}
            className="text-[13px] font-semibold text-ink"
          >
            Steward assessment
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-ink-dimmer">
            Quality feedback measures learning precision. It does not approve or
            change knowledge.
          </p>
        </div>
      </div>
      {existing ? (
        <div className="mt-4 rounded-[14px] border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-emerald-200">
              {titleCase(existing.verdict)}
            </span>
            <span className="text-[10px] text-emerald-200/70">
              {titleCase(existing.reasonCode)}
            </span>
          </div>
          {existing.note && (
            <p className="mt-2 text-[11px] leading-5 text-emerald-100/80">
              {existing.note}
            </p>
          )}
          <p className="mt-2 font-mono text-[9px] text-emerald-200/60">
            Recorded {displayDate(existing.assessedAt)}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-medium text-ink">
              Verdict
              <select
                value={draft.verdict}
                disabled={!canAssess || acting}
                onChange={(event) => {
                  const verdict = event.target.value as AssessmentVerdict | "";
                  const nextReasons = reasonsForVerdict(verdict);
                  onDraftChange({
                    ...draft,
                    verdict,
                    reasonCode:
                      nextReasons.length === 1
                        ? nextReasons[0]
                        : nextReasons.includes(
                              draft.reasonCode as AssessmentReason,
                            )
                          ? draft.reasonCode
                          : "",
                  });
                }}
                className="mt-2 block min-h-11 w-full cursor-pointer rounded-[12px] border border-edge bg-panel px-3 text-[13px] text-ink focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
              >
                <option value="">Choose a verdict</option>
                {verdictOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-medium text-ink">
              Reason
              <select
                value={draft.reasonCode}
                disabled={!canAssess || acting}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    reasonCode: event.target.value as AssessmentReason | "",
                  })
                }
                className="mt-2 block min-h-11 w-full cursor-pointer rounded-[12px] border border-edge bg-panel px-3 text-[13px] text-ink focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
              >
                <option value="">Choose a reason</option>
                {reasonOptions
                  .filter((option) => validReasons.includes(option.value))
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label
            htmlFor={`assessment-note-${candidate.id}`}
            className="mt-3 block text-[11px] font-medium text-ink"
          >
            Assessment note{" "}
            <span className="font-normal text-ink-dimmer">
              {draft.reasonCode === "other" ? "(required)" : "(optional)"}
            </span>
          </label>
          <textarea
            id={`assessment-note-${candidate.id}`}
            value={draft.note}
            rows={2}
            maxLength={1_000}
            disabled={!canAssess || acting}
            onChange={(event) =>
              onDraftChange({ ...draft, note: event.target.value })
            }
            placeholder="Add context that will help calibrate future detection."
            className="mt-2 block min-h-20 w-full resize-y rounded-[12px] border border-edge bg-panel px-3 py-3 text-[13px] leading-5 text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
          />
          <button
            type="button"
            disabled={acting || !ready || !canAssess}
            onClick={onSubmit}
            className="ob-btn mt-3 min-h-11 w-full justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            title={ready ? undefined : "Choose both a verdict and a reason"}
          >
            {acting ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
            Record assessment
          </button>
          {!canAssess && candidate.reviewBlockReason && (
            <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-ink-dim">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-orange" />
              {candidate.reviewBlockReason}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function DocumentPatchPanel({
  candidate,
  mode,
  replacements,
  note,
  acting,
  onReplacementsChange,
  onNoteChange,
  onSubmit,
}: {
  candidate: PatchCandidate;
  mode: LearningMode;
  replacements: PatchReplacement[];
  note: string;
  acting: boolean;
  onReplacementsChange: (replacements: PatchReplacement[]) => void;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
}) {
  const preview = candidate.patchPreview;
  const patchIntent = preview
    ? previewPatch(preview.baseContent ?? "", replacements)
    : null;
  const shadowBlocked = mode === "shadow" || mode === "off" || mode === null;
  const noteRequired =
    candidate.risk === "material" || candidate.risk === "critical";
  const missingRequiredNote = noteRequired && note.trim().length === 0;
  const promotionBlockReason =
    preview?.blockReason ??
    candidate.promotionBlockReason ??
    (shadowBlocked
      ? mode === "shadow"
        ? "Patch proposals are disabled while Learning Mode is Shadow."
        : "Patch proposals are disabled because controlled learning is not active."
      : missingRequiredNote
        ? "Material and critical patches require a steward note."
        : null);
  const canSubmit =
    Boolean(preview) &&
    !acting &&
    !shadowBlocked &&
    !preview?.isStale &&
    preview?.canPromote === true &&
    candidate.canPromote &&
    !missingRequiredNote &&
    replacements.length > 0 &&
    replacements.length <= 10 &&
    patchIntent?.issues.length === 0;

  return (
    <section
      aria-labelledby={`patch-${candidate.id}`}
      className="rounded-[18px] border border-orange/20 bg-orange-soft/40 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-soft text-orange">
          <PencilLine className="size-4" />
        </span>
        <div>
          <h3
            id={`patch-${candidate.id}`}
            className="text-[13px] font-semibold text-ink"
          >
            Exact document-patch proposal
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-ink-dim">
            Define up to 10 exact find-and-replace operations against one
            immutable base version.
          </p>
        </div>
      </div>
      {!preview ? (
        <p className="mt-4 flex items-start gap-2 rounded-[14px] border border-edge bg-panel px-4 py-3 text-[11px] leading-5 text-ink-dim">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-orange" />
          The server did not return a version-locked patch preview. Promotion is
          unavailable.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[12px] border border-edge bg-panel p-3">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-ink-dimmer">
                Document
              </dt>
              <dd className="mt-1 truncate text-[11px] font-medium text-ink">
                {preview.targetTitle ??
                  preview.targetPath ??
                  preview.targetDocId ??
                  "Unavailable"}
              </dd>
            </div>
            <div className="rounded-[12px] border border-edge bg-panel p-3">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-ink-dimmer">
                Base version
              </dt>
              <dd className="mt-1 font-mono text-[11px] text-ink">
                {preview.targetBaseVersion === null
                  ? "—"
                  : `v${preview.targetBaseVersion}`}
              </dd>
            </div>
            <div className="rounded-[12px] border border-edge bg-panel p-3">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-ink-dimmer">
                Current version
              </dt>
              <dd
                className={`mt-1 font-mono text-[11px] ${preview.isStale ? "text-orange" : "text-ink"}`}
              >
                {preview.currentVersion === null
                  ? "—"
                  : `v${preview.currentVersion}`}
                {preview.isStale ? " · stale" : ""}
              </dd>
            </div>
            <div className="rounded-[12px] border border-edge bg-panel p-3">
              <dt className="text-[9px] uppercase tracking-[0.08em] text-ink-dimmer">
                Base hash
              </dt>
              <dd className="mt-1 truncate font-mono text-[10px] text-ink">
                {preview.baseContentHash ?? "Unavailable"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 space-y-3">
            {replacements.map((operation, index) => (
              <fieldset
                key={index}
                className="rounded-[14px] border border-edge bg-panel p-3 sm:p-4"
              >
                <legend className="px-1 text-[10px] font-semibold text-ink-dim">
                  Operation {index + 1}
                </legend>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-[10px] font-medium text-ink-dim">
                    Find exact text
                    <textarea
                      value={operation.find}
                      rows={3}
                      maxLength={8_000}
                      onChange={(event) =>
                        onReplacementsChange(
                          replacements.map((item, operationIndex) =>
                            operationIndex === index
                              ? { ...item, find: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="mt-2 block min-h-24 w-full resize-y rounded-[11px] border border-edge bg-bg px-3 py-3 font-mono text-[11px] leading-5 text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
                      placeholder="Text that must appear exactly once"
                    />
                  </label>
                  <label className="block text-[10px] font-medium text-ink-dim">
                    Replace with
                    <textarea
                      value={operation.replace}
                      rows={3}
                      maxLength={8_000}
                      onChange={(event) =>
                        onReplacementsChange(
                          replacements.map((item, operationIndex) =>
                            operationIndex === index
                              ? { ...item, replace: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="mt-2 block min-h-24 w-full resize-y rounded-[11px] border border-edge bg-bg px-3 py-3 font-mono text-[11px] leading-5 text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
                      placeholder="Replacement text (may be empty)"
                    />
                  </label>
                </div>
                {replacements.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      onReplacementsChange(
                        replacements.filter(
                          (_, operationIndex) => operationIndex !== index,
                        ),
                      )
                    }
                    className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[11px] text-ink-dim hover:bg-raise hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                  >
                    <Minus className="size-3.5" /> Remove operation
                  </button>
                )}
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            disabled={replacements.length >= 10}
            onClick={() =>
              onReplacementsChange([...replacements, { find: "", replace: "" }])
            }
            className="ob-btn mt-3 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" /> Add operation{" "}
            <span className="font-mono text-[9px] text-ink-dimmer">
              {replacements.length}/10
            </span>
          </button>
          <div className="mt-4 grid overflow-hidden rounded-[14px] border border-edge bg-panel md:grid-cols-2">
            <div className="min-w-0 border-b border-edge p-4 md:border-r md:border-b-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-dimmer">
                Before
                {preview.targetBaseVersion === null
                  ? ""
                  : ` · v${preview.targetBaseVersion}`}
              </p>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-5 text-ink-dim">
                {preview.baseContent || "No base content returned"}
              </pre>
            </div>
            <div className="min-w-0 p-4">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-orange">
                Intended after
              </p>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-5 text-ink">
                {patchIntent?.content ||
                  "Complete the operations to preview the intent"}
              </pre>
            </div>
          </div>
          {patchIntent && patchIntent.issues.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-[12px] border border-orange/25 bg-panel px-4 py-3 text-[10px] leading-5 text-orange">
              {patchIntent.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
          <label
            htmlFor={`patch-note-${candidate.id}`}
            className="mt-4 block text-[11px] font-medium text-ink"
          >
            Proposal note{" "}
            <span className="font-normal text-ink-dimmer">
              {noteRequired ? "(required)" : "(optional)"}
            </span>
          </label>
          <textarea
            id={`patch-note-${candidate.id}`}
            value={note}
            rows={2}
            maxLength={1_000}
            onChange={(event) => onNoteChange(event.target.value)}
            className="mt-2 block min-h-20 w-full resize-y rounded-[12px] border border-edge bg-panel px-3 py-3 text-[13px] leading-5 text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
            placeholder="Explain why this exact patch should enter governance."
          />
        </>
      )}
      {(promotionBlockReason || preview?.isStale) && (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-ink-dim">
          <Ban className="mt-0.5 size-3.5 shrink-0 text-orange" />
          {preview?.isStale
            ? "The target document changed after detection. Refresh or regenerate the candidate before promotion."
            : promotionBlockReason}
        </p>
      )}
      <div className="mt-4 rounded-[14px] border border-orange/25 bg-panel p-4">
        <p className="flex items-start gap-2 text-[11px] font-semibold leading-5 text-ink">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-orange" />
          This creates a governed proposal. It never writes current truth.
        </p>
        <p className="mt-1 pl-6 text-[10px] leading-5 text-ink-dimmer">
          Approval remains separate and transactional; a stale base version
          fails without a document write.
        </p>
      </div>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="ob-btn ob-btn-cta mt-3 min-h-11 w-full justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        title={promotionBlockReason ?? (patchIntent?.issues[0] || undefined)}
      >
        {acting ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowRight className="size-4" />
        )}{" "}
        Create governed patch proposal
      </button>
    </section>
  );
}

export function BatchComposer({
  candidates,
  scope,
  draft,
  acting,
  onDraftChange,
  onCreate,
  onClear,
}: {
  candidates: { id: string }[];
  scope: string;
  draft: BatchDraft;
  acting: boolean;
  onDraftChange: (draft: BatchDraft) => void;
  onCreate: () => void;
  onClear: () => void;
}) {
  const canCreate =
    draft.title.trim().length > 0 &&
    candidates.length > 0 &&
    candidates.length <= 25;
  return (
    <section
      aria-labelledby="batch-composer-title"
      className="rounded-[18px] border border-orange/25 bg-orange-soft p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="batch-composer-title"
            className="text-[12px] font-semibold text-ink"
          >
            Compose exact-scope batch
          </h2>
          <p className="mt-1 text-[10px] leading-5 text-ink-dim">
            {candidates.length}/25 selected · {scope}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={acting}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink-dim hover:bg-panel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Clear batch selection"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <label className="block text-[10px] font-medium text-ink">
          Batch title
          <input
            value={draft.title}
            disabled={acting}
            maxLength={240}
            onChange={(event) =>
              onDraftChange({ ...draft, title: event.target.value })
            }
            className="mt-2 block min-h-11 w-full rounded-[12px] border border-edge bg-panel px-3 text-[13px] text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
            placeholder="Name this review batch"
          />
        </label>
        <label className="block text-[10px] font-medium text-ink">
          Summary{" "}
          <span className="font-normal text-ink-dimmer">(optional)</span>
          <textarea
            value={draft.summary}
            disabled={acting}
            rows={2}
            maxLength={2_000}
            onChange={(event) =>
              onDraftChange({ ...draft, summary: event.target.value })
            }
            className="mt-2 block min-h-20 w-full resize-y rounded-[12px] border border-edge bg-panel px-3 py-3 text-[12px] leading-5 text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
            placeholder="State the shared review objective"
          />
        </label>
        <label className="block text-[10px] font-medium text-ink">
          Assignee user ID{" "}
          <span className="font-normal text-ink-dimmer">(optional)</span>
          <input
            value={draft.assignedTo}
            disabled={acting}
            maxLength={160}
            onChange={(event) =>
              onDraftChange({ ...draft, assignedTo: event.target.value })
            }
            className="mt-2 block min-h-11 w-full rounded-[12px] border border-edge bg-panel px-3 font-mono text-[11px] text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
            placeholder="Active steward user ID"
          />
        </label>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-ink-dim">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-orange" />
        Related candidates must share the exact project and department. A batch
        organizes review; it cannot approve truth.
      </p>
      <button
        type="button"
        disabled={acting || !canCreate}
        onClick={onCreate}
        className="ob-btn ob-btn-cta mt-3 min-h-11 w-full justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {acting ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Plus className="size-4" />
        )}{" "}
        Create batch
      </button>
    </section>
  );
}

export function BatchDetail({
  batch,
  candidates,
  note,
  assignedTo,
  acting,
  onNoteChange,
  onAssignedToChange,
  onTransition,
}: {
  batch: BatchSummary;
  candidates: BatchCandidate[];
  note: string;
  assignedTo: string;
  acting: string | null;
  onNoteChange: (note: string) => void;
  onAssignedToChange: (assignedTo: string) => void;
  onTransition: (transition: string) => void;
}) {
  const transitions = batch.allowedTransitions ?? [];
  return (
    <article
      aria-labelledby={`batch-title-${batch.id}`}
      className="min-w-0 rounded-[24px] border border-edge bg-panel"
    >
      <header className="border-b border-edge px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge risk={batch.risk} />
          <span className="inline-flex min-h-7 items-center rounded-full border border-edge bg-raise px-2.5 text-[10px] capitalize text-ink-dim">
            {titleCase(batch.status)}
          </span>
          <span className="text-[10px] text-ink-dimmer">
            {batch.projectName ?? batch.departmentName ?? "Organization-wide"}
          </span>
        </div>
        <h2
          id={`batch-title-${batch.id}`}
          className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-ink"
        >
          {batch.title}
        </h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-dim">
          {batch.summary || "No batch summary was recorded."}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-ink-dimmer">
          <div className="flex gap-1.5">
            <dt>Created</dt>
            <dd className="text-ink-dim">{displayDate(batch.createdAt)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Assignee</dt>
            <dd className="font-mono text-ink-dim">
              {batch.assignedTo ?? "Unassigned"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Progress</dt>
            <dd className="font-mono text-ink-dim">
              {candidates.filter((candidate) => candidate.assessment).length}/
              {candidates.length} assessed
            </dd>
          </div>
        </dl>
      </header>
      <div className="space-y-6 px-5 py-6 sm:px-6">
        <section aria-labelledby={`batch-candidates-${batch.id}`}>
          <div className="flex items-center justify-between gap-3">
            <h3
              id={`batch-candidates-${batch.id}`}
              className="text-[13px] font-semibold text-ink"
            >
              Candidates
            </h3>
            <span className="font-mono text-[10px] text-ink-dimmer">
              {candidates.length}
            </span>
          </div>
          {candidates.length ? (
            <ul className="mt-3 divide-y divide-edge overflow-hidden rounded-[14px] border border-edge">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex min-h-16 items-start gap-3 bg-bg p-3 sm:p-4"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-raise text-ink-dim">
                    {candidate.assessment ? (
                      <Check className="size-4 text-emerald-300" />
                    ) : (
                      <FileDiff className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium leading-5 text-ink">
                      {candidate.title}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-dimmer">
                      {titleCase(candidate.status)} · {candidate.evidenceCount}{" "}
                      evidence source{candidate.evidenceCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[9px] capitalize text-ink-dimmer">
                    {candidate.risk}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-[14px] border border-dashed border-edge px-4 py-5 text-[11px] text-ink-dim">
              Candidate details were not returned for this batch.
            </p>
          )}
        </section>
        <section
          aria-labelledby={`batch-lifecycle-${batch.id}`}
          className="rounded-[16px] border border-edge bg-bg p-4"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raise text-ink-dim">
              <UserRound className="size-4" />
            </span>
            <div>
              <h3
                id={`batch-lifecycle-${batch.id}`}
                className="text-[12px] font-semibold text-ink"
              >
                Assignment and lifecycle
              </h3>
              <p className="mt-1 text-[10px] leading-5 text-ink-dimmer">
                Every transition is authorized and audited. Candidate truth
                decisions remain individual.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-[10px] font-medium text-ink">
              Assignee user ID
              <input
                value={assignedTo}
                maxLength={160}
                onChange={(event) => onAssignedToChange(event.target.value)}
                className="mt-2 block min-h-11 w-full rounded-[12px] border border-edge bg-panel px-3 font-mono text-[11px] text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
                placeholder="Active steward user ID"
              />
            </label>
            <label className="block text-[10px] font-medium text-ink">
              Transition note
              <input
                value={note}
                maxLength={1_000}
                onChange={(event) => onNoteChange(event.target.value)}
                className="mt-2 block min-h-11 w-full rounded-[12px] border border-edge bg-panel px-3 text-[12px] text-ink placeholder:text-ink-dimmer focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
                placeholder="Required when dismissing"
              />
            </label>
          </div>
          {batch.transitionBlockReason && (
            <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-ink-dim">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-orange" />
              {batch.transitionBlockReason}
            </p>
          )}
          {transitions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {transitions.map((transition) => {
                const disabled =
                  acting !== null ||
                  batch.canTransition === false ||
                  (transition === "assign" && !assignedTo.trim()) ||
                  (transition === "dismiss" && !note.trim());
                return (
                  <button
                    key={transition}
                    type="button"
                    disabled={disabled}
                    onClick={() => onTransition(transition)}
                    className={`ob-btn min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:cursor-not-allowed disabled:opacity-50 ${transition === "start_review" ? "ob-btn-cta" : ""}`}
                  >
                    {acting === transition ? (
                      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : transition === "assign" ? (
                      <UserRound className="size-4" />
                    ) : transition === "dismiss" ? (
                      <X className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    {titleCase(transition)}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-[10px] leading-5 text-ink-dimmer">
              No lifecycle transitions are currently available for this batch.
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
