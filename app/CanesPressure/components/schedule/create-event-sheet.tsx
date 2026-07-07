"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  createCalendarEvent,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  ET,
  etLocalToIso,
  type CalendarEventKind,
  type Crew,
} from "@/lib/canes/types";

// Create Event sheet (plan §4.1) — the lean answer to Markate's "Create Event":
// title, date, start/end (or all-day), crew (or everyone), kind. Because jobs
// are born from estimates, this is the only calendar-authoring form we need —
// there is no 20-field work-order form. Times compose to ET wall time through
// etLocalToIso, never raw epoch math on a day origin.

type Feedback = { ok: boolean; text: string } | null;

const KINDS: { value: CalendarEventKind; label: string }[] = [
  { value: "block", label: "Block" },
  { value: "time_off", label: "Time off" },
  { value: "holiday", label: "Holiday" },
  { value: "note", label: "Note" },
];

// Today's ET date as YYYY-MM-DD, so the date input defaults to today wherever
// the device clock sits.
function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function CreateEventSheet({
  crews,
  onClose,
}: {
  crews: Crew[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayEt());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [allDay, setAllDay] = useState(false);
  const [crewId, setCrewId] = useState("");
  const [kind, setKind] = useState<CalendarEventKind>("block");

  const canSubmit =
    title.trim().length > 0 && date.length === 10 && (allDay || (!!start && !!end));

  function submit() {
    setFeedback(null);
    // All-day spans the whole ET day (00:00 → next-day 00:00); a timed event
    // uses the two time inputs. etLocalToIso resolves both as ET wall time.
    const startIso = allDay
      ? etLocalToIso(`${date}T00:00`)
      : etLocalToIso(`${date}T${start}`);
    const endIso = allDay
      ? etLocalToIso(`${nextDay(date)}T00:00`)
      : etLocalToIso(`${date}T${end}`);

    startTransition(async () => {
      const res: ActionResult = await createCalendarEvent({
        title: title.trim(),
        startIso,
        endIso,
        allDay,
        crewId: crewId || null,
        kind,
      });
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onClose();
    });
  }

  return (
    <div className="cp-card flex w-full flex-col overflow-hidden sm:max-w-sm">
      <div className="flex items-center justify-between border-b border-[var(--cp-line)] px-4 py-3">
        <p className="text-[13px] font-semibold">Create event</p>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--cp-muted)] hover:bg-[var(--cp-hover)]"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <label className="cp-label" htmlFor="event-title">Title</label>
          <input
            id="event-title"
            className="cp-input"
            placeholder="Crew B — afternoon off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="cp-label" htmlFor="event-date">Date</label>
          <input
            id="event-date"
            type="date"
            className="cp-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="cp-label" htmlFor="event-start">Start</label>
              <input
                id="event-start"
                type="time"
                className="cp-input"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="cp-label" htmlFor="event-end">End</label>
              <input
                id="event-end"
                type="time"
                className="cp-input"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--cp-brand-fill)]"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All day
        </label>

        <div>
          <label className="cp-label" htmlFor="event-crew">Crew</label>
          <select
            id="event-crew"
            className="cp-select"
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
          >
            <option value="">Everyone</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="cp-label" htmlFor="event-kind">Kind</label>
          <select
            id="event-kind"
            className="cp-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as CalendarEventKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>

        <p className="text-[12px] leading-snug text-[var(--cp-faint)]">Times are Eastern (ET).</p>

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
            {isPending ? "Creating..." : "Create event"}
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
    </div>
  );
}

// Next ET calendar day as YYYY-MM-DD for the all-day end bound. Anchoring at
// UTC noon keeps the +1 stable across DST.
function nextDay(ymd: string): string {
  const anchor = new Date(`${ymd}T12:00:00Z`);
  return new Date(anchor.getTime() + 86_400_000).toISOString().slice(0, 10);
}
