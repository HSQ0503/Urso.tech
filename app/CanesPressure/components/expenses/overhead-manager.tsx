"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { addBusinessExpense, deleteBusinessExpense } from "@/app/CanesPressure/actions";
import { fmtEt, fmtMoney, type BusinessExpense, type ExpenseFrequency } from "@/lib/canes/types";

// Section 1 of the Expenses tab: Sebastian's own overhead. Lists the business
// expenses (subscriptions, insurance, truck, marketing) with a delete control
// and a prominent add form that can make a cost recurring. The list arrives as a
// prop from the server page and re-reads via router.refresh() after each write,
// so the monthly-overhead headline upstairs stays in sync. Works in demo — the
// actions no-op with a friendly notice and the fixtures still render.

const OVERHEAD_CATEGORIES = [
  "Software",
  "Insurance",
  "Truck / vehicle",
  "Marketing",
  "Equipment",
  "Rent",
  "Phone",
  "Other",
];

type Feedback = { ok: boolean; text: string } | null;

// "$1,240.00" / "1240" → integer cents. NaN → 0.
function toCents(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isOneTime(e: BusinessExpense): boolean {
  return !e.recurring || e.frequency === "one_time";
}

function amountSuffix(e: BusinessExpense): string {
  if (isOneTime(e)) return "";
  return e.frequency === "yearly" ? "/yr" : "/mo";
}

function FreqChip({ expense }: { expense: BusinessExpense }) {
  if (isOneTime(expense)) {
    return <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-faint)]">One-time</span>;
  }
  if (expense.frequency === "yearly") {
    return <span className="cp-chip bg-[var(--cp-cold-bg)] text-[var(--cp-cold)]">Yearly</span>;
  }
  return <span className="cp-chip bg-[var(--cp-brand-soft)] text-[var(--cp-brand-deep)]">Monthly</span>;
}

function Notice({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p className={`text-[12.5px] leading-snug ${value.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"}`}>
      {value.text}
    </p>
  );
}

export function OverheadManager({ expenses }: { expenses: BusinessExpense[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(OVERHEAD_CATEGORIES[0]);
  const [recurring, setRecurring] = useState(true);
  const [frequency, setFrequency] = useState<Exclude<ExpenseFrequency, "one_time">>("monthly");
  const [note, setNote] = useState("");

  const amountCents = toCents(amount);
  const canAdd = name.trim().length > 0 && amountCents > 0;

  function submit() {
    if (!canAdd) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await addBusinessExpense({
        name: name.trim(),
        amountCents,
        category,
        recurring,
        frequency: recurring ? frequency : "one_time",
        note: note.trim() || undefined,
      });
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) {
        setName("");
        setAmount("");
        setNote("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteBusinessExpense(id);
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The logged expenses */}
      <div className="cp-card overflow-hidden rounded-xl md:rounded-md">
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
            <Repeat size={20} strokeWidth={2} className="text-[var(--cp-faint)]" />
            <p className="text-[14px] font-semibold">No business expenses yet</p>
            <p className="text-[13px] text-[var(--cp-muted)]">
              Add your first subscription, insurance, or truck cost below to see your true monthly overhead.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--cp-line)]">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{e.name}</span>
                    <FreqChip expense={e} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[var(--cp-muted)]">
                    {e.category}
                    {isOneTime(e) && (
                      <span className="text-[var(--cp-faint)]">
                        {" · "}
                        {fmtEt(`${e.incurred_on}T12:00:00Z`, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </p>
                  {e.note && (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--cp-faint)]">{e.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap text-right text-[14px] font-semibold tabular-nums">
                    {fmtMoney(e.amount_cents)}
                    {amountSuffix(e) && (
                      <span className="ml-0.5 text-[12px] font-normal text-[var(--cp-faint)]">
                        {amountSuffix(e)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="cp-btn cp-btn-ghost cp-btn-danger cp-btn-sm"
                    disabled={isPending}
                    onClick={() => remove(e.id)}
                    aria-label={`Remove ${e.name}`}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add expense */}
      <div className="cp-card rounded-xl p-4 md:rounded-md">
        <p className="cp-label flex items-center gap-1.5">
          <Plus size={13} strokeWidth={2} /> Add expense
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="cp-label" htmlFor="oe-name">
              Name
            </label>
            <input
              id="oe-name"
              className="cp-input"
              placeholder="Insurance, truck payment, software..."
              value={name}
              onChange={(ev) => setName(ev.target.value)}
            />
          </div>

          <div>
            <label className="cp-label" htmlFor="oe-amount">
              Amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
                $
              </span>
              <input
                id="oe-amount"
                className="cp-input tabular-nums"
                // Inline padding for the $ prefix — .cp-input's padding beats pl-*.
                style={{ paddingLeft: 24 }}
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="cp-label" htmlFor="oe-category">
              Category
            </label>
            <select
              id="oe-category"
              className="cp-select"
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
            >
              {OVERHEAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-[13.5px] font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--cp-brand)]"
                checked={recurring}
                onChange={(ev) => setRecurring(ev.target.checked)}
              />
              Recurring — repeats every period
            </label>
          </div>

          {recurring && (
            <div>
              <label className="cp-label" htmlFor="oe-frequency">
                Frequency
              </label>
              <select
                id="oe-frequency"
                className="cp-select"
                value={frequency}
                onChange={(ev) => setFrequency(ev.target.value as "monthly" | "yearly")}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="cp-label" htmlFor="oe-note">
              Note (optional)
            </label>
            <input
              id="oe-note"
              className="cp-input"
              placeholder="Policy number, plan, anything worth remembering"
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="cp-btn cp-btn-primary w-full sm:w-auto"
            disabled={isPending || !canAdd}
            onClick={submit}
          >
            <Plus size={16} strokeWidth={2} />
            {isPending ? "Saving..." : "Add expense"}
          </button>
          <Notice value={feedback} />
        </div>
      </div>
    </div>
  );
}
