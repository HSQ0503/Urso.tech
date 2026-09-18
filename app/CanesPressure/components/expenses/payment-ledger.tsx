"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, type ExpenseLedger, type ExpenseRule } from "@urso/types";
import {
  editExpenseOccurrence,
  addExpenseEmployee,
  recordEmployeePayment,
  updateExpenseRule,
} from "@/app/CanesPressure/expense-actions";

export function PaymentLedger({ ledger }: { ledger: ExpenseLedger }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; notice?: string }>) =>
    start(async () => {
      const result = await fn();
      setNotice(
        result.notice ?? (result.ok ? "Saved." : "The change was not saved."),
      );
      if (result.ok) router.refresh();
    });
  return (
    <section className="space-y-4">
      {notice ? (
        <p role="status" className="cp-card p-3">
          {notice}
        </p>
      ) : null}
      <details className="cp-card p-5">
        <summary className="cursor-pointer text-lg font-semibold">
          Employee payments
        </summary>
        <p className="my-3 text-sm">
          Record money already paid. Each payment counts once as a Labor
          expense.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {ledger.employees.map((employee) => (
            <div key={employee.id} className="rounded-lg border p-3">
              <strong>{employee.name}</strong>
              <p>This month: {fmtMoney(employee.monthCents)}</p>
              <p>All time: {fmtMoney(employee.allTimeCents)}</p>
            </div>
          ))}
        </div>
        <form
          className="my-5 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const key = requestKey ?? crypto.randomUUID();
            setRequestKey(key);
            run(async () => {
              const result = await recordEmployeePayment({
                employeeId: String(data.get("employee")),
                amountCents: Math.round(Number(data.get("amount")) * 100),
                paidOn: String(data.get("date")),
                method: String(data.get("method")),
                note: String(data.get("note") ?? ""),
                requestKey: key,
              });
              if (result.ok) {
                form.reset();
                setRequestKey(null);
              }
              return result;
            });
          }}
        >
          <label>
            Employee
            <select required name="employee" className="cp-input">
              {ledger.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount paid ($)
            <input
              required
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              className="cp-input"
            />
          </label>
          <label>
            Payment date
            <input required name="date" type="date" className="cp-input" />
          </label>
          <label>
            Method
            <select name="method" className="cp-input">
              {["cash", "check", "bank", "card", "other"].map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            Note
            <input name="note" className="cp-input" />
          </label>
          <button
            disabled={busy || !ledger.employees.length}
            className="cp-btn cp-btn-primary"
          >
            Record payment
          </button>
        </form>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const name = String(new FormData(form).get("name") ?? "");
            run(async () => {
              const result = await addExpenseEmployee(name);
              if (result.ok) form.reset();
              return result;
            });
          }}
        >
          <label className="flex-1">
            New employee
            <input name="name" required className="cp-input" />
          </label>
          <button disabled={busy} className="cp-btn self-end">
            Add employee
          </button>
        </form>
        <h3 className="mt-6 font-semibold">Recent payments</h3>
        {ledger.entries
          .filter((entry) => entry.employee_id && !entry.skipped)
          .map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap justify-between gap-3 border-b py-3"
            >
              <span>
                {entry.incurred_on} · {entry.name}
                <small className="block">
                  {entry.payment_method}
                  {entry.note ? ` · ${entry.note}` : ""}
                </small>
              </span>
              <strong>{fmtMoney(entry.amount_cents)}</strong>
            </div>
          ))}
      </details>
      <details className="cp-card p-5">
        <summary className="cursor-pointer text-lg font-semibold">
          Edit dated expenses
        </summary>
        {ledger.entries
          .filter((entry) => !entry.employee_id)
          .map((entry) => (
            <form
              key={`${entry.id}:${entry.amount_cents}:${entry.skipped}`}
              className="my-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  editExpenseOccurrence(entry.id, {
                    amountCents: Math.round(Number(data.get("amount")) * 100),
                    note: String(data.get("note") ?? ""),
                  }),
                );
              }}
            >
              <h3 className="sm:col-span-3">
                {entry.incurred_on} · {entry.name}
                {entry.skipped ? " · Skipped" : ""}
              </h3>
              <label>
                Amount ($)
                <input
                  className="cp-input"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={(entry.amount_cents / 100).toFixed(2)}
                  required
                />
              </label>
              <label>
                Note
                <input
                  className="cp-input"
                  name="note"
                  defaultValue={entry.note ?? ""}
                />
              </label>
              <button className="cp-btn" disabled={busy}>
                Save this entry
              </button>
              <button
                className="cp-btn"
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    editExpenseOccurrence(entry.id, {
                      skipped: !entry.skipped,
                    }),
                  )
                }
              >
                {entry.skipped ? "Restore this entry" : "Skip this entry"}
              </button>
            </form>
          ))}
      </details>
      <details className="cp-card p-5">
        <summary className="cursor-pointer text-lg font-semibold">
          Recurring expense rules
        </summary>
        <p className="my-3 text-sm">
          Each rule creates a dated expense. Pausing or ending it keeps earlier
          entries.
        </p>
        {ledger.rules.map((rule) => (
          <RuleForm
            key={`${rule.id}:${rule.next_due_on}:${rule.amount_cents}:${rule.active}`}
            rule={rule}
            busy={busy}
            run={run}
          />
        ))}
      </details>
    </section>
  );
}

function RuleForm({
  rule,
  busy,
  run,
}: {
  rule: ExpenseRule;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; notice?: string }>) => void;
}) {
  return (
    <form
      className="my-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() =>
          updateExpenseRule(rule.id, {
            amountCents: Math.round(Number(data.get("amount")) * 100),
            nextDueOn: String(data.get("date")),
            endsOn: String(data.get("end") ?? "") || null,
          }),
        );
      }}
    >
      <h3 className="font-semibold sm:col-span-3">
        {rule.name} · {rule.frequency} · {rule.active ? "Active" : "Paused"}
      </h3>
      <label>
        Future amount ($)
        <input
          className="cp-input"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={(rule.amount_cents / 100).toFixed(2)}
          required
        />
      </label>
      <label>
        Next date
        <input
          className="cp-input"
          name="date"
          type="date"
          defaultValue={rule.next_due_on}
          required
        />
      </label>
      <label>
        End date
        <input
          className="cp-input"
          name="end"
          type="date"
          defaultValue={rule.ends_on ?? ""}
        />
      </label>
      <button disabled={busy} className="cp-btn cp-btn-primary">
        Save future expenses
      </button>
      <button
        type="button"
        disabled={busy}
        className="cp-btn"
        onClick={() =>
          run(() => updateExpenseRule(rule.id, { active: !rule.active }))
        }
      >
        {rule.active ? "Pause" : "Resume"}
      </button>
    </form>
  );
}
