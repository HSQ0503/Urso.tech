"use client";

import { useState, useTransition } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type ActionResult,
} from "@/app/CanesPressure/actions";
import {
  ET,
  etLocalToIso,
  isoToEtLocal,
  type CalendarEvent,
  type CalendarEventKind,
  type Crew,
} from "@/lib/canes/types";
import { SheetShell } from "./sheet-shell";

// Create / edit Event sheet — title, date, start/end (or all-day), crew, kind,
// notes. Jobs are born from estimates, so this is the only calendar-authoring
// form. Times compose to ET wall time through etLocalToIso.

type Feedback = { ok: boolean; text: string } | null;

const KINDS: { value: CalendarEventKind; label: string }[] = [
  { value: "block", label: "Block" },
  { value: "time_off", label: "Time off" },
  { value: "holiday", label: "Holiday" },
  { value: "note", label: "Note" },
];

function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function splitEt(iso: string): { date: string; time: string } {
  const naive = isoToEtLocal(iso);
  return { date: naive.slice(0, 10), time: naive.slice(11, 16) };
}

export function CreateEventSheet({
  crews,
  event,
  onClose,
}: {
  crews: Crew[];
  event?: CalendarEvent | null;
  onClose: () => void;
}) {
  const editing = event ?? null;
  const initial = editing ? splitEt(editing.starts_at) : null;
  const initialEnd = editing && !editing.all_day ? splitEt(editing.ends_at).time : "12:00";
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? todayEt());
  const [start, setStart] = useState(initial?.time ?? "09:00");
  const [end, setEnd] = useState(initialEnd);
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [crewId, setCrewId] = useState(editing?.crew_id ?? "");
  const [kind, setKind] = useState<CalendarEventKind>(editing?.kind ?? "block");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  const timesInvalid = !allDay && !!start && !!end && end <= start;
  const canSubmit =
    title.trim().length > 0 &&
    date.length === 10 &&
    (allDay || (!!start && !!end && !timesInvalid));

  function submit() {
    setFeedback(null);
    const startIso = allDay
      ? etLocalToIso(`${date}T00:00`)
      : etLocalToIso(`${date}T${start}`);
    const endIso = allDay
      ? etLocalToIso(`${nextDay(date)}T00:00`)
      : etLocalToIso(`${date}T${end}`);
    const payload = {
      title: title.trim(),
      startIso,
      endIso,
      allDay,
      crewId: crewId || null,
      kind,
      notes: notes.trim(),
    };

    startTransition(async () => {
      const res: ActionResult = editing
        ? await updateCalendarEvent(editing.id, payload)
        : await createCalendarEvent(payload);
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onClose();
    });
  }

  function remove() {
    if (!editing) return;
    if (!confirm("Delete this event? It will leave the calendar.")) return;
    setFeedback(null);
    startTransition(async () => {
      const res: ActionResult = await deleteCalendarEvent(editing.id);
      setFeedback(res.notice ? { ok: res.ok, text: res.notice } : null);
      if (res.ok) onClose();
    });
  }

  return (
    <SheetShell title={editing ? "Edit event" : "Create event"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="cp-label" htmlFor="event-title">Title</label>
          <input
            id="event-title"
            className="cp-input"
            placeholder="Crew B afternoon off"
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

        {timesInvalid && (
          <p className="text-[12.5px] leading-snug text-[var(--cp-warn)]">
            End time must be after the start time.
          </p>
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

        <div>
          <label className="cp-label" htmlFor="event-notes">Notes</label>
          <textarea
            id="event-notes"
            className="cp-input min-h-[72px]"
            placeholder="Anything worth remembering"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
            {isPending ? (editing ? "Saving..." : "Creating...") : editing ? "Save event" : "Create event"}
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
        {editing ? (
          <button
            type="button"
            className="cp-btn cp-btn-ghost cp-btn-danger cp-btn-sm w-full"
            disabled={isPending}
            onClick={remove}
          >
            Delete event
          </button>
        ) : null}
      </div>
    </SheetShell>
  );
}

function nextDay(ymd: string): string {
  const anchor = new Date(`${ymd}T12:00:00Z`);
  return new Date(anchor.getTime() + 86_400_000).toISOString().slice(0, 10);
}
