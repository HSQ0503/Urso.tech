"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  SERVICE_CADENCES,
  fmtMoney,
  serviceCycleDate,
  serviceDiscount,
  type ServiceCadence,
  type ServiceEnrollmentOffer,
} from "@urso/types";
import {
  acceptServiceEnrollment,
  restartPendingEnrollment,
  resumeServiceEnrollmentPayment,
} from "../service-customer-actions";

type Card = {
  attach(selector: string): Promise<void>;
  tokenize(
    details: Record<string, unknown>,
  ): Promise<{
    status: string;
    token?: string;
    errors?: { message?: string }[];
  }>;
  destroy(): Promise<void>;
};
type SquareSdk = {
  payments(
    applicationId: string,
    locationId: string,
  ): { card(): Promise<Card> };
};
type Configuration = {
  applicationId: string;
  locationId: string;
  scriptUrl: string;
};

export function ServiceEnrollmentForm({
  token,
  offer,
  configuration,
  terms,
  recovery,
}: {
  token: string;
  offer: ServiceEnrollmentOffer;
  configuration: Configuration | null;
  terms: string;
  recovery?: {
    cardSaved: boolean;
    cardLabel: string | null;
    name: string;
    email: string;
    choices: { serviceLineId: string; months: number }[];
  } | null;
}) {
  const [choices, setChoices] = useState<Record<string, ServiceCadence | 0>>(
    () =>
      Object.fromEntries(
        (recovery?.choices ?? []).map((choice) => [
          choice.serviceLineId,
          choice.months as ServiceCadence,
        ]),
      ),
  );
  const [name, setName] = useState(recovery?.name ?? offer.customerName),
    [email, setEmail] = useState(recovery?.email ?? offer.email);
  const [acceptTerms, setAcceptTerms] = useState(false),
    [acceptAutopay, setAcceptAutopay] = useState(false);
  const [sdkReady, setSdkReady] = useState(false),
    [cardReady, setCardReady] = useState(false),
    [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const card = useRef<Card | null>(null),
    request = useRef<string | null>(null);
  useEffect(() => {
    if (!sdkReady || !configuration || recovery?.cardSaved) return;
    let disposed = false;
    let current: Card | null = null;
    const setup = async () => {
      const sdk = (window as unknown as { Square?: SquareSdk }).Square;
      if (!sdk) throw new Error("Secure card entry could not load.");
      current = await sdk
        .payments(configuration.applicationId, configuration.locationId)
        .card();
      if (disposed) {
        await current.destroy();
        return;
      }
      await current.attach("#canes-recurring-card");
      if (disposed) {
        await current.destroy();
        return;
      }
      card.current = current;
      setCardReady(true);
    };
    void setup().catch(() =>
      setNotice(
        "Secure card entry is unavailable. Reload this page or contact Canes; no payment was requested.",
      ),
    );
    return () => {
      disposed = true;
      card.current = null;
      setCardReady(false);
      void current?.destroy();
    };
  }, [sdkReady, configuration, recovery?.cardSaved]);
  const selected = offer.lines.flatMap((line) => {
    const months = choices[line.serviceLineId];
    return months && line.eligible
      ? [{ ...line, months, ...serviceDiscount(line.originalNetCents, months) }]
      : [];
  });
  const saving = selected.reduce((sum, line) => sum + line.savingsCents, 0);
  const nextTax = Math.round(
    ((offer.taxableSubtotalCents -
      selected
        .filter((line) => line.taxable)
        .reduce((sum, line) => sum + line.savingsCents, 0)) *
      offer.taxRateBps) /
      10000,
  );
  const total = offer.totalCents - saving + nextTax - offer.taxCents,
    balance = total - offer.paidCents;
  const ready =
    selected.length > 0 &&
    balance >= 0 &&
    acceptTerms &&
    acceptAutopay &&
    name.trim().length > 1 &&
    email.includes("@") &&
    (cardReady || recovery?.cardSaved === true);
  return (
    <div className="space-y-5">
      {configuration ? (
        <Script
          src={configuration.scriptUrl}
          onReady={() => setSdkReady(true)}
          onError={() => setNotice("Secure card entry could not load.")}
        />
      ) : null}
      <div>
        <h1 className="cp-display text-3xl">Make it recurring</h1>
        <p className="mt-2 text-sm text-[var(--cp-muted)]">
          {offer.invoiceNumber} · {offer.jobAddress}
          <br />
          Original service completed {offer.serviceDate}
        </p>
      </div>
      <p className="text-sm">
        Choose a schedule for each service you want to repeat. The recurring
        price stays fixed for the same scope.
      </p>
      {offer.lines
        .filter((line) => line.eligible)
        .map((line) => (
          <section key={line.serviceLineId} className="cp-card space-y-3 p-4">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">{line.name}</h2>
              <span className="tabular-nums">
                {fmtMoney(line.originalNetCents)}
              </span>
            </div>
            {line.description ? (
              <p className="text-sm text-[var(--cp-muted)]">
                {line.description}
              </p>
            ) : null}
            <label className="cp-label">
              Repeat schedule
              <select
                className="cp-select mt-1"
                value={choices[line.serviceLineId] ?? 0}
                disabled={pending || Boolean(recovery)}
                onChange={(event) =>
                  setChoices({
                    ...choices,
                    [line.serviceLineId]: Number(event.target.value) as
                      | ServiceCadence
                      | 0,
                  })
                }
              >
                <option value={0}>Keep this service one-time</option>
                {SERVICE_CADENCES.map((cadence) => (
                  <option key={cadence.months} value={cadence.months}>
                    {cadence.label}
                  </option>
                ))}
              </select>
            </label>
            {selected
              .filter((choice) => choice.serviceLineId === line.serviceLineId)
              .map((choice) => (
                <div key={choice.serviceLineId} className="space-y-1 text-sm">
                  <p>
                    Save {fmtMoney(choice.savingsCents)} on this invoice. Future
                    service: <strong>{fmtMoney(choice.recurringCents)}</strong>{" "}
                    before applicable tax, every {choice.months} months.
                  </p>
                  <p>
                    Next due{" "}
                    {serviceCycleDate(offer.serviceDate, choice.months, 1)}.
                    Canes will confirm the appointment.
                  </p>
                  <p className="text-[var(--cp-muted)]">
                    Cancel before the first completed and paid repeat:{" "}
                    {fmtMoney(choice.savingsCents)} signup savings + $50 ={" "}
                    {fmtMoney(choice.savingsCents + 5000)}. Or keep one final
                    service and cancel afterward with no early-cancellation fee.
                  </p>
                </div>
              ))}
          </section>
        ))}
      <section className="cp-card space-y-2 p-4 text-sm">
        <div className="flex justify-between">
          <span>Original invoice</span>
          <span>{fmtMoney(offer.totalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Service savings</span>
          <span>−{fmtMoney(saving)}</span>
        </div>
        <div className="flex justify-between">
          <span>Revised invoice, including tax</span>
          <span>{fmtMoney(total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Already paid</span>
          <span>{fmtMoney(offer.paidCents)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--cp-line)] pt-2 font-semibold">
          <span>Pay now</span>
          <span>{fmtMoney(Math.max(0, balance))}</span>
        </div>
        {balance < 0 ? (
          <p className="text-[var(--cp-warn)]">
            This would create an overpayment. Contact Canes to review a credit
            or refund before enrolling.
          </p>
        ) : null}
      </section>
      <label className="cp-label block">
        Full name
        <input
          className="cp-input mt-1"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending || Boolean(recovery)}
        />
      </label>
      <label className="cp-label block">
        Email for invoices and receipts
        <input
          className="cp-input mt-1"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending || Boolean(recovery)}
        />
      </label>
      <section className="cp-card space-y-3 p-4">
        <h2 className="font-semibold">Secure card setup</h2>
        {recovery?.cardSaved ? (
          <p className="text-sm">
            Verified saved card: {recovery.cardLabel}. Resume the same
            enrollment below.
          </p>
        ) : null}
        {!recovery?.cardSaved ? (
          <div
            id="canes-recurring-card"
            className="min-h-24 rounded bg-white p-3"
          />
        ) : null}
        {!configuration ? (
          <p className="text-sm">
            Card setup is temporarily unavailable. Contact Canes before
            enrolling.
          </p>
        ) : null}
        <p className="text-xs text-[var(--cp-muted)]">
          Square securely stores the card. Canes does not receive your card
          number or security code.
        </p>
      </section>
      <details className="cp-card p-4">
        <summary className="cursor-pointer font-semibold">
          Recurring service terms
        </summary>
        <p className="mt-3 whitespace-pre-line text-sm leading-6">{terms}</p>
      </details>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0"
          checked={acceptTerms}
          onChange={(event) => setAcceptTerms(event.target.checked)}
          disabled={pending}
        />
        <span>
          I accept the selected services, recurring prices, schedule and
          cancellation terms shown above.
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0"
          checked={acceptAutopay}
          onChange={(event) => setAcceptAutopay(event.target.checked)}
          disabled={pending}
        />
        <span>
          I authorize Square to store my card, collect the current balance of{" "}
          {fmtMoney(Math.max(0, balance))}, and collect agreed future services
          after completion and invoice finalization, plus any cancellation
          charge authorized by these terms.
        </span>
      </label>
      {notice ? (
        <p role="status" className="cp-card p-4 text-sm">
          {notice}
        </p>
      ) : null}
      <button
        className="cp-btn cp-btn-primary min-h-12 w-full"
        disabled={!ready || pending}
        onClick={() =>
          start(async () => {
            setNotice("");
            request.current ??= crypto.randomUUID();
            try {
              const [givenName, ...familyName] = name.trim().split(/\s+/);
              const tokenized = recovery?.cardSaved
                ? { status: "OK", token: "saved" }
                : await card.current?.tokenize({
                    intent: "STORE",
                    customerInitiated: true,
                    sellerKeyedIn: false,
                    billingContact: {
                      givenName,
                      familyName: familyName.join(" "),
                      email: email.trim(),
                      countryCode: "US",
                    },
                    currencyCode: "USD",
                  });
              if (tokenized?.status !== "OK" || !tokenized.token) {
                setNotice(
                  "Your card could not be verified. Check its details and try again.",
                );
                return;
              }
              const result = await acceptServiceEnrollment({
                token,
                revision: offer.revision,
                name,
                email,
                choices: selected.map((line) => ({
                  serviceLineId: line.serviceLineId,
                  months: line.months,
                })),
                sourceId: tokenized.token,
                requestKey: request.current,
                acceptTerms,
                acceptAutopay,
              });
              setNotice(result.notice);
              if (result.ok) window.location.reload();
            } catch {
              setNotice(
                "The response was interrupted. Refresh this page to check the enrollment before trying again.",
              );
            }
          })
        }
      >
        {pending
          ? "Verifying and submitting…"
          : `Accept & pay ${fmtMoney(Math.max(0, balance))}`}
      </button>
      {recovery ? (
        <button
          className="cp-btn min-h-11 w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await restartPendingEnrollment(token);
              setNotice(result.notice);
              if (result.ok) window.location.reload();
            })
          }
        >
          Replace this unfinished enrollment
        </button>
      ) : null}
      <Link
        className="cp-btn min-h-11 w-full"
        href={`/CanesPressure/i/${token}`}
      >
        Keep the invoice one-time
      </Link>
    </div>
  );
}

export function ResumeServicePayment({ token }: { token: string }) {
  const [pending, start] = useTransition(),
    [notice, setNotice] = useState("");
  return (
    <div className="space-y-3">
      <button
        className="cp-btn cp-btn-primary min-h-11"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await resumeServiceEnrollmentPayment(token);
            setNotice(result.notice);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Checking…" : "Check enrollment payment"}
      </button>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
