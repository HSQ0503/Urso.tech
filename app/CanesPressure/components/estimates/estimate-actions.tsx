"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck2, Send, Trash2 } from "lucide-react";
import {
  sendEstimate,
  voidEstimate,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import { fmtEt, type EstimateStatus } from "@/lib/canes/types";
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
  phone,
  email,
  optedOut,
  sentAt,
}: {
  estimateId: string;
  status: EstimateStatus;
  phone: string;
  email: string;
  optedOut: boolean;
  sentAt: string | null;
}) {
  const { isPending, feedback, run } = useAction();
  const [voidOpen, setVoidOpen] = useState(false);
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
            className="cp-btn cp-btn-primary w-full"
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
        </>
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
