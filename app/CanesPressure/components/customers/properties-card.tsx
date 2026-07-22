"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, Plus } from "lucide-react";
import { addCustomerAddress, setPrimaryAddress } from "@/app/CanesPressure/actions";
import type { Address } from "@/lib/canes/types";
import { AddressInput } from "../address-input";

// Service addresses for this customer. The primary address prefills new
// estimates and jobs; any other row can be promoted with one tap. Desktop
// renders a bordered card; mobile (md:hidden) renders an iOS inset list under a
// mono section label with a block add form.

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

  // Add form; idPrefix keeps the two breakpoint copies' field ids unique (only
  // one tree is ever visible). submitRow carries the breakpoint's button style.
  function addForm(idPrefix: string, submitRow: React.ReactNode) {
    return (
      <form onSubmit={handleAdd} className="space-y-3">
        <div>
          <label className="cp-label" htmlFor={`${idPrefix}line`}>Address</label>
          <AddressInput id={`${idPrefix}line`} name="line" required />
        </div>
        <div>
          <label className="cp-label" htmlFor={`${idPrefix}notes`}>Site notes (optional)</label>
          <input id={`${idPrefix}notes`} name="siteNotes" className="cp-input" placeholder="Gate code, parking, dogs..." />
        </div>
        {submitRow}
      </form>
    );
  }

  const mobileSubmit = (
    <div className="space-y-2">
      <button type="submit" className="cp-btn cp-btn-primary cp-btn-block" disabled={isPending}>
        {isPending ? "Saving..." : "Save address"}
      </button>
      <button type="button" className="cp-btn cp-btn-block" onClick={() => setAdding(false)}>
        Cancel
      </button>
    </div>
  );

  const desktopSubmit = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="submit" className="cp-btn cp-btn-primary cp-btn-sm" disabled={isPending}>
        {isPending ? "Saving..." : "Save address"}
      </button>
      <button type="button" className="cp-btn cp-btn-sm" onClick={() => setAdding(false)}>
        Cancel
      </button>
    </div>
  );

  return (
    // One flow child so the parent's space-y spacing is unchanged.
    <div>
      {/* ── Mobile: iOS inset list ─────────────────────────────────── */}
      <div className="md:hidden">
        <div className="flex items-end justify-between px-1.5 pb-[7px]">
          <span className="cp-list-header p-0">Properties</span>
          {!adding && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--cp-brand-deep)]"
              onClick={() => {
                setAdding(true);
                setNotice("");
              }}
            >
              <Plus size={15} strokeWidth={2} />
              Add
            </button>
          )}
        </div>

        {adding ? (
          <div className="cp-list p-4">{addForm("prop-m-", mobileSubmit)}</div>
        ) : addresses.length === 0 ? (
          <div className="cp-list">
            <p className="px-4 py-5 text-[13.5px] text-[var(--cp-muted)]">
              No addresses on file yet. Add one so estimates and jobs prefill.
            </p>
          </div>
        ) : (
          <div className="cp-list">
            {addresses.map((a) => (
              <div key={a.id} className="cp-list-row">
                <MapPin size={18} strokeWidth={2} className="mt-0.5 shrink-0 self-start text-[var(--cp-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(a.line)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="cp-list-title truncate"
                    >
                      {a.line}
                    </a>
                    {a.is_primary && (
                      <span className="cp-chip shrink-0 bg-[var(--cp-bg)] text-[var(--cp-muted)]">Primary</span>
                    )}
                  </div>
                  {a.site_notes && <p className="cp-list-sub truncate">{a.site_notes}</p>}
                </div>
                {!a.is_primary && (
                  <button
                    type="button"
                    className="shrink-0 text-[13px] font-semibold text-[var(--cp-brand-deep)] disabled:opacity-40"
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
        {notice && <p className="mt-2 px-1.5 text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
      </div>

      {/* ── Desktop: bordered card ───────────────────────────── (frozen) */}
      <div className="hidden cp-card p-4 md:block">
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
          <div className="mt-3 border-t border-[var(--cp-line)] pt-3">{addForm("prop-", desktopSubmit)}</div>
        )}

        {notice && <p className="mt-2 text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
      </div>
    </div>
  );
}
