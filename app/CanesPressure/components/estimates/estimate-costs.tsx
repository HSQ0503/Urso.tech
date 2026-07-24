"use client";

import { useEffect, useState, useTransition } from "react";
import { Receipt, Trash2 } from "lucide-react";
import {
  addEstimateExpense,
  deleteEstimateExpense,
  listEstimateExpensesAction,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import { fmtMoney, type EstimateExpense } from "@/lib/canes/types";

// Projected costs on an estimate (0014) — Sebastian's "track expenses when I
// make an estimate" ask. Mirrors the job sheet's ExpensesPanel: loads on
// mount, mutates via actions, shows the projected margin against the quote
// total. Approval copies these rows onto the job's real expense sheet.

const CATEGORIES = ["Materials", "Gas / travel", "Dump fee", "Subcontractor", "Equipment", "Other"];

type Feedback = { ok: boolean; text: string } | null;

function toCents(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function EstimateCosts({
  estimateId,
  totalCents,
  readOnly = false,
}: {
  estimateId: string;
  // Pre-tax revenue (total − tax): tax is pass-through, never margin.
  totalCents: number;
  // Approved estimates already copied their costs onto the job — the record
  // stays visible here, but new rows belong on the job's expense sheet.
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<EstimateExpense[]>([]);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listEstimateExpensesAction(estimateId).then(setRows);
  }, [estimateId]);
  const reload = () => listEstimateExpensesAction(estimateId).then(setRows);

  const costCents = rows.reduce((sum, e) => sum + e.amount_cents, 0);
  const marginCents = totalCents - costCents;
  const amountCents = toCents(amount);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res: ActionResult = await addEstimateExpense({
        estimateId,
        amountCents,
        category,
        note: note.trim() || undefined,
      });
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
      const res = await deleteEstimateExpense(id);
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) reload();
    });
  }

  return (
    <section className="cp-card mt-4 space-y-2.5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <Receipt size={15} strokeWidth={2} /> Projected costs
        </h2>
        <p
          className={`text-[13.5px] font-semibold tabular-nums ${
            marginCents < 0 ? "text-[var(--cp-warn)]" : "text-[var(--cp-good)]"
          }`}
        >
          Margin {fmtMoney(marginCents)}
        </p>
      </div>
      <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
        {readOnly
          ? "Copied onto the job's expense sheet at approval — add new costs on the job itself."
          : "What this work should cost you — approval copies these onto the job's expense sheet."}
      </p>

      {rows.length > 0 && (
        <ul className="divide-y divide-[var(--cp-line)]">
          {rows.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <span className="font-medium">{e.category}</span>
                {e.note && <span className="text-[var(--cp-muted)]"> · {e.note}</span>}
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                {fmtMoney(e.amount_cents)}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="cp-icon-btn shrink-0"
                  aria-label="Remove cost"
                  disabled={isPending}
                  onClick={() => remove(e.id)}
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <>
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
                $
              </span>
              <input
                className="cp-input tabular-nums"
                style={{ paddingLeft: 24 }}
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <select className="cp-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <input
            className="cp-input"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="cp-btn cp-btn-sm"
            disabled={isPending || amountCents <= 0}
            onClick={submit}
          >
            {isPending ? "Saving..." : "Add cost"}
          </button>
        </>
      )}
      {feedback && (
        <p
          className={`text-[12.5px] leading-snug ${
            feedback.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
