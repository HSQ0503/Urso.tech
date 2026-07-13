"use server";

import { getAdminSession } from "@/lib/urso-auth";
import { markTourDone } from "@/lib/canes/tour";
import { cleanupPractice, seedPractice } from "./practice";

// The tour's mutations, deliberately separate from the app's actions.ts.
// The email comes from the session, never from the client.
export async function completeTour(): Promise<void> {
  const session = await getAdminSession();
  await markTourDone(session?.email ?? null);
}

// Practice seed/cleanup write to the live database — admin session required.
// (The legacy passcode gate can't run the practice; it fails closed.)
export async function beginPractice(): Promise<{ ok: boolean; notice?: string }> {
  if (!(await getAdminSession())) return { ok: false, notice: "Admin sign-in required." };
  return seedPractice();
}

export async function endPractice(): Promise<{ ok: boolean; notice?: string }> {
  if (!(await getAdminSession())) return { ok: false, notice: "Admin sign-in required." };
  return cleanupPractice();
}
