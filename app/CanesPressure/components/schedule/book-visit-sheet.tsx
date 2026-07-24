"use client";

import { useMemo, useState, useTransition } from "react";
import { setAppointment, type ActionResult } from "@/app/CanesPressure/actions";
import { etLocalToIso, fmtEt, fmtPhone, type Lead } from "@/lib/canes/types";
import { SheetShell } from "./sheet-shell";

// Book-quote-visit sheet — the calendar-side answer to "where do I schedule an
// in-person quote?". Pick an open lead (website form, call-in, manual), pick a
// time, and setAppointment books it: the visit lands on the calendar as a
// violet Quote chip and enters the same confirmation-text automation a hot
// lead gets from the vendor. Rebooking a lead that already has a visit moves it.

type Feedback = { ok: boolean; text: string } | null;

export function BookVisitSheet({
  leads,
  onClose,
}: {
  leads: Lead[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [query, setQuery] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [inPast, setInPast] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.phone, l.address].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [leads, query]);

  // Resolve the selection from the VISIBLE matches, not the full roster — a
  // click, then a search that filters the pick out, must not book the hidden
  // lead the list no longer shows.
  const selected = leadId ? matches.find((l) => l.id === leadId) ?? null : null;
  // A complete datetime-local value is "YYYY-MM-DDTHH:mm" — 16 chars.
  const complete = when.length >= 16;
  const canSubmit = !!selected && complete && !inPast;

  // Booking a past slot would arm confirmation texts for a visit that already
  // happened. Checked in the handlers (clock reads are impure during render);
  // the value is ET wall time via etLocalToIso.
  function isPastSlot(value: string): boolean {
    return value.length >= 16 && Date.parse(etLocalToIso(value)) < Date.now();
  }

  function submit() {
    if (!selected || isPastSlot(when)) {
      setInPast(isPastSlot(when));
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res: ActionResult = await setAppointment(selected.id, etLocalToIso(when));
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onClose();
    });
  }

  return (
    <SheetShell title="Book quote visit" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="cp-label" htmlFor="visit-lead">Lead</label>
          <input
            id="visit-lead"
            className="cp-input"
            placeholder="Search name, phone, or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="text-[12.5px] text-[var(--cp-faint)]">
                No open leads match. New website forms and calls land in Leads first.
              </p>
            ) : (
              matches.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="cp-slot w-full flex-col items-start gap-0.5 whitespace-normal text-left"
                  data-selected={l.id === leadId}
                  onClick={() => setLeadId(l.id)}
                >
                  <span className="w-full truncate text-[13px]">{l.name ?? "Unnamed lead"}</span>
                  <span className="cp-slot-sub w-full truncate">
                    {[l.phone ? fmtPhone(l.phone) : null, l.address].filter(Boolean).join(" · ") ||
                      l.service ||
                      "No contact details yet"}
                  </span>
                  {l.appointment_at && (
                    <span className="cp-slot-sub w-full truncate">
                      Booked {fmtEt(l.appointment_at)} — booking again moves it
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <label className="cp-label" htmlFor="visit-when">Visit time</label>
          <input
            id="visit-when"
            type="datetime-local"
            className="cp-input"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value);
              setInPast(isPastSlot(e.target.value));
            }}
          />
          {inPast && (
            <p className="mt-1 text-[12px] text-[var(--cp-warn)]">
              That time has already passed — pick a future slot.
            </p>
          )}
        </div>

        <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
          Booking here puts the quote on the calendar in the quote color and arms
          the confirmation texts automatically. Times are Eastern (ET).
        </p>

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
            className="cp-btn cp-btn-primary cp-btn-sm flex-1"
            disabled={!canSubmit || isPending}
            onClick={submit}
          >
            {isPending ? "Booking..." : selected?.appointment_at ? "Move visit" : "Book visit"}
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
      </div>
    </SheetShell>
  );
}
