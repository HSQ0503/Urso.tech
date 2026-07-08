"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, Plus } from "lucide-react";
import { addCustomerAddress, setPrimaryAddress } from "@/app/CanesPressure/actions";
import type { Address } from "@/lib/canes/types";

// Service addresses for this customer. The primary address prefills new
// estimates and jobs; any other row can be promoted with one tap.

export function PropertiesCard({ contactId, addresses }: { contactId: string; addresses: Address[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const line = String(fd.get("line") ?? "").trim();
    if (!line) {
      setNotice("An address is required.");
      return;
    }
    const siteNotes = String(fd.get("siteNotes") ?? "").trim();
    setNotice("");
    startTransition(async () => {
      const res = await addCustomerAddress(contactId, line, siteNotes || undefined);
      if (res.ok) {
        setAdding(false);
        router.refresh();
      } else {
        setNotice(res.notice ?? "Could not add the address.");
      }
    });
  }

  function makePrimary(addressId: string) {
    setNotice("");
    startTransition(async () => {
      const res = await setPrimaryAddress(contactId, addressId);
      if (res.ok) router.refresh();
      else setNotice(res.notice ?? "Could not update the address.");
    });
  }

  return (
    <div className="cp-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Properties</h2>
        {!adding && (
          <button
            type="button"
            className="cp-btn cp-btn-ghost cp-btn-sm"
            onClick={() => {
              setAdding(true);
              setNotice("");
            }}
          >
            <Plus size={13} strokeWidth={2} />
            Add address
          </button>
        )}
      </div>

      {addresses.length === 0 && !adding && (
        <p className="mt-3 text-[13.5px] text-[var(--cp-muted)]">
          No addresses on file yet. Add one so estimates and jobs prefill.
        </p>
      )}

      {addresses.length > 0 && (
        <div className="mt-3 divide-y divide-[var(--cp-line)]">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <MapPin size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--cp-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(a.line)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[14px] font-medium hover:underline"
                  >
                    {a.line}
                  </a>
                  {a.is_primary && (
                    <span className="cp-chip bg-[var(--cp-bg)] text-[var(--cp-muted)]">Primary</span>
                  )}
                </div>
                {a.site_notes && (
                  <p className="mt-0.5 text-[12.5px] text-[var(--cp-muted)]">{a.site_notes}</p>
                )}
              </div>
              {!a.is_primary && (
                <button
                  type="button"
                  className="cp-btn cp-btn-ghost cp-btn-sm shrink-0"
                  onClick={() => makePrimary(a.id)}
                  disabled={isPending}
                >
                  Set primary
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="mt-3 space-y-3 border-t border-[var(--cp-line)] pt-3">
          <div>
            <label className="cp-label" htmlFor="prop-line">Address</label>
            <input id="prop-line" name="line" required className="cp-input" placeholder="Street, city" />
          </div>
          <div>
            <label className="cp-label" htmlFor="prop-notes">Site notes (optional)</label>
            <input id="prop-notes" name="siteNotes" className="cp-input" placeholder="Gate code, parking, dogs..." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="cp-btn cp-btn-primary cp-btn-sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save address"}
            </button>
            <button type="button" className="cp-btn cp-btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {notice && <p className="mt-2 text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
    </div>
  );
}
