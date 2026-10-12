"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SERVICE_AREAS,
  etLocalToIso,
  fmtEt,
  fmtMoney,
  serviceCancellationFee,
  type ServiceAgreementsView,
  type ServiceArea,
} from "@urso/types";
import {
  configureServiceAgreement,
  createServiceCancellationLink,
  saveCrewAvailability,
  scheduleServiceOccurrence,
  setServiceCancellationFee,
} from "../service-agreement-actions";

export function ServiceAgreementsWorkspace({
  data,
}: {
  data: ServiceAgreementsView;
}) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [notice, setNotice] = useState(""),
    [link, setLink] = useState("");
  const run = (
    action: () => Promise<{ ok: boolean; notice?: string; url?: string }>,
  ) =>
    start(async () => {
      const result = await action();
      setNotice(result.notice ?? (result.ok ? "Saved." : "Could not save."));
      if (result.url?.includes("/cancel#")) setLink(result.url);
      else if (result.url?.startsWith("/CanesPressure/jobs/"))
        router.push(result.url);
      if (result.ok) router.refresh();
    });
  const active = data.agreements.filter(
    (agreement) => agreement.state === "active",
  );
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="cp-display text-3xl">Recurring services</h1>
          <p className="mt-1 text-sm text-[var(--cp-muted)]">
            {active.length} active services ·{" "}
            {fmtMoney(
              Math.round(
                active.reduce(
                  (sum, agreement) =>
                    sum +
                    agreement.recurring_price_cents / agreement.cadence_months,
                  0,
                ),
              ),
            )}{" "}
            normalized monthly value
          </p>
        </div>
        <Link
          className="cp-btn min-h-11"
          href="/CanesPressure/recurring?legacy=1"
        >
          Older maintenance plans
        </Link>
      </header>
      {notice ? (
        <p role="status" className="cp-card p-4 text-sm">
          {notice}
        </p>
      ) : null}
      {link ? (
        <div className="cp-card p-4">
          <p className="mb-2 text-sm">Customer cancellation link</p>
          <input
            className="cp-input"
            readOnly
            value={link}
            aria-label="Customer cancellation link"
          />
          <button
            className="cp-btn mt-2 min-h-11"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setNotice("Link copied."))
            }
          >
            Copy link
          </button>
        </div>
      ) : null}
      {!data.agreements.length ? (
        <div className="cp-card p-5">
          <h2 className="font-semibold">
            Start with a completed service invoice
          </h2>
          <p className="mt-2 text-sm text-[var(--cp-muted)]">
            Open an itemized invoice, enable the recurring offer, and share it
            with the customer. Services activate after accepted terms, a
            verified saved card, and full settlement of the discounted current
            invoice.
          </p>
          <Link className="cp-btn mt-3 min-h-11" href="/CanesPressure/invoices">
            Open invoices
          </Link>
        </div>
      ) : null}
      {data.agreements.map((agreement) => {
        const occurrences = data.occurrences.filter(
          (occurrence) => occurrence.agreement_id === agreement.id,
        );
        const next = occurrences.find((occurrence) =>
          ["needs_scheduling", "scheduled", "completed"].includes(
            occurrence.state,
          ),
        );
        const job = data.jobs.find((job) => job.id === next?.job_id);
        return (
          <section key={agreement.id} className="cp-card space-y-3 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {agreement.customer_name} · {agreement.service_name}
                </h2>
                <p className="mt-1 text-sm text-[var(--cp-muted)]">
                  {agreement.job_address}
                </p>
              </div>
              <span className="cp-chip">
                {agreement.state.replaceAll("_", " ")}
              </span>
            </div>
            <p className="text-sm">
              <strong>{fmtMoney(agreement.recurring_price_cents)}</strong>{" "}
              before tax every {agreement.cadence_months} months · signup
              savings {fmtMoney(agreement.signup_discount_cents)}
            </p>
            <p className="text-sm text-[var(--cp-muted)]">
              {agreement.first_repeat_satisfied_at
                ? "Initial cancellation obligation satisfied."
                : `Original early-cancellation amount: ${fmtMoney(serviceCancellationFee(agreement))}. Any owner waiver applies at confirmation.`}
            </p>
            {next ? (
              <p className="text-sm">
                Contractual due: {next.due_on} ·{" "}
                {job?.scheduled_at
                  ? `Appointment: ${fmtEt(job.scheduled_at)}`
                  : next.state.replaceAll("_", " ")}
                {next.scheduling_note ? (
                  <span className="mt-1 block text-[var(--cp-warn)]">
                    {next.scheduling_note}
                  </span>
                ) : null}
              </p>
            ) : null}
            {job ? (
              <Link
                className="cp-btn min-h-11"
                href={`/CanesPressure/jobs/${job.id}`}
              >
                Open visit
              </Link>
            ) : null}
            {next?.state === "needs_scheduling" ? (
              <details>
                <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                  Schedule this visit manually
                </summary>
                <form
                  className="grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    run(() =>
                      scheduleServiceOccurrence({
                        occurrenceId: next.id,
                        scheduledAt: etLocalToIso(String(form.get("slot"))),
                        crewId: String(form.get("crew")),
                        durationMinutes: Number(form.get("duration")),
                      }),
                    );
                  }}
                >
                  <label className="cp-label">
                    Appointment (Eastern)
                    <input
                      type="datetime-local"
                      name="slot"
                      required
                      className="cp-input mt-1"
                    />
                  </label>
                  <label className="cp-label">
                    Crew
                    <select name="crew" className="cp-select mt-1" required>
                      {data.crews.map((crew) => (
                        <option key={crew.id} value={crew.id}>
                          {crew.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cp-label">
                    Minutes
                    <input
                      type="number"
                      name="duration"
                      required
                      min="15"
                      max="720"
                      className="cp-input mt-1"
                      defaultValue={agreement.duration_minutes ?? ""}
                    />
                  </label>
                  <button className="cp-btn min-h-11" disabled={pending}>
                    Schedule visit
                  </button>
                </form>
              </details>
            ) : null}
            {agreement.state !== "canceled" ? (
              <>
                <details>
                  <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                    Scheduling setup
                  </summary>
                  <form
                    className="mt-2 grid gap-3 sm:grid-cols-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      run(() =>
                        configureServiceAgreement({
                          id: agreement.id,
                          area:
                            (String(form.get("area") || "") as ServiceArea) ||
                            null,
                          crewId: String(form.get("crew") || "") || null,
                          durationMinutes: Number(form.get("duration")),
                        }),
                      );
                    }}
                  >
                    <label className="cp-label">
                      Area
                      <select
                        name="area"
                        defaultValue={agreement.service_area ?? ""}
                        className="cp-select mt-1"
                      >
                        <option value="">Unassigned</option>
                        {SERVICE_AREAS.map((area) => (
                          <option key={area.key} value={area.key}>
                            {area.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cp-label">
                      Crew
                      <select
                        name="crew"
                        className="cp-select mt-1"
                        defaultValue={agreement.crew_id ?? ""}
                      >
                        <option value="">Unassigned</option>
                        {data.crews.map((crew) => (
                          <option key={crew.id} value={crew.id}>
                            {crew.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cp-label">
                      Duration (minutes)
                      <input
                        type="number"
                        name="duration"
                        min="15"
                        max="720"
                        required
                        defaultValue={agreement.duration_minutes ?? ""}
                        className="cp-input mt-1"
                      />
                    </label>
                    <button disabled={pending} className="cp-btn min-h-11">
                      Save scheduling setup
                    </button>
                  </form>
                </details>
                {agreement.activated_at ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={pending}
                      className="cp-btn min-h-11"
                      onClick={() =>
                        run(() =>
                          createServiceCancellationLink(agreement.id, false),
                        )
                      }
                    >
                      Create cancellation link
                    </button>
                    <button
                      disabled={pending}
                      className="cp-btn min-h-11"
                      onClick={() =>
                        run(() =>
                          createServiceCancellationLink(agreement.id, true),
                        )
                      }
                    >
                      Text cancellation link
                    </button>
                  </div>
                ) : null}
                <details>
                  <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                    Reduce or waive cancellation fee
                  </summary>
                  <form
                    className="mt-2 grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      run(() =>
                        setServiceCancellationFee({
                          agreementId: agreement.id,
                          amountCents: Math.round(
                            Number(form.get("fee")) * 100,
                          ),
                          reason: String(form.get("reason")),
                        }),
                      );
                    }}
                  >
                    <label className="cp-label">
                      Amount ($; 0 waives)
                      <input
                        className="cp-input mt-1"
                        type="number"
                        name="fee"
                        min="0"
                        step="0.01"
                        required
                      />
                    </label>
                    <label className="cp-label">
                      Audit reason
                      <input className="cp-input mt-1" name="reason" required />
                    </label>
                    <button disabled={pending} className="cp-btn min-h-11">
                      Save fee reduction
                    </button>
                  </form>
                </details>
              </>
            ) : null}
            <details>
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                Agreement and visit history
              </summary>
              <p className="text-sm">
                Accepted by {agreement.accepted_name} on{" "}
                {fmtEt(agreement.accepted_at)}. Original service:{" "}
                {agreement.original_service_on}.
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--cp-muted)]">
                {agreement.terms_text}
              </p>
              {occurrences.map((occurrence) => (
                <p
                  key={occurrence.id}
                  className="mt-3 border-t border-[var(--cp-line)] pt-3 text-sm"
                >
                  Due {occurrence.due_on} ·{" "}
                  {occurrence.state.replaceAll("_", " ")}
                  {occurrence.invoice_id ? (
                    <Link
                      className="ml-2 underline"
                      href={`/CanesPressure/invoices/${occurrence.invoice_id}`}
                    >
                      Invoice
                    </Link>
                  ) : null}
                </p>
              ))}
            </details>
          </section>
        );
      })}
      <details className="cp-card p-4">
        <summary className="cursor-pointer font-semibold">
          Crew working hours and travel buffer
        </summary>
        <p className="mt-3 text-sm text-[var(--cp-muted)]">
          Automatic visits use preferred area days within 14 days of the
          contractual due date. Sunday is manual only. Unassigned quote-visit
          days require manual review.
        </p>
        {data.availability.map((availability) => (
          <p key={availability.crew_id} className="mt-2 text-sm">
            {data.crews.find((crew) => crew.id === availability.crew_id)?.name}{" "}
            · days {availability.weekdays.join(", ")} ·{" "}
            {availability.travel_buffer_minutes} minute travel buffer
          </p>
        ))}
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const minutes = (key: string) => {
              const [hour, minute] = String(form.get(key))
                .split(":")
                .map(Number);
              return hour * 60 + minute;
            };
            run(() =>
              saveCrewAvailability({
                crewId: String(form.get("crew")),
                weekdays: form.getAll("days").map(Number),
                startMinute: minutes("start"),
                endMinute: minutes("end"),
                travelBufferMinutes: Number(form.get("buffer")),
              }),
            );
          }}
        >
          <label className="cp-label">
            Crew
            <select name="crew" className="cp-select mt-1" required>
              {data.crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="cp-label mb-2">Working days</legend>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <label key={day} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="days" value={index} />
                  {day}
                </label>
              ),
            )}
          </fieldset>
          <label className="cp-label">
            Start time (Eastern)
            <input
              type="time"
              name="start"
              required
              className="cp-input mt-1"
            />
          </label>
          <label className="cp-label">
            End time (Eastern)
            <input type="time" name="end" required className="cp-input mt-1" />
          </label>
          <label className="cp-label">
            Travel buffer (minutes)
            <input
              type="number"
              min="0"
              max="180"
              name="buffer"
              required
              className="cp-input mt-1"
            />
          </label>
          <button disabled={pending} className="cp-btn cp-btn-primary min-h-11">
            Save availability
          </button>
        </form>
      </details>
    </div>
  );
}
