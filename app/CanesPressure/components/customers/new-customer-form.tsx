"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCustomer } from "@/app/CanesPressure/actions";
import { SOURCE_LABEL, type LeadSource } from "@/lib/canes/types";

// Create form for a customer who never came through the lead pipeline
// (repeat work, cash referrals). A phone that already belongs to a contact
// surfaces the existing profile instead of a duplicate.

export function NewCustomerForm() {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      setNotice("Name is required.");
      return;
    }
    const phone = String(fd.get("phone") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const address = String(fd.get("address") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const source = String(fd.get("source")) as LeadSource;
    setNotice("");
    setExistingId(null);
    startTransition(async () => {
      const res = await createCustomer({
        name,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        notes: notes || undefined,
        source,
      });
      if (res.ok && res.id) {
        router.push(`/CanesPressure/customers/${res.id}`);
      } else {
        setNotice(res.notice ?? "Could not create the customer.");
        if (res.id) setExistingId(res.id);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="cp-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="cp-label" htmlFor="nc-name">Name</label>
          <input id="nc-name" name="name" required className="cp-input" placeholder="Customer name" />
        </div>
        <div>
          <label className="cp-label" htmlFor="nc-phone">Phone</label>
          <input id="nc-phone" name="phone" type="tel" className="cp-input" placeholder="(561) 555-0123" />
        </div>
        <div>
          <label className="cp-label" htmlFor="nc-email">Email</label>
          <input id="nc-email" name="email" type="email" className="cp-input" placeholder="name@example.com" />
        </div>
        <div>
          <label className="cp-label" htmlFor="nc-source">Source</label>
          <select id="nc-source" name="source" className="cp-select" defaultValue="referral">
            {(Object.entries(SOURCE_LABEL) as [LeadSource, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="cp-label" htmlFor="nc-address">Property address</label>
          <input id="nc-address" name="address" className="cp-input" placeholder="Street, city" />
        </div>
        <div className="sm:col-span-2">
          <label className="cp-label" htmlFor="nc-notes">Notes</label>
          <textarea
            id="nc-notes"
            name="notes"
            rows={3}
            className="cp-textarea"
            placeholder="Gate codes, pets, preferences..."
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="cp-btn cp-btn-primary" disabled={isPending}>
          {isPending ? "Saving..." : "Save customer"}
        </button>
        <Link href="/CanesPressure/customers" className="cp-btn">Cancel</Link>
        {notice && <span className="text-[12.5px] text-[var(--cp-warn)]">{notice}</span>}
        {existingId && (
          <Link
            href={`/CanesPressure/customers/${existingId}`}
            className="text-[12.5px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
          >
            Open the existing customer
          </Link>
        )}
      </div>
    </form>
  );
}
