"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateLeadFields } from "@/app/CanesPressure/actions";
import { SOURCE_LABEL, type Lead, type LeadSource } from "@/lib/canes/types";
import { AddressInput } from "../address-input";
import { PhoneInput } from "../phone-input";

// Inline-editable lead details. One Save button for the whole form so a call
// in progress never fights half-committed field state.

export function LeadEditor({ lead }: { lead: Lead }) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      name: String(fd.get("name") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      service: String(fd.get("service") ?? "").trim(),
      address: String(fd.get("address") ?? "").trim(),
      notes: String(fd.get("notes") ?? "").trim(),
      source: String(fd.get("source")) as LeadSource,
    };
    setNotice("");
    setSaved(false);
    startTransition(async () => {
      const res = await updateLeadFields(lead.id, fields);
      if (res.ok) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      } else {
        setNotice(res.notice ?? "Could not save.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="cp-label" htmlFor="lead-name">Name</label>
          <input id="lead-name" name="name" className="cp-input" defaultValue={lead.name ?? ""} />
        </div>
        <div>
          <label className="cp-label" htmlFor="lead-phone">Phone</label>
          <PhoneInput id="lead-phone" name="phone" defaultValue={lead.phone} />
        </div>
        <div>
          <label className="cp-label" htmlFor="lead-email">Email</label>
          <input id="lead-email" name="email" type="email" className="cp-input" defaultValue={lead.email ?? ""} />
        </div>
        <div>
          <label className="cp-label" htmlFor="lead-service">Service</label>
          <input
            id="lead-service"
            name="service"
            className="cp-input"
            defaultValue={lead.service ?? ""}
            placeholder="House wash, driveway, roof..."
          />
        </div>
        <div>
          <label className="cp-label" htmlFor="lead-source">Source</label>
          <select id="lead-source" name="source" className="cp-select" defaultValue={lead.source}>
            {(Object.entries(SOURCE_LABEL) as [LeadSource, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="cp-label" htmlFor="lead-address">Address</label>
        <AddressInput id="lead-address" name="address" defaultValue={lead.address ?? ""} />
      </div>
      <div>
        <label className="cp-label" htmlFor="lead-notes">Notes</label>
        <textarea
          id="lead-notes"
          name="notes"
          rows={3}
          className="cp-textarea"
          defaultValue={lead.notes ?? ""}
          placeholder="Gate codes, pets, pricing discussed..."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="cp-btn cp-btn-primary cp-btn-sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--cp-good)]">
            <Check size={14} strokeWidth={2} /> Saved
          </span>
        )}
        {notice && <span className="text-[12.5px] text-[var(--cp-warn)]">{notice}</span>}
      </div>
    </form>
  );
}
