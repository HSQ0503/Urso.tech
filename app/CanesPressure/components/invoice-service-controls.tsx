"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fmtMoney,
  invoiceBalanceCents,
  recurringServiceEligible,
  type InvoiceWithItems,
} from "@urso/types";
import {
  enableServiceOffers,
  finalizeServiceInvoice,
} from "../service-agreement-actions";

export function InvoiceServiceControls({
  invoice,
  crews,
}: {
  invoice: InvoiceWithItems;
  crews: { id: string; name: string }[];
}) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [notice, setNotice] = useState(""),
    [url, setUrl] = useState("");
  const [date, setDate] = useState(invoice.service_date ?? ""),
    [crew, setCrew] = useState(invoice.service_offer_crew_id ?? "");
  const [durations, setDurations] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(invoice.service_offer_durations ?? {}).map(
        ([id, value]) => [id, String(value)],
      ),
    ),
  );
  const eligible = invoice.items.filter(
    (line) =>
      line.service_line_id && recurringServiceEligible(line.service_category),
  );
  if (invoice.status === "paid" || invoice.status === "void") return null;
  return (
    <section className="cp-card mb-4 space-y-3 p-4">
      <h2 className="font-semibold">
        {invoice.service_visit ||
        invoice.service_autopay_kind === "cancellation"
          ? "Recurring service billing"
          : "Recurring service offer"}
      </h2>
      {invoice.service_visit ||
      invoice.service_autopay_kind === "cancellation" ? (
        <>
          <p className="text-sm text-[var(--cp-muted)]">
            Confirm the completed service and exact agreed scope before charging
            the authorized card. Additional work needs separate customer
            approval.
          </p>
          <button
            className="cp-btn cp-btn-primary min-h-11 w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await finalizeServiceInvoice(invoice.id);
                setNotice(result.notice ?? "Saved.");
                router.refresh();
              })
            }
          >
            {pending
              ? "Processing…"
              : invoice.service_autopay_kind === "cancellation" &&
                  !invoice.service_autopay_finalized_at
                ? "Review cancellation charge"
                : `Finalize & charge ${fmtMoney(invoiceBalanceCents(invoice))}`}
          </button>
        </>
      ) : invoice.service_autopay_authorization_id ? (
        <p className="text-sm">
          Recurring terms have been accepted. Payment status and any recovery
          link appear on the customer invoice.
        </p>
      ) : (
        <>
          {!eligible.length ? (
            <p className="text-sm text-[var(--cp-muted)]">
              This invoice needs an eligible, explicitly categorized service.
              Preserve historical descriptions and classify the service before
              offering a recurring discount.
            </p>
          ) : (
            <>
              <label className="cp-label block">
                Actual service completion date
                <input
                  className="cp-input mt-1"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="cp-label block">
                Preferred crew
                <select
                  className="cp-select mt-1"
                  value={crew}
                  onChange={(event) => setCrew(event.target.value)}
                >
                  <option value="">Set up scheduling later</option>
                  {crews.map((crew) => (
                    <option key={crew.id} value={crew.id}>
                      {crew.name}
                    </option>
                  ))}
                </select>
              </label>
              {eligible.map((line) => (
                <label key={line.id} className="cp-label block">
                  {line.name} · minutes per repeat
                  <input
                    type="number"
                    min="15"
                    max="720"
                    className="cp-input mt-1"
                    value={durations[line.service_line_id!] ?? ""}
                    placeholder="Set up later"
                    onChange={(event) =>
                      setDurations({
                        ...durations,
                        [line.service_line_id!]: event.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <p className="text-xs text-[var(--cp-muted)]">
                Missing area, crew, duration or availability leaves the next
                visit in Needs scheduling. Existing signed plans are not
                converted.
              </p>
              <button
                className="cp-btn min-h-11 w-full"
                disabled={pending || !date}
                onClick={() =>
                  start(async () => {
                    const result = await enableServiceOffers({
                      invoiceId: invoice.id,
                      serviceDate: date,
                      crewId: crew || null,
                      durations: Object.fromEntries(
                        Object.entries(durations)
                          .filter(([, value]) => value !== "")
                          .map(([id, value]) => [id, Number(value)]),
                      ),
                      enabled: true,
                    });
                    setNotice(result.notice ?? "Saved.");
                    if (result.url) setUrl(result.url);
                    if (result.ok) router.refresh();
                  })
                }
              >
                {pending ? "Saving…" : "Enable customer recurring offer"}
              </button>
            </>
          )}
        </>
      )}
      {invoice.service_offers_enabled || url ? (
        <a
          className="cp-btn min-h-11 w-full"
          href={url || `/CanesPressure/enroll/${invoice.public_token}`}
          target="_blank"
          rel="noreferrer"
        >
          Open customer offer
        </a>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {invoice.service_payment_issue ? (
        <p className="text-sm text-[var(--cp-warn)]">
          {invoice.service_payment_issue}
        </p>
      ) : null}
    </section>
  );
}
