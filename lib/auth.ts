// Real auth + tenancy layer (Supabase). Identity-derived: the session carries
// the tenant, role and (for managers) the store scope — the URL never does.
// A Supabase login alone is not enough: access requires a provisioned row in
// app_users (migration 0013, written by scripts/provision-users.mjs).
// See vault: "Platform — Multi-Tenancy & Auth" and "Manager Dashboard & Auth — Build Plan".

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseScope, type Scope, type StoreId } from "@/components/dashboard/data";

export type Role = "urso_admin" | "owner" | "manager";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string; // tenant slug; "*" for urso_admin (spans all clients)
  clientName: string;
  storeId: StoreId | null; // set only for managers
  streak: number; // consecutive days signed in — 0 until login history is tracked (UI hides it)
  memberSince: string;
};

type MembershipRow = {
  name: string;
  email: string;
  role: Role;
  store_id: StoreId | null;
  created_at: string;
  clients: { slug: string; name: string } | null;
};

// Resolves the signed-in user from the Supabase auth cookie + their app_users
// membership. Cached per request — the layout and pages can both call it
// without repeating the auth round-trip. Returns null for both "not signed in"
// and "signed in but not provisioned"; callers redirect to /login either way.
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("app_users")
    .select("name, email, role, store_id, created_at, clients(slug, name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;

  const m = data as unknown as MembershipRow;
  return {
    id: user.id,
    name: m.name,
    email: m.email,
    role: m.role,
    clientId: m.clients?.slug ?? "*",
    clientName: m.clients?.name ?? "Urso",
    storeId: m.role === "manager" ? m.store_id : null,
    streak: 0,
    memberSince: new Date(m.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
  };
});

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
