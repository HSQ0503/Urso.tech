// Real-world events ("why" layer), admin-side. Read with the service-role
// client for the weekly cron + metric-verified learning, which run without a
// user session. The request-scoped readers (chat tool + Events page) live in
// data.server.ts; this module is the batch/admin counterpart plus the overlap
// helper the outcomes confounding check uses.

import { createAdminClient } from "@/lib/supabase/admin";
import { stores, type StoreId, type EventType } from "@/components/dashboard/data";

type Admin = ReturnType<typeof createAdminClient>;

export type EventRecord = {
  storeId: StoreId | null; // null = applies to all stores
  type: EventType;
  title: string;
  detail: string | null;
  start: string; // YYYY-MM-DD
  end: string | null; // YYYY-MM-DD, or null if ongoing
};

type Row = {
  store_id: StoreId | null; type: EventType; title: string;
  detail: string | null; start_date: string; end_date: string | null;
};

// Every event overlapping [start, end] (inclusive dates). Overlap = starts
// on/before the window end AND (ends on/after the window start OR is ongoing).
export async function gatherEvents(supabase: Admin, start: string, end: string): Promise<EventRecord[]> {
  const { data, error } = await supabase
    .from("business_events")
    .select("store_id, type, title, detail, start_date, end_date")
    .lte("start_date", end)
    .or(`end_date.gte.${start},end_date.is.null`)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`business_events read failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    storeId: r.store_id, type: r.type, title: r.title, detail: r.detail, start: r.start_date, end: r.end_date,
  }));
}

// Events that apply to a store set and overlap [start, end) — used to flag a
// confounded outcome window. A null store_id applies to every store. Dates are
// YYYY-MM-DD, so string comparison is correct.
export function eventsOverlapping(events: EventRecord[], storeIds: Set<StoreId>, start: string, end: string): EventRecord[] {
  return events.filter((e) => {
    const inScope = e.storeId === null || storeIds.has(e.storeId);
    const startsBeforeEnd = e.start < end;
    const endsAfterStart = e.end === null || e.end >= start;
    return inScope && startsBeforeEnd && endsAfterStart;
  });
}

const STORE_NAME: Record<StoreId, string> = Object.fromEntries(stores.map((s) => [s.id, s.name])) as Record<StoreId, string>;

// Compact one-line label for prompts: "staffing · Sarah on leave (Winter Park, since 2026-05-03)".
export function eventLabel(e: EventRecord): string {
  const scope = e.storeId ? STORE_NAME[e.storeId] : "All stores";
  const span = e.end ? `${e.start}→${e.end}` : `since ${e.start}`;
  return `${e.type} · ${e.title} (${scope}, ${span})`;
}
