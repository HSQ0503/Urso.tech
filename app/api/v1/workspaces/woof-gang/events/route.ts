import { EVENT_TYPES, STORE_OPTIONS, type BusinessEvent, type EventType, type StoreId } from "@/components/dashboard/data";
import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { getWgMobileActor, type WgMobileActor } from "@/lib/mobile/woof-gang";
import { createClient } from "@/lib/supabase/server";

type EventBody = {
  action?: unknown;
  id?: unknown;
  store?: unknown;
  eventType?: unknown;
  title?: unknown;
  detail?: unknown;
  start?: unknown;
  end?: unknown;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validStores = new Set<string>(["wp", "wg", "lv", "wm"]);
const storeLabels = new Map(STORE_OPTIONS.map((option) => [option.value, option.label]));

export const POST = apiRoute<Record<string, string>, WgMobileActor>(async ({ req, actor }) => {
  if (actor.role === "urso_admin") return apiFail("Admins manage events from Urso Control.", 403);
  let body: EventBody;
  try {
    body = (await req.json()) as EventBody;
  } catch {
    return apiFail("Send a valid event update.", 400);
  }

  const supabase = await createClient();
  if (body.action === "delete") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return apiFail("Choose an event to delete.", 400);
    try {
      const { data: event, error: readError } = await supabase.from("business_events").select("store_id").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!event) return apiFail("Event not found.", 404);
      if (actor.role === "manager" && event.store_id !== actor.storeId) return apiFail("That event is outside your store.", 403);
      const { error } = await supabase.rpc("delete_business_event", { p_id: id });
      if (error) throw error;
      return apiOk({ id, deleted: true });
    } catch (error) {
      console.error(`[api/v1/workspaces/woof-gang/events] delete: ${error instanceof Error ? error.message : String(error)}`);
      return apiFail("The event could not be deleted. Try again.", 503);
    }
  }

  const eventType = typeof body.eventType === "string" && EVENT_TYPES.some((type) => type === body.eventType) ? body.eventType as EventType : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const detail = typeof body.detail === "string" ? body.detail.trim() : "";
  const start = typeof body.start === "string" ? body.start : "";
  const end = typeof body.end === "string" ? body.end : "";
  if (!eventType || !title || !DATE.test(start) || (end && !DATE.test(end))) return apiFail("Type, title, and a valid start date are required.", 400);
  if (end && end < start) return apiFail("The end date is before the start date.", 400);

  let storeId: StoreId | null;
  if (actor.role === "manager") {
    if (!actor.storeId) return apiFail("No store is assigned to this account.", 403);
    storeId = actor.storeId;
  } else if (body.store === "all" || body.store == null) storeId = null;
  else if (typeof body.store === "string" && validStores.has(body.store)) storeId = body.store as StoreId;
  else return apiFail("Choose a valid store.", 400);

  try {
    const { data: id, error } = await supabase.rpc("create_business_event", {
      p_store: storeId,
      p_type: eventType,
      p_title: title,
      p_detail: detail || null,
      p_start: start,
      p_end: end || null,
      p_actor: actor.user.email,
    });
    if (error) throw error;
    const event: BusinessEvent = { id: id as string, storeId, store: storeId ? storeLabels.get(storeId) ?? storeId : "All stores", type: eventType, title, detail: detail || null, start, end: end || null, createdBy: actor.user.email };
    return apiOk({ event });
  } catch (error) {
    console.error(`[api/v1/workspaces/woof-gang/events] create: ${error instanceof Error ? error.message : String(error)}`);
    return apiFail("The event could not be saved. Try again.", 503);
  }
}, {
  authenticate: (req) => getWgMobileActor(req.headers.get("authorization")),
});
