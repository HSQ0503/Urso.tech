"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeDollarSign, Banknote, CheckCircle2, CreditCard, PlayCircle, Send } from "lucide-react";
import {
  completeJob,
  recordCashPayment,
  sendInvoice,
  startJob,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import { fmtMoney, type JobInvoiceSummary, type JobWithItems } from "@/lib/canes/types";

// The billing panel inside the job sheet (Phase 2.5) — the seamless "job done →
// how are they paying?" flow. Start → Complete & bill mints the invoice, then a
// card-by-text or cash-with-verify choice. Full options (email, adjust, resend)
// live on the invoice detail page, one tap away. Self-contained useAction so it
// never entangles the sheet's scheduling controls.

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
  return { isPending, feedback, run, setFeedback };
}

function Notice({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={`text-[12.5px] leading-snug ${value.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
      {value.text}
    </p>
  );
}

// Parse a "$1,240.00" / "1240" style entry into integer cents. NaN → 0.
function toCents(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function JobBilling({
  job,
  invoice,
}: {
  job: JobWithItems;
  invoice: JobInvoiceSummary | null;
}) {
  const { isPending, feedback, run } = useAction();
  const [invoiceId, setInvoiceId] = useState<string | null>(invoice?.id ?? null);
  // Start in "choose" only when a job is completed AND already has an invoice.
  // A job completed via the status dropdown has no invoice yet, so it starts in
  // "idle" where "Complete & bill" mints one before offering card/cash.
  const [mode, setMode] = useState<"idle" | "choose" | "cash">(
    job.status === "completed" && invoice?.id ? "choose" : "idle",
  );
  const billedCents = invoice?.total_cents ?? job.total_cents;
  const [cashAmount, setCashAmount] = useState<string>((billedCents / 100).toFixed(2));

  const status = job.status;

  // ── Paid: the terminal happy state ──────────────────────────────────────────
  if (status === "paid") {
    const paid = invoice?.amount_paid_cents ?? billedCents;
    return (
      <div className="cp-divider mt-4 pt-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} strokeWidth={2} className="shrink-0 text-[var(--cp-good)]" />
          <p className="text-[13px] font-semibold text-[var(--cp-good)]">
            Paid {fmtMoney(paid)}
          </p>
        </div>
        {invoice && (
          <Link
            href={`/CanesPressure/invoices/${invoice.id}`}
            className="mt-2 inline-flex text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
          >
            View invoice {invoice.number}
          </Link>
        )}
      </div>
    );
  }

  // ── Invoiced: sent for card, awaiting payment (cash fallback still allowed) ──
  if (status === "invoiced") {
    return (
      <div className="cp-divider mt-4 pt-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Send size={15} strokeWidth={2} className="shrink-0 text-[var(--cp-muted)]" />
          <p className="text-[13px] font-medium">
            Invoice {invoice?.number ?? ""} sent — awaiting card payment ({fmtMoney(billedCents)}).
          </p>
        </div>
        {mode !== "cash" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cp-btn cp-btn-sm"
              disabled={isPending}
              onClick={() => setMode("cash")}
            >
              <Banknote size={14} strokeWidth={2} /> Paid cash instead
            </button>
            {invoiceId && (
              <Link href={`/CanesPressure/invoices/${invoiceId}`} className="cp-btn cp-btn-sm">
                View invoice
              </Link>
            )}
          </div>
        ) : (
          <CashPanel
            name={job.customer_name}
            cashAmount={cashAmount}
            setCashAmount={setCashAmount}
            isPending={isPending}
            onCancel={() => setMode("idle")}
            onVerify={() =>
              invoiceId && run(() => recordCashPayment(invoiceId, toCents(cashAmount)))
            }
          />
        )}
        <Notice value={feedback} />
      </div>
    );
  }

  // ── Active job (scheduled / confirmed / in_progress / completed) ────────────
  return (
    <div className="cp-divider mt-4 pt-3 space-y-2.5">
      <p className="cp-label flex items-center gap-1.5">
        <BadgeDollarSign size={13} strokeWidth={2} /> Billing
      </p>

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {status !== "in_progress" && status !== "completed" && (
            <button
              type="button"
              className="cp-btn cp-btn-sm"
              disabled={isPending}
              onClick={() => run(() => startJob(job.id))}
            >
              <PlayCircle size={14} strokeWidth={2} /> Start job
            </button>
          )}
          <button
            type="button"
            className="cp-btn cp-btn-primary cp-btn-sm"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const res = await completeJob(job.id);
                if (res.ok && res.invoiceId) {
                  setInvoiceId(res.invoiceId);
                  setMode("choose");
                }
                return res;
              })
            }
          >
            <BadgeDollarSign size={14} strokeWidth={2} /> Complete &amp; bill
          </button>
        </div>
      )}

      {mode === "choose" && (
        <div className="space-y-2.5">
          <p className="text-[13px] font-medium">
            How is the customer paying {fmtMoney(billedCents)}?
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              className="cp-btn cp-btn-primary"
              disabled={isPending || !job.customer_phone || !invoiceId}
              onClick={() =>
                invoiceId && run(() => sendInvoice(invoiceId, { channels: { text: true, email: false } }))
              }
            >
              <CreditCard size={16} strokeWidth={2} /> Text invoice to pay by card
            </button>
            {!job.customer_phone && (
              <p className="text-[12px] text-[var(--cp-faint)]">
                No phone on file — open the invoice to email it instead.
              </p>
            )}
            <button
              type="button"
              className="cp-btn"
              disabled={isPending}
              onClick={() => setMode("cash")}
            >
              <Banknote size={16} strokeWidth={2} /> Record cash payment
            </button>
          </div>
          {invoiceId && (
            <Link
              href={`/CanesPressure/invoices/${invoiceId}`}
              className="inline-flex text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
            >
              More options — email, edit amount, resend →
            </Link>
          )}
        </div>
      )}

      {mode === "cash" && (
        <CashPanel
          name={job.customer_name}
          cashAmount={cashAmount}
          setCashAmount={setCashAmount}
          isPending={isPending}
          onCancel={() => setMode(job.status === "completed" ? "choose" : "idle")}
          onVerify={() =>
            invoiceId && run(() => recordCashPayment(invoiceId, toCents(cashAmount)))
          }
        />
      )}

      <Notice value={feedback} />
    </div>
  );
}

function CashPanel({
  name,
  cashAmount,
  setCashAmount,
  isPending,
  onCancel,
  onVerify,
}: {
  name: string | null;
  cashAmount: string;
  setCashAmount: (v: string) => void;
  isPending: boolean;
  onCancel: () => void;
  onVerify: () => void;
}) {
  const cents = toCents(cashAmount);
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] leading-snug">
        Confirm you collected cash from{" "}
        <span className="font-semibold">{name ?? "the customer"}</span>.
      </p>
      <div>
        <label className="cp-label" htmlFor="cp-cash-amount">
          Amount collected
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
            $
          </span>
          <input
            id="cp-cash-amount"
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
          className="cp-btn cp-btn-primary flex-1"
          disabled={isPending || cents <= 0}
          onClick={onVerify}
        >
          {isPending ? "Recording..." : `Verify — collected ${fmtMoney(cents)}`}
        </button>
        <button type="button" className="cp-btn cp-btn-sm" disabled={isPending} onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  );
}
