"use client";

import { useRef, useState, useTransition } from "react";
import { createManualJob, type ActionResult } from "@/app/CanesPressure/actions";
import { etLocalToIso, fmtMoney, type Crew } from "@/lib/canes/types";
import type { CustomerHit } from "@/lib/canes/customers";
import { AddressInput } from "../address-input";
import { CustomerPicker } from "../customer-picker";
import { PhoneInput } from "../phone-input";
import { isCompleteWhen, SchedulePicker } from "../leads/schedule-picker";
import { SheetShell } from "./sheet-shell";

// Manual-job sheet — the mobile FAB's "Job" path. Client-first: the name
// field is a typeahead over existing customers; a pick links the contact and
// prefills phone + address, an unmatched name becomes a new Customers entry
// server-side (createManualJob → ensureContact).

type Feedback = { ok: boolean; text: string } | null;

const DURATIONS = [60, 90, 120, 180, 240];

// Parse a "$450" / "450.00" entry into integer cents. NaN → 0.
function toCents(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function CreateJobSheet({
  crews,
  customers,
  onClose,
}: {
  crews: Crew[];
  customers: CustomerHit[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [jobName, setJobName] = useState("");
  const [total, setTotal] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [scheduleNow, setScheduleNow] = useState(false);
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(120);
  const [crewId, setCrewId] = useState("");
  const [contact, setContact] = useState<CustomerHit | null>(null);
  const [pickSeq, setPickSeq] = useState(0);
  // What the last pick filled in — editing the name only clears fields the
  // pick wrote (never something Sebastian typed himself).
  const applied = useRef<{ phone: string; address: string }>({ phone: "", address: "" });

  // Compare phones by digits — the input shows "(561) 555-0118" while the
  // directory carries "+15615550118".
  const digits = (v: string) => v.replace(/\D/g, "");

  function pickCustomer(hit: CustomerHit) {
    setContact(hit);
    setPickSeq((n) => n + 1); // remount PhoneInput even when re-picking the same client
    setCustomerName(hit.name ?? "");
    setCustomerPhone(hit.phone ?? "");
    setJobAddress(hit.address ?? "");
    applied.current = { phone: hit.phone ?? "", address: hit.address ?? "" };
  }

  function changeName(name: string) {
    setCustomerName(name);
    if (contact && name.trim() !== (contact.name ?? "").trim()) {
      setContact(null);
      if (digits(customerPhone) === digits(applied.current.phone)) setCustomerPhone("");
      if (jobAddress === applied.current.address) setJobAddress("");
      applied.current = { phone: "", address: "" };
      setPickSeq((n) => n + 1); // remount PhoneInput so a cleared phone shows empty
    }
  }

  const cents = toCents(total);
  const canSubmit =
    customerName.trim().length > 0 &&
    jobName.trim().length > 0 &&
    cents > 0 &&
    (!scheduleNow || isCompleteWhen(when));

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res: ActionResult = await createManualJob({
        contactId: contact?.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        jobName: jobName.trim(),
        totalCents: cents,
        jobAddress: jobAddress.trim() || undefined,
        scheduledAtIso: scheduleNow && isCompleteWhen(when) ? etLocalToIso(when) : undefined,
        durationMinutes: scheduleNow ? duration : undefined,
        crewId: scheduleNow && crewId ? crewId : undefined,
      });
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onClose();
    });
  }

  return (
    <SheetShell title="New job" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="cp-label" htmlFor="job-customer">Client name</label>
          <CustomerPicker
            id="job-customer"
            customers={customers}
            value={customerName}
            onChange={changeName}
            onPick={pickCustomer}
            linkedId={contact?.id ?? null}
          />
        </div>

        <div>
          <label className="cp-label" htmlFor="job-phone">Phone (optional)</label>
          <PhoneInput
            key={`${contact?.id ?? "new"}:${pickSeq}`}
            id="job-phone"
            placeholder="(561) 555-0134"
            defaultValue={customerPhone}
            onChange={setCustomerPhone}
          />
        </div>

        <div>
          <label className="cp-label" htmlFor="job-name">Job</label>
          <input
            id="job-name"
            className="cp-input"
            placeholder="Driveway and walkway wash"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
        </div>

        <div>
          <label className="cp-label" htmlFor="job-total">Total</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--cp-muted)]">
              $
            </span>
            <input
              id="job-total"
              className="cp-input tabular-nums"
              // Inline because .cp-input's padding is unlayered CSS and beats
              // Tailwind's pl-*; the $ prefix needs the extra room.
              style={{ paddingLeft: 24 }}
              inputMode="decimal"
              placeholder="450.00"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="cp-label" htmlFor="job-address">Address (optional)</label>
          <AddressInput
            id="job-address"
            placeholder="812 Palmetto Dr, Lake Worth"
            value={jobAddress}
            onChange={setJobAddress}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--cp-brand-fill)]"
            checked={scheduleNow}
            onChange={(e) => setScheduleNow(e.target.checked)}
          />
          Put it on the calendar now
        </label>

        {scheduleNow && (
          <div className="space-y-3">
            <SchedulePicker value={when} onChange={setWhen} allowPast />

            <div>
              <p className="cp-label">Duration</p>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="cp-slot"
                    data-selected={d === duration}
                    onClick={() => setDuration(d)}
                  >
                    {d < 120 ? `${d}m` : `${d / 60}h`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="cp-label" htmlFor="job-crew">Crew</label>
              <select
                id="job-crew"
                className="cp-select"
                value={crewId}
                onChange={(e) => setCrewId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
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

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="cp-btn cp-btn-primary flex-1"
            disabled={!canSubmit || isPending}
            onClick={submit}
          >
            {isPending
              ? "Creating..."
              : cents > 0
                ? `Create job (${fmtMoney(cents)})`
                : "Create job"}
          </button>
          <button type="button" className="cp-btn" disabled={isPending} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
