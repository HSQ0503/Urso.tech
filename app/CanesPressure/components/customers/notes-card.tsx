"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateCustomer } from "@/app/CanesPressure/actions";

// Free-form customer notes, saved as a whole — gate codes, pets, pricing
// history. Desktop renders a bordered card; mobile (md:hidden) renders an iOS
// inset list under a mono section label with a block save button.

export function NotesCard({ contactId, notes }: { contactId: string; notes: string | null }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setNotice("");
    startTransition(async () => {
      const res = await updateCustomer(contactId, { notes: String(fd.get("notes") ?? "") });
      if (res.ok) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } else {
        setNotice(res.notice ?? "Could not save.");
      }
    });
  }

  return (
    // One flow child so the parent's space-y spacing is unchanged; the two
    // breakpoint subtrees switch inside.
    <div>
      {/* ── Mobile: iOS inset list ─────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="md:hidden">
        <div className="flex items-end justify-between px-1.5 pb-[7px]">
          <span className="cp-list-header p-0">Notes</span>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--cp-good)]">
              <Check size={13} strokeWidth={2} /> Saved
            </span>
          )}
        </div>
        <div className="cp-list p-4">
          <textarea
            name="notes"
            rows={4}
            className="cp-textarea"
            defaultValue={notes ?? ""}
            placeholder="Gate codes, pets, pricing discussed..."
          />
          <button type="submit" className="cp-btn cp-btn-block mt-3" disabled={isPending}>
            {isPending ? "Saving..." : "Save notes"}
          </button>
          {notice && <p className="mt-2 text-[12.5px] text-[var(--cp-warn)]">{notice}</p>}
        </div>
      </form>

      {/* ── Desktop: bordered card ───────────────────────────── (frozen) */}
      <form onSubmit={handleSubmit} className="hidden cp-card p-4 md:block">
        <h2 className="text-[15px] font-semibold">Notes</h2>
        <textarea
          name="notes"
          rows={4}
          className="cp-textarea mt-3"
          defaultValue={notes ?? ""}
          placeholder="Gate codes, pets, pricing discussed..."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="cp-btn cp-btn-sm" disabled={isPending}>
            {isPending ? "Saving..." : "Save notes"}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--cp-good)]">
              <Check size={14} strokeWidth={2} /> Saved
            </span>
          )}
          {notice && <span className="text-[12.5px] text-[var(--cp-warn)]">{notice}</span>}
        </div>
      </form>
    </div>
  );
}
