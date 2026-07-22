"use client";

import { useMemo, useState } from "react";
import { ET } from "@/lib/canes/types";

// Tap-to-book scheduler: day chips for the coming week, hour slots, and a
// quarter-hour row (Sebastian's ask — 15-minute starts, not just on the hour),
// all Eastern time. Replaces the raw datetime-local inputs — a booking is
// still two taps (day + hour lands on :00); the minute row refines it. Emits
// the same naive "YYYY-MM-DDTHH:mm" string the old input produced, so
// etLocalToIso at the call sites keeps doing the timezone conversion; a
// day-only pick emits just "YYYY-MM-DD", which callers treat as incomplete.

const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
const QUARTERS = ["00", "15", "30", "45"];

export function isCompleteWhen(v: string): boolean {
  return /T\d{2}:\d{2}$/.test(v);
}

// "8 AM" for an "HH", "8:15 AM" for an "HH:mm" off the hour.
function slotLabel(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m && m !== "00" ? `:${m}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

type Day = { date: string; label: string; sub: string };

// Calendar days in ET starting today. Anchoring at UTC noon keeps the
// day-by-day walk stable across DST transitions.
function nextDays(count: number): Day[] {
  const todayEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const anchor = new Date(`${todayEt}T12:00:00Z`);
  const days: Day[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(anchor.getTime() + i * 86_400_000);
    days.push({
      date: d.toISOString().slice(0, 10),
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      sub: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    });
  }
  return days;
}

function etNowHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function SchedulePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const days = useMemo(() => nextDays(7), []);
  const [custom, setCustom] = useState(false);

  const pickedDay = value.slice(0, 10);
  const time = isCompleteWhen(value) ? value.slice(11, 16) : "";
  const hour = time.slice(0, 2);
  const minute = time.slice(3, 5);
  // Nothing picked yet reads as tomorrow — the most common booking.
  const day = days.some((d) => d.date === pickedDay) ? pickedDay : days[1].date;
  const isToday = day === days[0].date;
  const nowHm = etNowHm();
  const isPast = (t: string) => isToday && t <= nowHm;

  // Tapping an hour keeps the chosen quarter when it still works, else falls
  // to the hour's first future quarter (today's current hour never lands on a
  // minute that already passed).
  function pickHour(hh: string) {
    const mm =
      minute && !isPast(`${hh}:${minute}`)
        ? minute
        : (QUARTERS.find((q) => !isPast(`${hh}:${q}`)) ?? "00");
    onChange(`${day}T${hh}:${mm}`);
  }

  const summary = time
    ? (() => {
        const d = days.find((x) => x.date === day);
        return d ? `${d.label === "Today" || d.label === "Tomorrow" ? d.label : d.label + " " + d.sub} · ${slotLabel(time)} ET` : "";
      })()
    : "";

  if (custom) {
    return (
      <div className="space-y-1.5">
        <input
          type="datetime-local"
          className="cp-input"
          value={isCompleteWhen(value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] leading-snug text-[var(--cp-faint)]">Times are Eastern (ET).</p>
          <button
            type="button"
            className="cursor-pointer text-[12px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
            onClick={() => setCustom(false)}
          >
            Quick picks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Wrapping (not scrolling) keeps every option visible and keeps this
          row's intrinsic width from blowing out narrow grid tracks. */}
      <div className="flex flex-wrap gap-1.5">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            className="cp-slot"
            data-selected={d.date === day}
            onClick={() => {
              // Switching to today drops a time that is already in the past.
              const keep = time && !(d.date === days[0].date && time <= nowHm);
              onChange(keep ? `${d.date}T${time}` : d.date);
            }}
          >
            {d.label}
            <span className="cp-slot-sub">{d.sub}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {HOURS.map((hh) => (
          <button
            key={hh}
            type="button"
            className="cp-slot"
            data-selected={hh === hour}
            // The hour is gone only once its last quarter is behind us.
            disabled={isPast(`${hh}:45`)}
            onClick={() => pickHour(hh)}
          >
            {slotLabel(hh)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {QUARTERS.map((mm) => (
          <button
            key={mm}
            type="button"
            className="cp-slot"
            data-selected={hour !== "" && mm === minute}
            disabled={!hour || isPast(`${hour}:${mm}`)}
            onClick={() => onChange(`${day}T${hour}:${mm}`)}
          >
            :{mm}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
          {summary ? (
            <>Visit <span className="font-semibold text-[var(--cp-ink)]">{summary}</span></>
          ) : (
            "Pick a day and a time (ET)."
          )}
        </p>
        <button
          type="button"
          className="shrink-0 cursor-pointer text-[12px] font-semibold text-[var(--cp-brand-deep)] hover:underline"
          onClick={() => setCustom(true)}
        >
          Custom time
        </button>
      </div>
    </div>
  );
}
