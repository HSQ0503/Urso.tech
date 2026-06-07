// Mock auth + tenancy layer. Identity-derived: the session carries the tenant,
// role and (for managers) the store scope — the URL never does. Swapped for
// Supabase Auth + RLS later behind these same shapes, so callers don't change.
// See vault: "Platform — Multi-Tenancy & Auth" and "Manager Dashboard & Auth — Build Plan".

import { cookies } from "next/headers";
import { parseScope, type Scope, type StoreId } from "@/components/dashboard/data";

export type Role = "urso_admin" | "owner" | "manager";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string; // tenant; "*" for urso_admin (spans all clients)
  clientName: string;
  storeId: StoreId | null; // set only for managers
  streak: number; // consecutive days signed in (mock — real value comes from login history)
  memberSince: string;
};

export const SESSION_COOKIE = "urso_session";

// Mock directory. Real auth resolves the signed-in user from the Supabase
// session + `users` membership and returns this same shape.
export const MOCK_USERS: Record<string, SessionUser> = {
  urso: { id: "urso", name: "Han · Urso", email: "han@urso.tech", role: "urso_admin", clientId: "*", clientName: "Urso", storeId: null, streak: 21, memberSince: "May 2026" },
  owner: { id: "owner", name: "Woof Gang owner", email: "owner@woofgangbakery.com", role: "owner", clientId: "woof-gang", clientName: "Woof Gang", storeId: null, streak: 9, memberSince: "May 2026" },
  "mgr-wp": { id: "mgr-wp", name: "Winter Park manager", email: "winterpark@woofgangbakery.com", role: "manager", clientId: "woof-gang", clientName: "Woof Gang", storeId: "wp", streak: 14, memberSince: "May 2026" },
  "mgr-wg": { id: "mgr-wg", name: "Winter Garden manager", email: "wintergarden@woofgangbakery.com", role: "manager", clientId: "woof-gang", clientName: "Woof Gang", storeId: "wg", streak: 8, memberSince: "May 2026" },
  "mgr-lv": { id: "mgr-lv", name: "Lakeside manager", email: "lakeside@woofgangbakery.com", role: "manager", clientId: "woof-gang", clientName: "Woof Gang", storeId: "lv", streak: 5, memberSince: "Jun 2026" },
  "mgr-wm": { id: "mgr-wm", name: "Windermere manager", email: "windermere@woofgangbakery.com", role: "manager", clientId: "woof-gang", clientName: "Woof Gang", storeId: "wm", streak: 6, memberSince: "Jun 2026" },
};

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  return (id && MOCK_USERS[id]) || null;
}

// The scope a session may see. Owners / urso_admin → "all" (and can narrow via
// the filter). Managers → pinned to their store, always.
export function sessionScope(user: SessionUser): Scope {
  return user.role === "manager" && user.storeId ? user.storeId : "all";
}

// Effective scope for a page: managers ignore the URL (can't escape their
// store); everyone else honors ?store=. Real enforcement is RLS at the DB.
export function resolveScope(user: SessionUser, urlStore: string | undefined): Scope {
  if (user.role === "manager" && user.storeId) return user.storeId;
  return parseScope(urlStore);
}

// Where each role lands after login.
export function homePathFor(role: Role): string {
  return role === "urso_admin" ? "/console" : "/dashboard";
}
