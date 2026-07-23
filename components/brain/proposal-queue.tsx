"use client";

import { useEffect, useState } from "react";
import { Check, FileDiff, LoaderCircle, X } from "lucide-react";

type Proposal = {
  id: string;
  operation: "create" | "update" | "link" | "delete";
  target_path: string;
  proposed_change: {
    title?: string;
    content?: string;
    linkedPath?: string;
  };
  evidence: string[];
  rationale: string;
  status: "pending" | "applying";
  created_at: string;
};

export function ProposalQueue() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/brain/proposals");
        const data = (await response.json()) as { proposals?: Proposal[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load proposals.");
        if (!cancelled) setProposals(data.proposals ?? []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setActing(id);
    setError("");
    try {
      const response = await fetch("/api/brain/proposals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Review failed.");
      setProposals((current) => current.filter((proposal) => proposal.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-[var(--ob-bg-alt)] p-4 text-[12px] text-[var(--ob-muted)]">
        <LoaderCircle className="size-3.5 animate-spin" />
        Loading the review queue…
      </div>
    );
  }

  return (
    <div>
      {proposals.length === 0 ? (
        <div className="rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-5">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--ob-text)]">
            <Check className="size-4 text-orange" />
            Review queue is clear
          </div>
          <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--ob-muted)]">
            AI conversations can propose durable knowledge, but no proposal changes company truth until it is approved here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-soft text-orange">
                  <FileDiff className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-orange-soft px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-orange">
                      {proposal.operation}
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-[var(--ob-faint)]">{proposal.target_path}</span>
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--ob-text)]">{proposal.rationale}</p>
                  {proposal.proposed_change.content && (
                    <p className="mt-2 line-clamp-3 rounded-xl bg-[var(--ob-bg)] px-3 py-2 font-mono text-[10px] leading-[1.55] text-[var(--ob-muted)]">
                      {proposal.proposed_change.content}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--ob-faint)]">
                      {proposal.evidence.length
                        ? `${proposal.evidence.length} evidence reference${proposal.evidence.length === 1 ? "" : "s"}`
                        : "User-supplied knowledge"}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void decide(proposal.id, "reject")}
                        disabled={acting !== null || proposal.status === "applying"}
                        className="ob-btn"
                      >
                        {acting === proposal.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(proposal.id, "approve")}
                        disabled={acting !== null || proposal.status === "applying"}
                        className="ob-btn ob-btn-cta"
                      >
                        {acting === proposal.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-[12px] leading-5 text-orange">{error}</p>}
    </div>
  );
}
