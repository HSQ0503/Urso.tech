"use server";

import { getAdminSession } from "@/lib/urso-auth";
import { markTourDone } from "@/lib/canes/tour";

// The tour's only mutation, deliberately separate from the app's actions.ts.
// The email comes from the session, never from the client.
export async function completeTour(): Promise<void> {
  const session = await getAdminSession();
  await markTourDone(session?.email ?? null);
}
