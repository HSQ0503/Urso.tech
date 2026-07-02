"use client";

// The Events ("why" layer) page. Log real-world context — staffing, promos,
// price changes, closures, weather — so urso.ai can explain WHY a number moved.
// Events are loaded on the server (data.server) and passed in; this owns the
// form + the optimistic list. Writes go through the server actions, which
// enforce store scope. Managers' store is fixed; owners pick any store or all.

import { useRef, useState, useTransition, type CSSProperties } from "react";
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
import { Card, PageHeader, Micro, Tag, EmptyState } from "@/components/dashboard/ui";
import { useT } from "@/components/dashboard/locale-provider";
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
  "h-9 w-full rounded-lg border border-edge bg-transparent px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-dimmer hover:border-edge-strong focus:border-[rgba(254,81,0,0.45)]";

export function EventsClient({
  initialEvents,
  role,
  storeId,
}: {
  initialEvents: BusinessEvent[];
  role: Role;
  storeId: StoreId | null;
}) {
  const t = useT();
  const [events, setEvents] = useState(initialEvents);
  const [type, setType] = useState<EventType>("staffing");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [store, setStore] = useState<string>(role === "manager" && storeId ? storeId : "all");
  const [error, setError] = useState<string | null>(null);
  // The just-logged event gets a one-time entrance so the write reads as landed.
  const [freshId, setFreshId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

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
      setError(t("A title and a start date are required."));
      return;
    }
    if (end && end < start) {
      setError(t("The end date is before the start date."));
      return;
    }
    startTransition(async () => {
      const res = await createEvent({ store, type, title, detail, start, end: end || undefined });
      if (res.ok) {
        setEvents((prev) => [res.event, ...prev]);
        setFreshId(res.event.id);
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
    <div className="space-y-3">
      <div className="dash-rise" style={{ "--i": 0 } as CSSProperties}>
        <PageHeader
          eyebrow={t("Context log")}
          title={t("Events")}
        />
      </div>

      {error && (
        <div className="animate-stage-in flex items-baseline gap-3 rounded-none border border-[rgba(254,81,0,0.35)] bg-orange-wash px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-orange">{t("Error")}</span>
          <p className="text-[13px] text-ink">{error}</p>
        </div>
      )}

      <div className="dash-rise" style={{ "--i": 1 } as CSSProperties}>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <Micro>{t("Type")}</Micro>
                <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={`${inputCls} mt-1.5 cursor-pointer`}>
                  {EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {t(EVENT_TYPE_LABELS[et])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <Micro>{t("Store")}</Micro>
                {role === "manager" ? (
                  <div className="mt-1.5 flex h-9 items-center rounded-lg border border-edge bg-raise px-3 text-[13.5px] text-ink-dim">
                    {storeId ? t(scopeLabel(storeId)) : "—"}
                  </div>
                ) : (
                  <select value={store} onChange={(e) => setStore(e.target.value)} className={`${inputCls} mt-1.5 cursor-pointer`}>
                    {STORE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.short)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>

            <label className="block">
              <Micro>{t("What happened")}</Micro>
              <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Sarah on medical leave")} className={`${inputCls} mt-1.5`} />
            </label>

            <label className="block">
              <Micro>{t("Detail (optional)")}</Micro>
              <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={t("Anything that helps explain a move")} className={`${inputCls} mt-1.5`} />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <Micro>{t("Start date")}</Micro>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} mt-1.5`} />
              </label>
              <label className="block">
                <Micro>{t("End date (blank = ongoing)")}</Micro>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} mt-1.5`} />
              </label>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="dash-press cursor-pointer rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-50"
            >
              {pending ? t("Saving…") : t("Log event")}
            </button>
          </form>
        </Card>
      </div>

      <div className="dash-rise" style={{ "--i": 2 } as CSSProperties}>
        <Micro>{t("Logged events")}</Micro>
        <div className="mt-3 space-y-3">
          {events.length === 0 ? (
            <EmptyState
              label={t("Context log")}
              title={t("Nothing logged yet")}
              body={t("Events give urso.ai the why behind every number — staffing, promos, closures, weather.")}
              action={
                <button
                  type="button"
                  onClick={() => titleRef.current?.focus()}
                  className="dash-press cursor-pointer rounded-lg border border-edge-strong px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raise hover:text-ink"
                >
                  {t("Log your first event")}
                </button>
              }
            />
          ) : (
            events.map((ev) => (
              <Card key={ev.id} className={`flex items-start justify-between gap-3 ${ev.id === freshId ? "animate-stage-in" : ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Tag tone={typeTone[ev.type]}>{t(EVENT_TYPE_LABELS[ev.type])}</Tag>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">{ev.store}</span>
                  </div>
                  <h2 className="mt-1.5 text-[15px] font-medium text-ink">{ev.title}</h2>
                  {ev.detail && <p className="mt-1 text-[13px] leading-[1.5] text-ink-dim">{ev.detail}</p>}
                  <Micro className="mt-1.5 !normal-case !tracking-normal">
                    {ev.end ? `${ev.start} → ${ev.end}` : `${t("Since")} ${ev.start} ${t("(ongoing)")}`}
                  </Micro>
                </div>
                <button
                  onClick={() => remove(ev.id)}
                  className="dash-press shrink-0 cursor-pointer rounded-lg border border-edge-strong px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raise hover:text-ink"
                >
                  {t("Delete")}
                </button>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
