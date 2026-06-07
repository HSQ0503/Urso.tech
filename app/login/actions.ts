"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_USERS, SESSION_COOKIE, homePathFor } from "@/lib/auth";

// Mock sign-in: pick an identity. Real auth validates a password / magic link
// against Supabase, then sets the session the same way.
export async function signIn(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const user = MOCK_USERS[id];
  if (!user) return;
  const store = await cookies();
  store.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect(homePathFor(user.role));
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
