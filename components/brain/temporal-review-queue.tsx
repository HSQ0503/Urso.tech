"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  FileText,
  GitCompareArrows,
  History,
  LoaderCircle,
  X,
} from "lucide-react";

export type TemporalProposal = {
  id: string;
  subjectLabel: string;
  predicateLabel: string;
  objectValue: string;
  objectLabel?: string | null;
  objectType: "text" | "number" | "boolean" | "date" | "entity";
  validFrom: string | null;
  validUntil: string | null;
  projectId: string | null;
  rationale: string;
  source?: {
    path: string;
    title: string;
    version: number;
    excerpt: string;
  } | null;
  supersedes?: { id: string; label?: string }[];
  createdAt: string;
};

export type TemporalConflictSide = {
  id: string;
  objectValue: string;
  objectLabel?: string | null;
  validFrom: string | null;
  validUntil: string | null;
  source?: {
    path: string;
    title: string;
    version: number;
    excerpt: string;
  } | null;
};

export type TemporalConflict = {
  id: string;
  subjectLabel: string;
  predicateLabel: string;
  message?: string | null;
  left: TemporalConflictSide;
  right: TemporalConflictSide;
  createdAt: string;
};

type ProposalDecision = "approve" | "reject";
type ConflictResolution =
  | "supersede_left"
  | "supersede_right"
  | "keep_unresolved"
  | "dismiss_duplicate";

type Notes = Record<string, string>;

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? fallbackMessage);
  return data;
}

function displayValue(value: string, label?: string | null) {
  return label || value;
}

function displayPeriod(validFrom: string | null, validUntil: string | null) {
  if (validFrom && validUntil) {
    return `${validFrom.slice(0, 10)}–before ${validUntil.slice(0, 10)}`;
  }
  if (validFrom) return `From ${validFrom.slice(0, 10)}`;
  if (validUntil) return `Until ${validUntil.slice(0, 10)} (exclusive)`;
  return "Effective date not set";
}

function SourceEvidence({
  source,
}: {
  source: TemporalProposal["source"] | TemporalConflictSide["source"];
}) {
  if (!source) {
    return (
      <p className="mt-3 text-[10.5px] leading-5 text-[var(--ob-faint)]">
        No source excerpt was included with this item.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-[5px] border border-[var(--ob-border)] bg-[var(--ob-bg)] p-3">
      <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ob-muted)]">
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate font-medium">{source.title}</span>
        <span className="shrink-0 font-mono text-[9px] text-[var(--ob-faint)]">v{source.version}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-[10.5px] leading-[1.55] text-[var(--ob-muted)]">{source.excerpt}</p>
      <p className="mt-2 truncate font-mono text-[9px] text-[var(--ob-faint)]">{source.path}</p>
    </div>
  );
}

function ReviewNote({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ob-faint)]">
        Review note
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Record why this decision is correct."
        className="mt-1.5 block min-h-20 w-full resize-y rounded-[5px] border border-[var(--ob-border)] bg-[var(--ob-bg)] px-3 py-2.5 text-[12px] leading-5 text-[var(--ob-text)] placeholder:text-[var(--ob-faint)] focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
      />
    </div>
  );
}

