"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, paymentNetCents, type InvoiceWithItems } from "@urso/types";
import {
  applyCustomerCredit,
  customerCreditSources,
  recordManualRefund,
} from "@/app/CanesPressure/document-actions";

export function PaymentCorrections({ invoice }: { invoice: InvoiceWithItems }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [credits, setCredits] = useState<
    { id: string; number: string; availableCents: number }[]
  >([]);
  const [key, setKey] = useState<string | null>(null);
  return (
    <details
      className="cp-card my-5 p-5"
      onToggle={(event) => {
        if (event.currentTarget.open)
          start(async () => {
            const result = await customerCreditSources(invoice.id);
            if (result.ok) setCredits(result.data);
            else setNotice(result.notice);
          });
      }}
    >
      <summary className="cursor-pointer font-semibold">
        Customer credits & refunds
      </summary>
      {invoice.credits?.map((entry) => (
        <p key={entry.id} className="my-3">
          Credit {entry.direction === "in" ? "from" : "to"} {entry.otherNumber}:{" "}
          {fmtMoney(entry.amountCents)}
          {entry.reversedCents
            ? ` · reversed ${fmtMoney(entry.reversedCents)}`
            : ""}
        </p>
      ))}
      {notice ? (
        <p role="status" className="my-3">
          {notice}
        </p>
      ) : null}
      {invoice.amount_paid_cents > invoice.total_cents ? (
        <p className="my-3">
          Customer credit on this invoice:{" "}
          {fmtMoney(invoice.amount_paid_cents - invoice.total_cents)}. Apply it
          from a later invoice or record a refund.
        </p>
      ) : null}
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const selection = String(data.get("source"));
          const request = key ?? crypto.randomUUID();
          setKey(request);
          const amount = Math.round(Number(data.get("amount")) * 100);
          if (
            !confirm(
              selection.startsWith("refund:")
                ? "Record money you have already returned? This does not transfer money."
                : "Apply existing customer credit to this invoice?",
            )
          )
            return;
          start(async () => {
            const result = selection.startsWith("refund:")
              ? await recordManualRefund(selection.slice(7), amount, request)
              : await applyCustomerCredit(
                  selection.slice(7),
                  invoice.id,
                  amount,
                  request,
                );
            setNotice(result.notice ?? "Saved.");
            if (result.ok) {
              form.reset();
              setKey(null);
              router.refresh();
            }
          });
        }}
      >
        <label>
          Action
          <select
            name="source"
            required
            className="cp-input"
            onChange={() => setKey(null)}
          >
            <option value="">Choose a credit or manual payment</option>
            {credits.map((credit) => (
              <option key={credit.id} value={`credit:${credit.id}`}>
                Credit from {credit.number}: {fmtMoney(credit.availableCents)}
              </option>
            ))}
            {invoice.payments
              .filter(
                (payment) =>
                  payment.source === "manual" &&
                  !payment.square_payment_id &&
                  paymentNetCents(payment) > 0,
              )
              .map((payment) => (
                <option key={payment.id} value={`refund:${payment.id}`}>
                  Refund already paid: {fmtMoney(paymentNetCents(payment))}{" "}
                  available
                </option>
              ))}
          </select>
        </label>
        <label>
          Amount ($)
          <input
            name="amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            className="cp-input"
          />
        </label>
        <button disabled={busy} className="cp-btn cp-btn-primary">
          Review and confirm
        </button>
      </form>
      <a
        className="cp-btn mt-4"
        href="https://squareup.com/dashboard/sales/transactions"
        target="_blank"
        rel="noreferrer"
      >
        Open Square for card refunds
      </a>
    </details>
  );
}
