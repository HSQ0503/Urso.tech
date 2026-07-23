"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BadgeDollarSign, Banknote, CheckCircle2, CreditCard, PlayCircle, Plus, Receipt, Send, Trash2 } from "lucide-react";
import {
  addJobExpense,
  completeJob,
  deleteJobExpense,
  getInvoiceSummaryAction,
  listJobExpensesAction,
  recordCashPayment,
  sendInvoice,
  startJob,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import { fmtMoney, type JobExpense, type JobInvoiceSummary, type JobWithItems } from "@/lib/canes/types";
import { RewardManager } from "../invoices/reward-controls";

// Categories seeded into the add-expense picker. These MIRROR the
// settings.expense_categories defaults (lib/canes/data.ts) so the panel stays
// self-contained without threading settings through the job sheet.
const EXPENSE_CATEGORIES = ["Materials", "Gas / travel", "Dump fee", "Subcontractor", "Equipment", "Other"];

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
  // Live invoice summary: a reward approval inside this sheet changes the
  // total, so the billed figure and the cash prefill must track the server —
  // a stale pre-discount prefill invites verifying more cash than is owed.
  const [summary, setSummary] = useState<JobInvoiceSummary | null>(invoice);
  const billedCents = summary?.total_cents ?? job.total_cents;
  // Money already in hand against this bill: invoice-attached payments
  // (deposits fold into amount_paid_cents) — or, before a bill exists, the
  // job's collected deposit. Every ask below quotes the BALANCE, never the
  // face total: "how is the customer paying $2,100" on a job with $520 down
  // was Sebastian's headline bug, and a face-total cash prefill invites
  // verifying money that isn't owed.
  const creditCents = summary
    ? Math.min(summary.amount_paid_cents, billedCents)
    : job.deposit_paid_at
      ? Math.min(job.deposit_cents, billedCents)
      : 0;
  const dueCents = Math.max(0, billedCents - creditCents);
  const [cashAmount, setCashAmount] = useState<string>((dueCents / 100).toFixed(2));
  const refreshSummary = (id: string | null = invoiceId) => {
    if (!id) return;
    getInvoiceSummaryAction(id).then((s) => {
      if (!s) return;
      setSummary(s);
      setCashAmount((Math.max(0, s.total_cents - s.amount_paid_cents) / 100).toFixed(2));
    });
  };

  const status = job.status;

  // ── Paid: the terminal happy state ──────────────────────────────────────────
  if (status === "paid") {
    const paid = summary?.amount_paid_cents ?? billedCents;
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
        <ExpensesPanel jobId={job.id} revenueCents={paid} />
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
            Invoice {summary?.number ?? ""} sent — awaiting card payment ({fmtMoney(dueCents)}
            {creditCents > 0 ? " balance" : ""}).
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
        {/* Claims arrive here too — approve/decline without leaving the sheet. */}
        {invoiceId && (
          <RewardManager
            invoiceId={invoiceId}
            invoiceStatus={summary?.status ?? "sent"}
            onChanged={refreshSummary}
          />
        )}
        <ExpensesPanel jobId={job.id} revenueCents={billedCents} />
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
                  refreshSummary(res.invoiceId);
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
            How is the customer paying {fmtMoney(dueCents)}?
          </p>
          {creditCents > 0 && (
            <p className="tabular-nums text-[12px] text-[var(--cp-muted)]">
              {fmtMoney(billedCents)} − {fmtMoney(creditCents)} already collected.
            </p>
          )}
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
          {/* Review rewards riding on this bill — uncheck for a shaky client
              BEFORE texting the invoice (0012). */}
          {invoiceId && (
            <RewardManager
              invoiceId={invoiceId}
              invoiceStatus={summary?.status ?? "draft"}
              onChanged={refreshSummary}
            />
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
      <ExpensesPanel jobId={job.id} revenueCents={billedCents} />
    </div>
  );
}

// Self-contained expenses section: loads the job's expenses on mount and after
// each mutation via listJobExpensesAction, so it never threads state through the
// job sheet. Works in demo (the read returns fixtures; the writes no-op with a
// notice). Margin = revenue collected/billed on this job minus total expenses.
function ExpensesPanel({ jobId, revenueCents }: { jobId: string; revenueCents: number }) {
  const [expenses, setExpenses] = useState<JobExpense[]>([]);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  function reload() {
    listJobExpensesAction(jobId).then(setExpenses);
  }
  useEffect(() => {
    listJobExpensesAction(jobId).then(setExpenses);
  }, [jobId]);

  const totalExpensesCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const marginCents = revenueCents - totalExpensesCents;
  const amountCents = toCents(amount);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await addJobExpense({ jobId, amountCents, category, note: note.trim() || undefined });
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) {
        setAmount("");
        setNote("");
        reload();
      }
    });
  }

  function remove(id: string) {
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteJobExpense(id);
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) reload();
    });
  }

  return (
    <div className="cp-divider mt-4 pt-3 space-y-2.5">
      <p className="cp-label flex items-center gap-1.5">
        <Receipt size={13} strokeWidth={2} /> Expenses
      </p>

      {expenses.length > 0 && (
        <ul className="space-y-1.5">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="font-medium">{e.category}</span>
                {e.note && <span className="truncate text-[12px] text-[var(--cp-faint)]">{e.note}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="tabular-nums font-semibold">{fmtMoney(e.amount_cents)}</span>
                <button
                  type="button"
                  className="cp-btn cp-btn-ghost cp-btn-danger cp-btn-sm"
                  disabled={isPending}
                  onClick={() => remove(e.id)}
                  aria-label="Remove expense"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Margin: what actually stayed after costs on this job. */}
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-[var(--cp-muted)]">
          Margin <span className="text-[var(--cp-faint)]">({fmtMoney(revenueCents)} − {fmtMoney(totalExpensesCents)})</span>
        </span>
        <span
          className="tabular-nums font-semibold"
          style={{ color: marginCents >= 0 ? "var(--cp-good)" : "var(--cp-warn)" }}
        >
          {fmtMoney(marginCents)}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[92px]">
          <label className="cp-label" htmlFor="cp-expense-amount">
            Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
              $
            </span>
            <input
              id="cp-expense-amount"
              className="cp-input tabular-nums"
              // Inline for the $ prefix room — matches CashPanel's amount field.
              style={{ paddingLeft: 24 }}
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
            />
          </div>
        </div>
        <div className="min-w-[120px] flex-1">
          <label className="cp-label" htmlFor="cp-expense-category">
            Category
          </label>
          <select
            id="cp-expense-category"
            className="cp-select"
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <input
        className="cp-input"
        placeholder="Note (optional)"
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
      />
      <button
        type="button"
        className="cp-btn cp-btn-sm"
        disabled={isPending || amountCents <= 0}
        onClick={submit}
      >
        <Plus size={14} strokeWidth={2} /> Add expense
      </button>

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
            className="cp-input tabular-nums"
            // Inline because .cp-input's padding is unlayered CSS and beats
            // Tailwind's pl-*; the $ prefix needs the extra room.
            style={{ paddingLeft: 24 }}
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