export function TemporalReviewQueue() {
  const [proposals, setProposals] = useState<TemporalProposal[]>([]);
  const [conflicts, setConflicts] = useState<TemporalConflict[]>([]);
  const [proposalNotes, setProposalNotes] = useState<Notes>({});
  const [conflictNotes, setConflictNotes] = useState<Notes>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetch("/api/brain/claim-proposals").then((response) =>
        readResponse<{ proposals?: TemporalProposal[] }>(response, "Could not load temporal claim proposals."),
      ),
      fetch("/api/brain/claim-conflicts").then((response) =>
        readResponse<{ conflicts?: TemporalConflict[] }>(response, "Could not load temporal claim conflicts."),
      ),
    ])
      .then(([proposalData, conflictData]) => {
        if (cancelled) return;
        setProposals(proposalData.proposals ?? []);
        setConflicts(conflictData.conflicts ?? []);
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

  const decideProposal = async (id: string, decision: ProposalDecision) => {
    setActing(`proposal:${id}`);
    setError("");

    try {
      const response = await fetch("/api/brain/claim-proposals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          decision,
          note: proposalNotes[id]?.trim() || undefined,
        }),
      });
      await readResponse<{ error?: string }>(response, "Could not record the proposal decision.");
      setProposals((current) => current.filter((proposal) => proposal.id !== id));
      setProposalNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setActing(null);
    }
  };

  const resolveConflict = async (id: string, resolution: ConflictResolution) => {
    setActing(`conflict:${id}`);
    setError("");

    try {
      const response = await fetch("/api/brain/claim-conflicts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          resolution,
          note: conflictNotes[id]?.trim() || undefined,
        }),
      });
      await readResponse<{ error?: string }>(response, "Could not record the conflict decision.");
      setConflicts((current) => current.filter((conflict) => conflict.id !== id));
      setConflictNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-20 items-center gap-2 rounded-[6px] bg-[var(--ob-bg-alt)] p-4 text-[12px] text-[var(--ob-muted)]">
        <LoaderCircle className="size-3.5 animate-spin" />
        Loading temporal truth reviews…
      </div>
    );
  }

  const isClear = proposals.length === 0 && conflicts.length === 0;

  return (
    <div>
      {isClear ? (
        <div className="rounded-[6px] border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-5">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--ob-text)]">
            <Check className="size-4 text-orange" />
            Temporal truth queue is clear
          </div>
          <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--ob-muted)]">
            No proposed facts or authorized conflicts need a steward decision.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          <section aria-labelledby="temporal-proposals-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 id="temporal-proposals-heading" className="text-[12.5px] font-semibold text-[var(--ob-text)]">
                  Claim proposals
                </h3>
                <p className="mt-0.5 text-[10.5px] text-[var(--ob-faint)]">
                  Approval atomically applies the fact and its evidence.
                </p>
              </div>
              <span className="rounded-full border border-[var(--ob-border)] bg-[var(--ob-bg)] px-2.5 py-1 font-mono text-[10px] text-[var(--ob-muted)]">
                {proposals.length} pending
              </span>
            </div>

            {proposals.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-[var(--ob-border)] px-4 py-6 text-center text-[11.5px] text-[var(--ob-muted)]">
                No pending claim proposals.
              </div>
            ) : (
              <ul className="space-y-3">
                {proposals.map((proposal) => {
                  const actionKey = `proposal:${proposal.id}`;
                  const isActing = acting === actionKey;

                  return (
                    <li key={proposal.id} className="rounded-[6px] border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-orange-soft text-orange">
                          <History className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[12.5px] text-[var(--ob-text)]">{proposal.subjectLabel}</span>
                            <span className="font-mono text-[10px] text-[var(--ob-faint)]">{proposal.predicateLabel}</span>
                          </div>
                          <p className="mt-2 break-words text-[15px] font-semibold text-[var(--ob-text)]">
                            {displayValue(proposal.objectValue, proposal.objectLabel)}
                          </p>
                          <p className="mt-1 text-[10.5px] text-[var(--ob-faint)]">
                            {displayPeriod(proposal.validFrom, proposal.validUntil)}
                            {proposal.projectId ? ` · Project ${proposal.projectId.slice(0, 8)}` : " · Organization-wide"}
                          </p>
                          <p className="mt-3 text-[11.5px] leading-5 text-[var(--ob-muted)]">{proposal.rationale}</p>

                          {Boolean(proposal.supersedes?.length) && (
                            <p className="mt-2 text-[10.5px] text-[var(--ob-faint)]">
                              Supersedes {proposal.supersedes?.map((claim) => claim.label ?? claim.id.slice(0, 8)).join(", ")}
                            </p>
                          )}

                          <SourceEvidence source={proposal.source} />
                          <ReviewNote
                            id={`proposal-note-${proposal.id}`}
                            value={proposalNotes[proposal.id] ?? ""}
                            onChange={(value) =>
                              setProposalNotes((current) => ({ ...current, [proposal.id]: value }))
                            }
                          />

                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => void decideProposal(proposal.id, "reject")}
                              className="ob-btn min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActing ? <LoaderCircle className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => void decideProposal(proposal.id, "approve")}
                              className="ob-btn ob-btn-cta min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                              Approve claim
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="temporal-conflicts-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 id="temporal-conflicts-heading" className="text-[12.5px] font-semibold text-[var(--ob-text)]">
                  Claim conflicts
                </h3>
                <p className="mt-0.5 text-[10.5px] text-[var(--ob-faint)]">
                  Compare both authorized claims before choosing a resolution.
                </p>
              </div>
              <span className="rounded-full border border-[var(--ob-border)] bg-[var(--ob-bg)] px-2.5 py-1 font-mono text-[10px] text-[var(--ob-muted)]">
                {conflicts.length} open
              </span>
            </div>

            {conflicts.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-[var(--ob-border)] px-4 py-6 text-center text-[11.5px] text-[var(--ob-muted)]">
                No authorized conflicts need review.
              </div>
            ) : (
              <ul className="space-y-3">
                {conflicts.map((conflict) => {
                  const actionKey = `conflict:${conflict.id}`;
                  const isActing = acting === actionKey;

                  return (
                    <li key={conflict.id} className="rounded-[6px] border border-orange/25 bg-[var(--ob-bg-alt)] p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-orange-soft text-orange">
                          <GitCompareArrows className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[12.5px] text-[var(--ob-text)]">{conflict.subjectLabel}</span>
                            <span className="font-mono text-[10px] text-[var(--ob-faint)]">{conflict.predicateLabel}</span>
                          </div>
                          {conflict.message && (
                            <p className="mt-2 flex items-start gap-2 text-[11.5px] leading-5 text-orange">
                              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                              {conflict.message}
                            </p>
                          )}

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {[
                              ["Claim A", conflict.left] as const,
                              ["Claim B", conflict.right] as const,
                            ].map(([label, side]) => (
                              <article key={side.id} className="rounded-[5px] border border-[var(--ob-border)] bg-[var(--ob-bg-sec)] p-3">
                                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ob-faint)]">
                                  {label}
                                </p>
                                <p className="mt-2 break-words text-[13px] font-semibold text-[var(--ob-text)]">
                                  {displayValue(side.objectValue, side.objectLabel)}
                                </p>
                                <p className="mt-1 text-[10px] text-[var(--ob-faint)]">
                                  {displayPeriod(side.validFrom, side.validUntil)}
                                </p>
                                <SourceEvidence source={side.source} />
                              </article>
                            ))}
                          </div>

                          <ReviewNote
                            id={`conflict-note-${conflict.id}`}
                            value={conflictNotes[conflict.id] ?? ""}
                            onChange={(value) =>
                              setConflictNotes((current) => ({ ...current, [conflict.id]: value }))
                            }
                          />

                          <p className="mt-3 text-[10.5px] leading-5 text-[var(--ob-faint)]">
                            No claim is selected by default. Choose the result that the evidence supports.
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => void resolveConflict(conflict.id, "supersede_right")}
                              className="ob-btn min-h-11 justify-center text-center disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                              Keep claim A
                            </button>
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => void resolveConflict(conflict.id, "supersede_left")}
                              className="ob-btn min-h-11 justify-center text-center disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                              Keep claim B
                            </button>
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => void resolveConflict(conflict.id, "keep_unresolved")}
                              className="ob-btn min-h-11 justify-center text-center disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                              Keep unresolved
                            </button>
                            <button
                              type="button"
                              disabled={acting !== null}
                              onClick={() => void resolveConflict(conflict.id, "dismiss_duplicate")}
                              className="ob-btn min-h-11 justify-center text-center disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                              Mark duplicate
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-orange">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
