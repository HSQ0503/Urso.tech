"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, FileText, Plus } from "lucide-react";
import { createEstimateForCustomer, createManualJob } from "@/app/CanesPressure/actions";
import { etLocalToIso, fmtPhone, type Address, type Contact, type Crew } from "@/lib/canes/types";
import { isCompleteWhen, SchedulePicker } from "@/app/CanesPressure/components/leads/schedule-picker";

const CUSTOM_ADDRESS = "__custom__";

// The profile's launch pad: start a prefilled estimate, or book repeat work
// directly as a manual job — no estimate required.

export function CreateWork({
  contact,
  addresses,
  crews,
}: {
  contact: Contact;
  addresses: Address[];
  crews: Crew[];
}) {
  const router = useRouter();
  const [jobOpen, setJobOpen] = useState(false);
  const [addressChoice, setAddressChoice] = useState(
    addresses.find((a) => a.is_primary)?.line ?? addresses[0]?.line ?? CUSTOM_ADDRESS,
  );
  const [when, setWhen] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState("");
  const [isPending, startTransition] = useTransition();

  // createManualJob requires a name; a phone-only contact still gets one.
  const customerName = contact.name?.trim() || (contact.phone ? fmtPhone(contact.phone) : "Customer");

  function startEstimate() {
    setNotice("");
    setDone("");
    startTransition(async () => {
      const res = await createEstimateForCustomer(contact.id);
      if (res.ok && res.estimateId) {
        router.push(`/CanesPressure/estimates/${res.estimateId}`);
      } else {
        setNotice(res.notice ?? "Could not start the estimate.");
      }
    });
  }

  function handleJobSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const jobName = String(fd.get("jobName") ?? "").trim();
    if (!jobName) {
      setNotice("A job name is required.");
      return;
    }
    const dollars = Number(String(fd.get("total") ?? "").trim());
    if (!Number.isFinite(dollars) || dollars < 0) {
      setNotice("Enter a valid job total.");
      return;
    }
    const customLine = String(fd.get("customAddress") ?? "").trim();
    const jobAddress = addressChoice === CUSTOM_ADDRESS ? customLine : addressChoice;
    const crewId = String(fd.get("crewId") ?? "");
    const jobNotes = String(fd.get("notes") ?? "").trim();
    setNotice("");
    setDone("");
    startTransition(async () => {
      const res = await createManualJob({
        contactId: contact.id,
        customerName,
        customerPhone: contact.phone ?? undefined,
        customerEmail: contact.email ?? undefined,
        jobAddress: jobAddress || undefined,
        jobName,
        totalCents: Math.round(dollars * 100),
        scheduledAtIso: isCompleteWhen(when) ? etLocalToIso(when) : undefined,
        crewId: crewId || undefined,
        notes: jobNotes || undefined,
      });
      if (res.ok) {
        setJobOpen(false);
        setWhen("");
        setDone(isCompleteWhen(when) ? "Job created and scheduled." : "Job created. It's waiting in the schedule tray.");
        router.refresh();
      } else {
        setNotice(res.notice ?? "Could not create the job.");
      }
    });
  }

  return (
    <div className="cp-card p-4">
      <h2 className="text-[15px] font-semibold">Create new</h2>

      <button
        type="button"
        className="cp-btn cp-btn-primary mt-3 w-full"
        onClick={startEstimate}
        disabled={isPending}
      >
        <FileText size={15} strokeWidth={2} />
        New estimate
      </button>
      <p className="mt-1.5 text-[12px] text-[var(--cp-faint)]">
        Opens the builder prefilled with this customer and their primary address.
      </p>

      <div className="cp-divider my-4" />

      {!jobOpen ? (
        <button
          type="button"
          className="cp-btn w-full"
          onClick={() => {
            setJobOpen(true);
            setNotice("");
            setDone("");
          }}
        >
          <Plus size={15} strokeWidth={2} />
          New job
        </button>
      ) : (
        <form onSubmit={handleJobSubmit} className="space-y-3">
          <div>
            <label className="cp-label" htmlFor="cw-job-name">Job name</label>
            <input id="cw-job-name" name="jobName" required className="cp-input" placeholder="House wash, driveway..." />
          </div>
          <div>
            <label className="cp-label" htmlFor="cw-total">Total ($)</label>
            <input
              id="cw-total"
              name="total"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              className="cp-input tabular-nums"
              placeholder="350.00"
            />
          </div>
          <div>
            <label className="cp-label" htmlFor="cw-address">Address</label>
            <select
              id="cw-address"
              className="cp-select"
              value={addressChoice}
              onChange={(e) => setAddressChoice(e.target.value)}
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.line}>
                  {a.line}
                  {a.is_primary ? " (primary)" : ""}
                </option>
              ))}
              <option value={CUSTOM_ADDRESS}>Different address...</option>
            </select>
            {addressChoice === CUSTOM_ADDRESS && (
              <input
                name="customAddress"
                className="cp-input mt-2"
                placeholder="Street, city"
                aria-label="Custom job address"
              />
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="cp-mono">Schedule (optional)</span>
              {when && (
                <button
                  type="button"
                  className="cursor-pointer text-[12px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
                  onClick={() => setWhen("")}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-1.5">
              <SchedulePicker value={when} onChange={setWhen} />
            </div>
            {!isCompleteWhen(when) && (
              <p className="mt-1 text-[12px] text-[var(--cp-faint)]">
                Skip the picker to leave the job unscheduled.
              </p>
            )}
          </div>
          {crews.length > 0 && (
            <div>
              <label className="cp-label" htmlFor="cw-crew">Crew</label>
              <select id="cw-crew" name="crewId" className="cp-select" defaultValue="">
                <option value="">Unassigned</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="cp-label" htmlFor="cw-notes">Notes</label>
            <textarea
              id="cw-notes"
              name="notes"
              rows={2}
              className="cp-textarea"
              placeholder="Anything the crew should know..."
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="cp-btn cp-btn-primary cp-btn-sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save job"}
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-sm"
              onClick={() => {
                setJobOpen(false);
                setWhen("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {done && (
        <p className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--cp-good)]">
          <Check size={14} strokeWidth={2} /> {done}
        </p>
      )}
      {notice && <p className="mt-2 text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
    </div>
  );
}
