import { createClient } from "@/lib/supabase/server";
import { getAdmin, readMobileToken } from "@/lib/urso-auth";
import { technicianActorFromAuthUserId, verifyCrewAccessToken } from "@/lib/canes/crew-auth";
import type { TechnicianActor } from "@urso/types";
import type {
  MobilePlatformRole,
  MobileSession,
  MobileWorkspace,
  WgDashboardRole,
  WgStoreId,
} from "@urso/types";

const WG_WORKSPACE: MobileWorkspace = {
  id: "woof-gang",
  name: "Woof Gang Bakery & Grooming",
  role: "owner",
  storeId: null,
};

type MembershipRow = {
  name: string;
  email: string;
  role: WgDashboardRole;
  store_id: WgStoreId | null;
  clients: { slug: string; name: string } | null;
};

export type WgMobileActor = {
  source: "supabase" | "urso_admin";
  user: { id: string; name: string; email: string };
  platformRole: MobilePlatformRole;
  role: WgDashboardRole | "owner";
  storeId: WgStoreId | null;
};

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  const token = rest.join("");
  return scheme.toLowerCase() === "bearer" && token ? token : null;
}

// Resolves a mobile WG identity from a cryptographically verified credential.
// JWT actors always re-read app_users, making removals, role changes, and store
// moves effective on the next request. HMAC is deliberately narrower: only the
// currently configured platform admin may support this tenant.
export async function getWgMobileActor(authorization: string | null): Promise<WgMobileActor | null> {
  const token = bearerToken(authorization);
  if (!token) return null;

  try {
    const admin = readMobileToken(token);
    if (admin?.scope === "admin") {
      const configuredAdmin = getAdmin(admin.email);
      return {
        source: "urso_admin",
        user: { id: `urso:${admin.email}`, name: configuredAdmin?.name ?? "Urso admin", email: admin.email },
        platformRole: "admin",
        role: "owner",
        storeId: null,
      };
    }
  } catch {
    // HMAC verification is fail-closed; a valid Supabase credential can still
    // authenticate below when the Urso admin signing key is unavailable.
  }

  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return null;

    const { data, error } = await supabase
      .from("app_users")
      .select("name, email, role, store_id, clients(slug, name)")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error || !data) return null;

    const membership = data as unknown as MembershipRow;
    const isPlatformAdmin = membership.role === "urso_admin";
    if (!isPlatformAdmin && membership.clients?.slug !== "woof-gang") return null;
    if (membership.role === "manager" && !membership.store_id) return null;

    return {
      source: "supabase",
      user: { id: auth.user.id, name: membership.name, email: membership.email },
      platformRole: isPlatformAdmin ? "admin" : "member",
      role: membership.role,
      storeId: membership.role === "manager" ? membership.store_id : null,
    };
  } catch {
    return null;
  }
}

export function workspaceForWgActor(actor: WgMobileActor): MobileWorkspace {
  return {
    ...WG_WORKSPACE,
    role: actor.role,
    storeId: actor.storeId,
  };
}

function canesWorkspace(actor: TechnicianActor): MobileWorkspace {
  return {
    id: "canes",
    name: "Canes Pressure Washing",
    role: actor.role,
    storeId: null,
  };
}

async function getCanesActor(authorization: string | null): Promise<TechnicianActor | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const authUserId = await verifyCrewAccessToken(token);
  return authUserId ? technicianActorFromAuthUserId(authUserId) : null;
}

function hmacAdmin(authorization: string | null): { email: string; scope: "canes" | "admin" } | null {
  const token = bearerToken(authorization);
  if (!token) return null;
  try {
    return readMobileToken(token);
  } catch {
    return null;
  }
}

function canesOwnerWorkspace(): MobileWorkspace {
  return { id: "canes", name: "Canes Pressure Washing", role: "owner", storeId: null };
}

// One canonical identity response lets the app select its workspace without
// trusting a client-provided role or store. It accepts both existing Canes
// credentials and Woof Gang credentials during the migration period.
export async function getCanonicalMobileSession(authorization: string | null): Promise<MobileSession | null> {
  const wg = await getWgMobileActor(authorization);
  if (wg) {
    const currentWorkspace = workspaceForWgActor(wg);
    const hmac = hmacAdmin(authorization);
    return {
      user: wg.user,
      platformRole: wg.platformRole,
      // A live platform-admin HMAC token is also the existing Canes owner
      // credential. Exposing both workspaces avoids forcing Han to re-login
      // when moving between support surfaces.
      workspaces: hmac?.scope === "admin" ? [currentWorkspace, canesOwnerWorkspace()] : [currentWorkspace],
      currentWorkspace,
    };
  }

  const hmac = hmacAdmin(authorization);
  if (hmac?.scope === "canes") {
    const admin = getAdmin(hmac.email);
    const currentWorkspace = canesOwnerWorkspace();
    return {
      user: { id: `urso:${hmac.email}`, name: admin?.name ?? "Urso admin", email: hmac.email },
      platformRole: "member",
      workspaces: [currentWorkspace],
      currentWorkspace,
    };
  }

  const canes = await getCanesActor(authorization);
  if (!canes) return null;
  const currentWorkspace = canesWorkspace(canes);
  return {
    user: { id: canes.authUserId, name: canes.name, email: canes.email },
    platformRole: "crew",
    workspaces: [currentWorkspace],
    currentWorkspace,
  };
}
