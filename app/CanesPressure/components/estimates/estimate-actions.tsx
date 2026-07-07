"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck2, Send, Trash2 } from "lucide-react";
import {
  sendEstimate,
  voidEstimate,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import type { EstimateStatus } from "@/lib/canes/types";
import {
  ChannelPicker,
  channelAvailability,
  choiceToChannels,
  type ChannelChoice,
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
}: {
  estimateId: string;
  status: EstimateStatus;
  phone: string;
  email: string;
  optedOut: boolean;
}) {
  const { isPending, feedback, run } = useAction();
  const [voidOpen, setVoidOpen] = useState(false);
  const [channelChoice, setChannelChoice] = useState<ChannelChoice>("both");

  const avail = channelAvailability({ phone, email, optedOut });
  const chosen = choiceToChannels(channelChoice);
  const resolvedChannels = {
    text: chosen.text && avail.hasPhone && !avail.textBlocked,
    email: chosen.email && avail.hasEmail,
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
          : "This estimate is no longer live."}
      </p>
    );
  }

  const isDraft = status === "draft";

  return (
    <div className="space-y-2.5">
      <ChannelPicker
        phone={phone}
        email={email}
        optedOut={optedOut}
        choice={channelChoice}
        onChange={setChannelChoice}
        disabled={isPending}
      />
      <button
        type="button"
        className="cp-btn cp-btn-primary w-full"
        disabled={isPending || !avail.canSend}
        onClick={() => run(() => sendEstimate(estimateId, { channels: resolvedChannels }))}
      >
        <Send size={16} strokeWidth={2} />
        {isPending ? "Sending..." : isDraft ? "Send estimate" : "Resend estimate"}
      </button>

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
