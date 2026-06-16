import { redirect } from "next/navigation";
import { getSession, sessionScope } from "@/lib/auth";
import { getBusinessEvents } from "@/components/dashboard/data.server";
import { EventsClient } from "@/components/dashboard/events-client";

export default async function EventsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  // Managers see (and log) only their store's events plus all-stores events;
  // owners see everything. Scope filtering lives in getBusinessEvents.
  const events = await getBusinessEvents(sessionScope(user));
  return <EventsClient initialEvents={events} role={user.role} storeId={user.storeId} />;
}
