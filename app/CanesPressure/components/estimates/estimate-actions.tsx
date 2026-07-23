"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarCheck2, Eye, Send, Trash2 } from "lucide-react";
import {
  approveEstimateInPerson,
  sendEstimate,
  voidEstimate,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  fmtEt,
  fmtMoney,
  PAYMENT_METHOD_LABEL,
  type EstimateStatus,
  type EstimateType,
  type PaymentMethod,
} from "@/lib/canes/types";
import {
  ChannelPicker,
  choiceToChannels,
  overrideSendOpts,
  resolveSendTarget,
  EMPTY_OVERRIDE,
  type ChannelChoice,
  type SendOverride,
} from "./channel-picker";

// Owner-side action rail for the estimate detail page. The detail page is a
// Server Component, so Send/Resend and Void (the two mutations) live here in a
// small client island, each an independent button with its own Notice — the
// multi-button useAction()+Notice pattern from leads/disposition.tsx. When an
// estimate is approved a job already exists (approveEstimate created it), so we
// drop the mutations and surface a link to the schedule instead.

type Feedback = { ok: boolean; text: string } | null;

function useAction() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onOk?.();
    });
  }
  return { isPending, feedback, run };
}

function Notice({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={`text-[12.5px] leading-snug ${value.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
      {value.text}
    </p>
  );
}

export function EstimateActions({
  estimateId,
  status,
  estimateType,
  depositCents = 0,
  phone,
  email,
  optedOut,
  sentAt,
  viewedAt = null,
}: {
  estimateId: string;
  status: EstimateStatus;
  estimateType: EstimateType;
  depositCents?: number;
  phone: string;
  email: string;
  optedOut: boolean;
  sentAt: string | null;
  viewedAt?: string | null;
}) {
  const { isPending, feedback, run } = useAction();
  const [voidOpen, setVoidOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [depositCollected, setDepositCollected] = useState(false);
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("cash");
  const [channelChoice, setChannelChoice] = useState<ChannelChoice>("both");
  const [override, setOverride] = useState<SendOverride>(EMPTY_OVERRIDE);

  const target = resolveSendTarget({ phone, email, optedOut, override });
  const chosen = choiceToChannels(channelChoice);
  const resolvedChannels = {
    text: chosen.text && target.hasPhone && !target.textBlocked,
    email: chosen.email && target.hasEmail,
  };

  // Terminal states: nothing left to send or void. Approved estimates spawned a
  // job on approval, so point the owner at the schedule where it landed.
  if (status === "approved") {
    return (
      <div className="space-y-2.5">
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--cp-good)]">
          <CalendarCheck2 size={16} strokeWidth={2} />
          Approved — job created
        </p>
        <Link href="/CanesPressure/schedule" className="cp-btn cp-btn-sm w-full">
          View on the schedule
        </Link>
        {/* An in-person approval flips this branch in the same transition —
            its success notice lands here. */}
        <Notice value={feedback} />
      </div>
    );
  }

  if (status === "declined" || status === "expired") {
    return (
      <p className="text-[13px] text-[var(--cp-muted)]">
        {status === "declined"
          ? "This estimate was declined. Start a new one from the lead if the customer changes their mind."
          : "This estimate expired before the customer approved it. Start a new one to re-quote."}
      </p>
    );
  }

  const isDraft = status === "draft";

  return (
    <div className="space-y-2.5">
      {/* Drafts send from the builder's Save & send block — rendering the rail
          picker too would put two competing send UIs on one page. */}
      {!isDraft && (
        <>
          <ChannelPicker
            phone={phone}
            email={email}
            optedOut={optedOut}
            choice={channelChoice}
            onChange={setChannelChoice}
            disabled={isPending}
            override={override}
            onOverrideChange={setOverride}
          />
          <button
            type="button"
            className="cp-btn cp-btn-primary cp-btn-block md:min-h-9 md:rounded-[5px] md:text-[13px]"
            disabled={isPending || !target.canSend}
            onClick={() =>
              run(() =>
                sendEstimate(estimateId, { channels: resolvedChannels, ...overrideSendOpts(override) }),
              )
            }
          >
            <Send size={16} strokeWidth={2} />
            {isPending ? "Sending..." : "Resend"}
          </button>
          {sentAt && (
            <p className="text-[12px] tabular-nums text-[var(--cp-faint)]">Last sent {fmtEt(sentAt)}</p>
          )}
          {/* The Markate-style read receipt — the public page stamps the
              first open of a sent estimate. */}
          {viewedAt ? (
            <p className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums text-[var(--cp-good)]">
              <Eye size={12} strokeWidth={2.5} /> Viewed {fmtEt(viewedAt)}
            </p>
          ) : (
            sentAt && (
              <p className="text-[12px] text-[var(--cp-faint)]">Not viewed yet</p>
            )
          )}
        </>
      )}

      {/* In-person approval — the client said yes verbally, so Sebastian
          approves on their behalf. Two-step confirm; sent/viewed only (drafts
          go out through the builder first), standard estimates only (options
          and packages derive totals from the customer's own selection). */}
      {!isDraft && estimateType === "standard" && !approveOpen && (
        <button
          type="button"
          className="cp-btn cp-btn-sm w-full"
          disabled={isPending}
          onClick={() => setApproveOpen(true)}
        >
          <BadgeCheck size={15} strokeWidth={2} />
          Mark approved — agreed in person
        </button>
      )}

      {approveOpen && (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
            This approves the estimate exactly as if the customer tapped Approve —
            the job is created and reminders stop. Only do this when they&apos;ve
            clearly agreed.
          </p>
          {/* The Markate flow: deposit handed over on the spot → ledger it at
              approval; no online pay link gets minted. */}
          {depositCents > 0 && (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--cp-brand-fill)]"
                  checked={depositCollected}
                  onChange={(e) => setDepositCollected(e.target.checked)}
                />
                They already paid the {fmtMoney(depositCents)} deposit
              </label>
              {depositCollected && (
                <div className="flex flex-wrap items-center gap-1.5 pl-6">
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="cp-slot"
                      data-selected={m === depositMethod}
                      onClick={() => setDepositMethod(m)}
                    >
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="cp-btn cp-btn-sm flex-1"
              disabled={isPending}
              onClick={() => setApproveOpen(false)}
            >
              Not yet
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-primary cp-btn-sm flex-1"
              disabled={isPending}
              onClick={() =>
                run(
                  () =>
                    approveEstimateInPerson(estimateId, {
                      depositCollected,
                      depositMethod,
                    }),
                  () => setApproveOpen(false),
                )
              }
            >
              {isPending ? "Approving..." : "Confirm approval"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="cp-btn cp-btn-sm cp-btn-danger w-full"
        disabled={isPending}
        onClick={() => setVoidOpen((v) => !v)}
      >
        <Trash2 size={15} strokeWidth={2} />
        Void estimate
      </button>

      {voidOpen && (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
            Voiding cancels any pending reminder texts. The customer link stops working. This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="cp-btn cp-btn-sm flex-1"
              disabled={isPending}
              onClick={() => setVoidOpen(false)}
            >
              Keep it
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-sm cp-btn-danger flex-1"
              disabled={isPending}
              onClick={() => run(() => voidEstimate(estimateId), () => setVoidOpen(false))}
            >
              {isPending ? "Voiding..." : "Confirm void"}
            </button>
          </div>
        </div>
      )}

      <Notice value={feedback} />
    </div>
  );
}
