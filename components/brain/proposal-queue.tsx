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
    department?: string;
    project?: string;
    documentType?: "core" | "doc" | "rule";
    visibility?: "organization" | "department" | "project" | "restricted";
    audience?: string[];
    linkedPath?: string;
    relatedEdits?: {
      targetPath: string;
      baseVersion: number;
      replacements: { find: string; replace: string }[];
    }[];
  };
  evidence: string[];
  rationale: string;
  status: "pending" | "applying";
  created_at: string;
};

// The queues a steward can review: Urso's own, and client-brain orgs (fusion).
// The API re-runs fail-closed principal resolution per org, so a tab the
// steward lacks membership for just 403s.
const ORG_TABS = [
  { id: "urso", label: "Urso" },
  { id: "woof-gang", label: "Woof Gang" },
] as const;

export function ProposalQueue({ initialOrg = "urso" }: { initialOrg?: string }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  // Loading is DERIVED (which org has finished loading vs which is selected)
  // so the org-switch effect never calls setState synchronously.
  const [loadedOrg, setLoadedOrg] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The ?org= deep link is resolved by the SERVER page and passed in, so the
  // first client render always matches the server HTML.
  const [org, setOrg] = useState<string>(initialOrg);
  const loading = loadedOrg !== org;
  const orgQs = org === "urso" ? "" : `?org=${org}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/brain/proposals${orgQs}`);
        const data = (await response.json()) as { proposals?: Proposal[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load proposals.");
        if (!cancelled) {
          setProposals(data.proposals ?? []);
          setError("");
        }
      } catch (caught) {
        if (!cancelled) {
          setProposals([]);
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setLoadedOrg(org);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org, orgQs]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setActing(id);
    setError("");
    try {
      const response = await fetch(`/api/brain/proposals${orgQs}`, {
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

  const orgTabs = (
    <div className="mb-3 flex gap-1">
      {ORG_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setOrg(tab.id)}
          className={`rounded-[5px] border px-2.5 py-1 text-[11px] transition-colors ${
            org === tab.id
              ? "border-orange/50 bg-orange/10 text-[var(--ob-text)]"
              : "border-[var(--ob-border)] text-[var(--ob-muted)] hover:text-[var(--ob-text)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div>
        {orgTabs}
        <div className="flex items-center gap-2 rounded-[6px] bg-[var(--ob-bg-alt)] p-4 text-[12px] text-[var(--ob-muted)]">
          <LoaderCircle className="size-3.5 animate-spin" />
          Loading the review queue…
        </div>
      </div>
    );
  }

  return (
    <div>
      {orgTabs}
      {/* A failed org fetch must not masquerade as an empty (all-clear) queue. */}
      {error && proposals.length === 0 ? (
        <div className="rounded-[6px] border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-5 text-[12px] text-[var(--ob-muted)]">
          Couldn’t load this queue: {error}
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-[6px] border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-5">
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
            <li key={proposal.id} className="rounded-[6px] border border-[var(--ob-border)] bg-[var(--ob-bg-alt)] p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[5px] bg-orange-soft text-orange">
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
                  {[
                    ["Department", proposal.proposed_change.department],
                    ["Project", proposal.proposed_change.project],
                    ["Type", proposal.proposed_change.documentType],
                    ["Visibility", proposal.proposed_change.visibility],
                    ["Audience", proposal.proposed_change.audience?.join(", ")],
                    ["Linked doc", proposal.proposed_change.linkedPath],
                  ].some(([, value]) => Boolean(value)) && (
                    <dl className="mt-3 flex flex-wrap gap-1.5">
                      {[
                        ["Department", proposal.proposed_change.department],
                        ["Project", proposal.proposed_change.project],
                        ["Type", proposal.proposed_change.documentType],
                        ["Visibility", proposal.proposed_change.visibility],
                        ["Audience", proposal.proposed_change.audience?.join(", ")],
                        ["Linked doc", proposal.proposed_change.linkedPath],
                      ]
                        .filter((entry): entry is [string, string] => Boolean(entry[1]))
                        .map(([label, value]) => (
                          <div
                            key={label}
                            className="flex items-center gap-1 rounded-full border border-[var(--ob-border)] bg-[var(--ob-bg)] px-2.5 py-1 text-[9.5px]"
                          >
                            <dt className="text-[var(--ob-faint)]">{label}</dt>
                            <dd className="font-medium text-[var(--ob-muted)]">{value}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                  {proposal.proposed_change.content && (
                    /* Approval publishes EXACTLY this text as truth, so the
                       steward must be able to read all of it — clamped
                       preview, expandable to the full body. */
                    <details className="mt-2 rounded-[5px] bg-[var(--ob-bg)] px-3 py-2">
                      <summary className="cursor-pointer list-none">
                        <span className="line-clamp-3 font-mono text-[10px] leading-[1.55] text-[var(--ob-muted)]">
                          {proposal.proposed_change.content}
                        </span>
                        <span className="mt-1 block text-[9.5px] text-[var(--ob-faint)]">expand full proposed text ▾</span>
                      </summary>
                      <pre className="mt-2 max-h-80 overflow-auto border-t border-[var(--ob-border)] pt-2 font-mono text-[10px] leading-[1.55] whitespace-pre-wrap text-[var(--ob-muted)]">
                        {proposal.proposed_change.content}
                      </pre>
                    </details>
                  )}
                  {Boolean(proposal.proposed_change.relatedEdits?.length) && (
                    <div className="mt-3 rounded-[5px] border border-[var(--ob-border)] bg-[var(--ob-bg)] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ob-muted)]">
                        Corpus impact · {proposal.proposed_change.relatedEdits?.length} related document
                        {proposal.proposed_change.relatedEdits?.length === 1 ? "" : "s"}
                      </div>
                      <ul className="mt-2 space-y-2">
                        {proposal.proposed_change.relatedEdits?.map((edit) => (
                          <li key={edit.targetPath} className="min-w-0 text-[10px]">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                              <span className="truncate font-mono text-[var(--ob-muted)]">{edit.targetPath}</span>
                              <span className="shrink-0 text-[var(--ob-faint)]">
                                v{edit.baseVersion} · {edit.replacements.length} edit
                                {edit.replacements.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            {/* Approval applies these exact strings — show them. */}
                            <ul className="mt-1 space-y-1">
                              {edit.replacements.map((r, i) => (
                                <li key={i} className="rounded-[4px] bg-[var(--ob-bg-alt)] p-1.5 font-mono text-[9.5px] leading-[1.5]">
                                  <del className="block whitespace-pre-wrap text-red-400/80 no-underline">− {r.find}</del>
                                  {r.replace ? (
                                    <ins className="block whitespace-pre-wrap text-emerald-400/80 no-underline">+ {r.replace}</ins>
                                  ) : (
                                    <span className="block text-[var(--ob-faint)]">(removed)</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
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
