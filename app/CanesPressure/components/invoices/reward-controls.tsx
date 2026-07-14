"use client";

import { useEffect, useState, useTransition } from "react";
import { BadgeCheck, ExternalLink, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  getRewardConfigAction,
  listInvoiceRewardsAction,
  setInvoiceRewardOffer,
  setRewardApproval,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import type { RewardConfig } from "@/lib/canes/rewards";
import {
  fmtMoney,
  type InvoiceReward,
  type InvoiceRewardKind,
  type InvoiceStatus,
} from "@/lib/canes/types";

// Owner-side review-rewards panel (0012), self-contained like the job sheet's
// ExpensesPanel: loads its own rows + config on mount so it drops into both the
// invoice rail and the schedule sheet's billing step without prop-threading.
// Three zones per kind: an offer TOGGLE (offered/none/declined), the VERIFY
// step for claimed rows (approve applies the discount server-side), and the
// applied state. The customer's claimed/approved rows can never be silently
// un-offered from here — setInvoiceRewardOffer only deletes `offered` rows.

const KINDS: InvoiceRewardKind[] = ["google_review", "facebook_review", "social_follow"];

type Feedback = { ok: boolean; text: string } | null;

function Notice({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={`text-[12.5px] leading-snug ${value.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
      {value.text}
    </p>
  );
}

export function RewardManager({
  invoiceId,
  invoiceStatus,
  onChanged,
}: {
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  // Fired after any successful mutation — approvals change the invoice total,
  // so hosts (the job sheet's cash prefill) can refresh their own amounts.
  onChanged?: () => void;
}) {
  const [rewards, setRewards] = useState<InvoiceReward[] | null>(null);
  const [config, setConfig] = useState<RewardConfig | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    Promise.all([listInvoiceRewardsAction(invoiceId), getRewardConfigAction()]).then(
      ([rows, cfg]) => {
        if (!alive) return;
        setRewards(rows);
        setConfig(cfg);
      },
    );
    return () => {
      alive = false;
    };
  }, [invoiceId]);

  function run(fn: () => Promise<ActionResult>) {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      // Always re-fetch — even a failed approval may have reverted state.
      setRewards(await listInvoiceRewardsAction(invoiceId));
      if (res.ok) onChanged?.();
    });
  }

  if (!rewards || !config) return null;

  const terminal = invoiceStatus === "paid" || invoiceStatus === "void";
  const anyConfigured = KINDS.some((k) => config[k].configured);
  const byKind = new Map(rewards.map((r) => [r.kind, r]));

  // Nothing configured and nothing riding on this invoice — a single hint
  // beats an all-disabled control block.
  if (!anyConfigured && rewards.length === 0) {
    return (
      <div className="cp-divider pt-3">
        <p className="cp-label flex items-center gap-1.5">
          <Star size={13} strokeWidth={2} /> Review rewards
        </p>
        <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--cp-faint)]">
          Add your Google / Facebook / Instagram links in Settings to offer money off for
          reviews and follows.
        </p>
      </div>
    );
  }

  return (
    <div className="cp-divider space-y-2.5 pt-3">
      <p className="cp-label flex items-center gap-1.5">
        <Star size={13} strokeWidth={2} /> Review rewards
      </p>

      <ul className="space-y-2">
        {KINDS.map((kind) => {
          const row = byKind.get(kind);
          const cfg = config[kind];
          if (!row && !cfg.configured) return null; // nothing to offer, nothing offered

          const label = row?.label ?? cfg.label;
          const cents = row?.amount_cents ?? cfg.cents;

          // Claimed — the verify step: check the review exists, then resolve.
          if (row?.status === "claimed") {
            return (
              <li key={kind} className="rounded-md border border-[var(--cp-line)] bg-[var(--cp-brand-soft)] p-2.5">
                <p className="text-[13px] font-semibold">
                  {label}
                  {" — "}customer says it&rsquo;s done
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--cp-muted)]">
                  Verify it exists, then approve to take {fmtMoney(cents)} off.
                </p>
                {cfg.urls.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {cfg.urls.map((u) => (
                      <a
                        key={u.url}
                        href={u.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
                      >
                        <ExternalLink size={12} strokeWidth={2} /> Check
                        {kind === "google_review" ? " Google" : kind === "facebook_review" ? " Facebook" : " profiles"}
                      </a>
                    ))}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="cp-btn cp-btn-primary cp-btn-sm flex-1"
                    disabled={isPending}
                    onClick={() => run(() => setRewardApproval(row.id, true))}
                  >
                    <ThumbsUp size={13} strokeWidth={2} />
                    Approve −{fmtMoney(cents)}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn-sm"
                    disabled={isPending}
                    onClick={() => run(() => setRewardApproval(row.id, false))}
                  >
                    <ThumbsDown size={13} strokeWidth={2} />
                    Decline
                  </button>
                </div>
              </li>
            );
          }

          // Applied — the discount is in the total.
          if (row?.status === "approved") {
            return (
              <li key={kind} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--cp-good)]">
                  <BadgeCheck size={14} strokeWidth={2} /> {label}
                </span>
                <span className="tabular-nums font-semibold text-[var(--cp-good)]">
                  −{fmtMoney(cents)} applied
                </span>
              </li>
            );
          }

          // Offered / declined / not yet offered — the pre-send toggle.
          const offered = row?.status === "offered";
          const declined = row?.status === "declined";
          return (
            <li key={kind}>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--cp-brand-fill)]"
                  checked={offered}
                  disabled={isPending || terminal || (!offered && !cfg.configured)}
                  onChange={(e) => run(() => setInvoiceRewardOffer(invoiceId, kind, e.target.checked))}
                />
                <span className="min-w-0 flex-1">
                  {label}
                  {declined && <span className="ml-1.5 text-[11.5px] text-[var(--cp-faint)]">(declined — re-check to offer again)</span>}
                  {!cfg.configured && !row && (
                    <span className="ml-1.5 text-[11.5px] text-[var(--cp-faint)]">(add the link in Settings)</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-semibold">−{fmtMoney(cents)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {!terminal && (
        <p className="text-[11.5px] leading-snug text-[var(--cp-faint)]">
          Checked offers show on the customer&rsquo;s invoice page. When they claim one,
          you&rsquo;ll get an email to verify and approve.
        </p>
      )}
      <Notice value={feedback} />
    </div>
  );
}
