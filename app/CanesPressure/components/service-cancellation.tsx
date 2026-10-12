"use client";
import { useEffect, useState, useTransition } from "react";
import { fmtMoney, fmtEt } from "@urso/types";
import type { CancellationView } from "@/lib/canes/service-agreements";
import {
  confirmServiceCancellation,
  loadServiceCancellation,
} from "../service-customer-actions";

export function ServiceCancellation() {
  const [token, setToken] = useState(""),
    [view, setView] = useState<CancellationView | null>(null),
    [notice, setNotice] = useState("Loading your agreement…"),
    [done, setDone] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [pending, start] = useTransition();
  useEffect(() => {
    let current = true;
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    void loadServiceCancellation(value)
      .then((result) => {
        if (!current) return;
        setToken(value);
        if (result.ok) {
          setView(result.data);
          setNotice("");
          setDone(result.data.state === "canceled");
        } else setNotice(result.notice);
      })
      .catch(() => {
        if (current)
          setNotice("Your agreement could not load. Refresh or contact Canes.");
      });
    return () => {
      current = false;
    };
  }, []);
  const cancel = (mode: "now" | "after_next") =>
    start(async () => {
      if (!view) return;
      try {
        const result = await confirmServiceCancellation({
          token,
          mode,
          expectedFeeCents: view.feeCents,
          expectedFinalDue: view.finalDue,
        });
        setNotice(result.notice);
        if (result.ok) setDone(true);
      } catch {
        setNotice(
          "The response was interrupted. Refresh to check the cancellation before confirming again.",
        );
      }
    });
  return (
    <div className="space-y-5">
      <h1 className="cp-display text-3xl">Manage your service</h1>
      {view ? (
        <>
          <p className="text-sm">
            {view.customerName} · {view.serviceName}
          </p>
          {done ? (
            <p className="cp-card p-4 text-sm">
              {view.state === "canceled"
                ? "This service agreement is canceled."
                : "Your cancellation choice has been recorded."}
            </p>
          ) : (
            <>
              <section className="cp-card space-y-2 p-4">
                <h2 className="font-semibold">Cancel now</h2>
                <p className="text-sm">
                  Stop future service. Amount due under the original signup
                  terms: <strong>{fmtMoney(view.feeCents)}</strong>.
                </p>
                <p className="text-sm text-[var(--cp-muted)]">
                  Any completed work remains payable. Cancellation stays in
                  effect if a payment fails.
                </p>
              </section>
              <section className="cp-card space-y-2 p-4">
                <h2 className="font-semibold">Cancel after the next service</h2>
                <p className="text-sm">
                  Keep one final service at {fmtMoney(view.recurringCents)}{" "}
                  before applicable tax. No signup-discount repayment or $50
                  fee.
                </p>
                <p className="text-sm">
                  Contractual due date: {view.finalDue}.{" "}
                  {view.finalScheduledAt
                    ? `Appointment: ${fmtEt(view.finalScheduledAt)}.`
                    : "Canes will confirm the appointment."}
                </p>
                <p className="text-sm text-[var(--cp-muted)]">
                  Service ends when that visit is completed, even if its invoice
                  still needs payment.
                </p>
              </section>
              <details className="cp-card p-4">
                <summary className="cursor-pointer font-semibold">
                  Your accepted terms
                </summary>
                <p className="mt-3 text-sm leading-6">{view.terms}</p>
              </details>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  I have reviewed these amounts and authorize the option I
                  choose below.
                </span>
              </label>
              <button
                className="cp-btn cp-btn-primary min-h-12 w-full"
                disabled={!acknowledged || pending}
                onClick={() => cancel("now")}
              >
                {pending
                  ? "Saving…"
                  : `Cancel now · ${fmtMoney(view.feeCents)}`}
              </button>
              <button
                className="cp-btn min-h-12 w-full"
                disabled={!acknowledged || pending}
                onClick={() => cancel("after_next")}
              >
                Keep one final service, then cancel
              </button>
            </>
          )}
        </>
      ) : null}
      {notice ? (
        <p role="status" className="cp-card p-4 text-sm">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
