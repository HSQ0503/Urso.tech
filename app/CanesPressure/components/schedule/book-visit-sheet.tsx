"use client";

import { useState, useTransition } from "react";
import { createQuoteVisit, type ActionResult } from "@/app/CanesPressure/actions";
import { etLocalToIso } from "@/lib/canes/types";
import { AddressInput } from "../address-input";
import { SheetShell } from "./sheet-shell";

// Calendar-side quote booking is deliberately free-entry: a quote does not
// require an existing lead or customer. The action creates the appointment-
// backed row the schedule already uses, and it renders as a violet Quote block.

type Feedback = { ok: boolean; text: string } | null;

export function BookVisitSheet({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [customerName, setCustomerName] = useState("");
  const [jobName, setJobName] = useState("");
  const [address, setAddress] = useState("");
  const [when, setWhen] = useState("");
  const [inPast, setInPast] = useState(false);

  const complete = when.length >= 16;
  const canSubmit =
    customerName.trim().length > 0 &&
    jobName.trim().length > 0 &&
    address.trim().length > 0 &&
    complete &&
    !inPast;

  // Clock reads stay in handlers instead of render. The browser value is an ET
  // wall time and etLocalToIso makes the stored instant DST-safe.
  function isPastSlot(value: string): boolean {
    return value.length >= 16 && Date.parse(etLocalToIso(value)) < Date.now();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPastSlot(when)) {
      setInPast(isPastSlot(when));
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res: ActionResult = await createQuoteVisit({
        customerName,
        jobName,
        address,
        appointmentIso: etLocalToIso(when),
      });
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onClose();
    });
  }

  return (
    <SheetShell title="Book quote visit" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <p className="cp-group-label">Client</p>
          <label className="cp-label" htmlFor="visit-customer-name">Customer name</label>
          <input
            id="visit-customer-name"
            className="cp-input"
            placeholder="Harold Corrigan"
            value={customerName}
            maxLength={120}
            autoComplete="off"
            required
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </div>

        <div>
          <label className="cp-label" htmlFor="visit-address">Client address</label>
          <AddressInput
            id="visit-address"
            placeholder="123 Palm Beach Rd, West Palm Beach"
            value={address}
            required
            onChange={setAddress}
          />
        </div>

        <div className="cp-divider pt-4">
          <p className="cp-group-label">Quote</p>
          <label className="cp-label" htmlFor="visit-job-name">Job name</label>
          <input
            id="visit-job-name"
            className="cp-input"
            placeholder="Driveway and pool deck"
            value={jobName}
            maxLength={160}
            autoComplete="off"
            required
            onChange={(event) => setJobName(event.target.value)}
          />
        </div>

        <div>
          <label className="cp-label" htmlFor="visit-when">Visit time</label>
          <input
            id="visit-when"
            type="datetime-local"
            className="cp-input"
            value={when}
            required
            onChange={(event) => {
              setWhen(event.target.value);
              setInPast(isPastSlot(event.target.value));
            }}
          />
          {inPast && (
            <p className="mt-1 text-[12px] text-[var(--cp-warn)]">
              That time has already passed — pick a future slot.
            </p>
          )}
        </div>

        <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
          This creates a standalone quote visit without searching existing leads
          or clients. Times are Eastern (ET).
        </p>

        {feedback && (
          <p
            aria-live="polite"
            className={`text-[12.5px] leading-snug ${
              feedback.ok ? "text-[var(--cp-good)]" : "text-[var(--cp-warn)]"
            }`}
          >
            {feedback.text}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="cp-btn cp-btn-primary cp-btn-sm flex-1"
            disabled={!canSubmit || isPending}
          >
            {isPending ? "Booking..." : "Book quote"}
          </button>
          <button
            type="button"
            className="cp-btn cp-btn-sm"
            disabled={isPending}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </SheetShell>
  );
}
