"use server";

// Server actions for the Events ("why" layer) page. Auth + store scope are
// enforced here before the SECURITY DEFINER RPCs (migration 0020) write —
// mirrors app/dashboard/actions/actions.ts. A manager can only log/delete events
// for their own store; the owner can log any store or all stores.

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPES, STORE_OPTIONS, type BusinessEvent, type EventType, type StoreId } from "@/components/dashboard/data";

const TYPES = new Set<string>(EVENT_TYPES);
const STORE_LABEL = new Map(STORE_OPTIONS.map((o) => [o.value, o.label]));
const VALID_STORES = new Set<string>(["wp", "wg", "lv", "wm"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createEvent(input: {
  store: string; type: string; title: string; detail?: string; start: string; end?: string;
}): Promise<{ ok: true; event: BusinessEvent } | { ok: false; error: string }> {
  const user = await getSession();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.role === "urso_admin") return { ok: false, error: "Admins manage events from the console" };
  if (!TYPES.has(input.type)) return { ok: false, error: `Invalid type: ${input.type}` };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required" };
  if (!DATE.test(input.start)) return { ok: false, error: "A valid start date is required" };
  if (input.end && !DATE.test(input.end)) return { ok: false, error: "End date is invalid" };
  if (input.end && input.end < input.start) return { ok: false, error: "End date is before the start date" };

  // Store scope: managers are forced to their own store; owners pick any or all.
  let storeId: StoreId | null;
  if (user.role === "manager") {
    if (!user.storeId) return { ok: false, error: "No store is set on your account" };
    storeId = user.storeId;
  } else if (input.store === "all") {
    storeId = null;
  } else if (VALID_STORES.has(input.store)) {
    storeId = input.store as StoreId;
  } else {
    return { ok: false, error: `Invalid store: ${input.store}` };
  }

  const detail = input.detail?.trim() || null;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_business_event", {
    p_store: storeId, p_type: input.type, p_title: title, p_detail: detail,
    p_start: input.start, p_end: input.end || null, p_actor: user.email,
  });
  if (error) return { ok: false, error: error.message };

  const event: BusinessEvent = {
    id: id as string,
    storeId,
    store: storeId ? (STORE_LABEL.get(storeId) ?? storeId) : "All stores",
    type: input.type as EventType,
    title,
    detail,
    start: input.start,
    end: input.end || null,
    createdBy: user.email,
  };
  revalidatePath("/dashboard/events");
  return { ok: true, event };
}

export async function deleteEvent(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSession();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.role === "urso_admin") return { ok: false, error: "Admins manage events from the console" };

  const supabase = await createClient();
  const { data: ev, error: readErr } = await supabase.from("business_events").select("store_id").eq("id", id).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!ev) return { ok: false, error: "Event not found" };
  if (user.role === "manager" && ev.store_id !== user.storeId) return { ok: false, error: "That event is outside your store" };

  const { error } = await supabase.rpc("delete_business_event", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/events");
  return { ok: true };
}
