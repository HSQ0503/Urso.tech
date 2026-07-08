"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Banknote, CalendarCheck2, CreditCard, Send, Trash2 } from "lucide-react";
import {
  recordCashPayment,
  sendInvoice,
  voidInvoice,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import { fmtMoney, type InvoiceStatus } from "@/lib/canes/types";
import {
  ChannelPicker,
  channelAvailability,
  choiceToChannels,
  type ChannelChoice,
} from "../estimates/channel-picker";

// Owner-side action rail for the invoice detail page (a Server Component). Send/
// Resend for card, Record cash with a Verify step, and Void — each its own
// button with an inline Notice, the multi-button useAction pattern from
// estimate-actions.tsx. A paid invoice drops the mutations and shows the outcome.

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

function toCents(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function InvoiceActions({
  invoiceId,
  status,
  phone,
  email,
  optedOut,
  balanceCents,
  hasSquareUrl,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  phone: string;
  email: string;
  optedOut: boolean;
  balanceCents: number;
  hasSquareUrl: boolean;
}) {
  const { isPending, feedback, run } = useAction();
  const [channelChoice, setChannelChoice] = useState<ChannelChoice>("both");
  const [voidOpen, setVoidOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState((balanceCents / 100).toFixed(2));

  const avail = channelAvailability({ phone, email, optedOut });
  const chosen = choiceToChannels(channelChoice);
  const resolvedChannels = {
    text: chosen.text && avail.hasPhone && !avail.textBlocked,
    email: chosen.email && avail.hasEmail,
  };

  if (status === "paid") {
    return (
      <div className="space-y-2.5">
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--cp-good)]">
          <CalendarCheck2 size={16} strokeWidth={2} />
          Paid in full
        </p>
        <Link href="/CanesPressure/invoices" className="cp-btn cp-btn-sm w-full">
          Back to invoices
        </Link>
      </div>
    );
  }

  if (status === "void") {
    return (
      <p className="text-[13px] text-[var(--cp-muted)]">
        This invoice was voided. Complete the job again to re-bill if needed.
      </p>
    );
  }

  const isDraft = status === "draft";

  return (
    <div className="space-y-3">
      {/* Send / resend for card payment */}
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
          onClick={() => run(() => sendInvoice(invoiceId, { channels: resolvedChannels }))}
        >
          <CreditCard size={16} strokeWidth={2} />
          {isPending ? "Sending..." : isDraft ? "Send invoice (pay by card)" : "Resend invoice"}
        </button>
        {!hasSquareUrl && (
          <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
            <Send size={12} strokeWidth={2} className="mr-1 inline" />
            Sends your branded invoice link. Online card payment activates once Square is connected.
          </p>
        )}
      </div>

      {/* Record cash */}
      <div className="cp-divider pt-3">
        {!cashOpen ? (
          <button
            type="button"
            className="cp-btn cp-btn-sm w-full"
            disabled={isPending}
            onClick={() => setCashOpen(true)}
          >
            <Banknote size={15} strokeWidth={2} /> Record cash payment
          </button>
        ) : (
          <div className="space-y-2.5">
            <p className="text-[13px] font-medium">Confirm the cash you collected.</p>
            <div>
              <label className="cp-label" htmlFor="cp-inv-cash">
                Amount collected
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
                  $
                </span>
                <input
                  id="cp-inv-cash"
                  className="cp-input pl-6 tabular-nums"
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="cp-btn cp-btn-primary cp-btn-sm flex-1"
                disabled={isPending || toCents(cashAmount) <= 0}
                onClick={() =>
                  run(() => recordCashPayment(invoiceId, toCents(cashAmount)), () => setCashOpen(false))
                }
              >
                {isPending ? "Recording..." : `Verify ${fmtMoney(toCents(cashAmount))}`}
              </button>
              <button
                type="button"
                className="cp-btn cp-btn-sm"
                disabled={isPending}
                onClick={() => setCashOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Void */}
      <div className="cp-divider pt-3">
        {!voidOpen ? (
          <button
            type="button"
            className="cp-btn cp-btn-sm cp-btn-danger w-full"
            disabled={isPending}
            onClick={() => setVoidOpen(true)}
          >
            <Trash2 size={15} strokeWidth={2} /> Void invoice
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-[12.5px] leading-snug text-[var(--cp-muted)]">
              Voiding cancels any pending reminder texts and stops the customer link. This can&apos;t be undone.
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
                onClick={() => run(() => voidInvoice(invoiceId), () => setVoidOpen(false))}
              >
                {isPending ? "Voiding..." : "Confirm void"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Notice value={feedback} />
    </div>
  );
}
