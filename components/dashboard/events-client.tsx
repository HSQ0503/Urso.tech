"use client";

// The Events ("why" layer) page. Log real-world context — staffing, promos,
// price changes, closures, weather — so urso.ai can explain WHY a number moved.
// Events are loaded on the server (data.server) and passed in; this owns the
// form + the optimistic list. Writes go through the server actions, which
// enforce store scope. Managers' store is fixed; owners pick any store or all.

import { useState, useTransition } from "react";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  STORE_OPTIONS,
  scopeLabel,
  type BusinessEvent,
  type EventType,
  type StoreId,
} from "@/components/dashboard/data";
import type { Role } from "@/lib/auth";
import { Card, PageHeader, Micro, Tag } from "@/components/dashboard/ui";
import { createEvent, deleteEvent } from "@/app/dashboard/events/actions";

const typeTone: Record<EventType, "muted" | "orange" | "good" | "warn"> = {
  staffing: "warn",
  promo: "orange",
  price_change: "orange",
  closure: "warn",
  marketing: "good",
  weather: "muted",
  other: "muted",
};

const inputCls =
  "h-9 w-full rounded-lg border border-edge bg-transparent px-3 text-[13.5px] text-ink outline-none placeholder:text-ink-dimmer focus:border-[rgba(254,81,0,0.45)]";

export function EventsClient({
  initialEvents,
  role,
  storeId,
}: {
  initialEvents: BusinessEvent[];
  role: Role;
  storeId: StoreId | null;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [type, setType] = useState<EventType>("staffing");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [store, setStore] = useState<string>(role === "manager" && storeId ? storeId : "all");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setTitle("");
    setDetail("");
    setStart("");
    setEnd("");
    setType("staffing");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !start) {
      setError("A title and a start date are required.");
      return;
    }
    if (end && end < start) {
      setError("The end date is before the start date.");
      return;
    }
    startTransition(async () => {
      const res = await createEvent({ store, type, title, detail, start, end: end || undefined });
      if (res.ok) {
        setEvents((prev) => [res.event, ...prev]);
        reset();
      } else {
        setError(res.error);
      }
    });
  };

  const remove = (id: string) => {
    setError(null);
    const prev = events;
    setEvents((e) => e.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await deleteEvent(id);
      if (!res.ok) {
        setEvents(prev);
        setError(res.error);
      }
    });
  };

  return (
    <div className="animate-stage-in space-y-8">
      <PageHeader
        eyebrow="Context log"
        title="Events"
        sub="Log real-world events — staffing, promos, price changes, closures, weather — so urso.ai can explain WHY a number moved instead of guessing, and tell a real win from a confounded one."
      />

      {error && (
        <div className="rounded-xl border border-[rgba(226,75,74,0.4)] bg-[rgba(226,75,74,0.08)] px-4 py-3 text-[13px] text-ink">{error}</div>
      )}

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <Micro>Type</Micro>
              <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={`${inputCls} mt-1.5`}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Micro>Store</Micro>
              {role === "manager" ? (
                <div className="mt-1.5 flex h-9 items-center rounded-lg border border-edge bg-raise px-3 text-[13.5px] text-ink-dim">
                  {storeId ? scopeLabel(storeId) : "—"}
                </div>
              ) : (
                <select value={store} onChange={(e) => setStore(e.target.value)} className={`${inputCls} mt-1.5`}>
                  {STORE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.short}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          <label className="block">
            <Micro>What happened</Micro>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sarah on medical leave" className={`${inputCls} mt-1.5`} />
          </label>

          <label className="block">
            <Micro>Detail (optional)</Micro>
            <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Anything that helps explain a move" className={`${inputCls} mt-1.5`} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <Micro>Start date</Micro>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} mt-1.5`} />
            </label>
            <label className="block">
              <Micro>End date (blank = ongoing)</Micro>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} mt-1.5`} />
            </label>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-50"
          >
            {pending ? "Saving…" : "Log event"}
          </button>
        </form>
      </Card>

      <div>
        <Micro>Logged events</Micro>
        <div className="mt-3 space-y-3">
          {events.length === 0 ? (
            <Card>
              <p className="text-center text-[13px] text-ink-dim">No events logged yet — add one above so urso.ai can reason about it.</p>
            </Card>
          ) : (
            events.map((ev) => (
              <Card key={ev.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Tag tone={typeTone[ev.type]}>{EVENT_TYPE_LABELS[ev.type]}</Tag>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{ev.store}</span>
                  </div>
                  <h2 className="mt-1.5 text-[15px] font-medium text-ink">{ev.title}</h2>
                  {ev.detail && <p className="mt-1 text-[13px] leading-[1.5] text-ink-dim">{ev.detail}</p>}
                  <Micro className="mt-1.5 !normal-case !tracking-normal">
                    {ev.end ? `${ev.start} → ${ev.end}` : `Since ${ev.start} (ongoing)`}
                  </Micro>
                </div>
                <button
                  onClick={() => remove(ev.id)}
                  className="shrink-0 cursor-pointer rounded-lg border border-edge-strong px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raise hover:text-ink"
                >
                  Delete
                </button>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
