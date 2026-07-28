import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { canesDb } from "@/lib/canes/supabase";
import { createCanesAuthClient, getCanesAuthServerEnv } from "@/lib/canes/crew-auth-client";
import { resolvePermissions } from "@/lib/canes/crew-types";
import type { CrewAccountRole, CrewPermissions, TechnicianActor } from "@/lib/canes/crew-types";

type AccountRow = {
  id: string;
  auth_user_id: string;
  team_member_id: string;
  email: string;
  active: boolean;
  // 0015 columns — optional so a deploy that lands ahead of the migration
  // still authenticates technicians (select("*") tolerates their absence).
  account_role?: string | null;
  permissions?: Partial<CrewPermissions> | null;
};

type TeamMemberRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  crew_id: string | null;
  active: boolean;
};

// Verify a Canes Supabase access token and return its auth user id.
// supabase-js validates the JWT against the project's auth server, so a revoked
// or expired session fails here instead of resolving to a stale user.
//
// A malformed token is an UNAUTHENTICATED caller, never a server error: every
// failure path returns null so callers surface 401 rather than 500.
export async function verifyCrewAccessToken(token: string): Promise<string | null> {
  let url: string;
  let key: string;
  try {
    ({ url, key } = getCanesAuthServerEnv());
  } catch {
    return null; // Canes auth unconfigured.
  }
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

function bearerToken(raw: string | null): string | null {
  if (!raw) return null;
  const [scheme, ...rest] = raw.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join("");
  return token.length > 0 ? token : null;
}

export const getTechnicianActor = cache(async (): Promise<TechnicianActor | null> => {
  const auth = await createCanesAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (user) return technicianActorFromAuthUserId(user.id);

  // Phase 6 — bearer fallback for the Expo app. The mobile client holds a
  // Supabase session in the Keychain and sends it as an Authorization header
  // because React Native has no cookie jar tied to this origin.
  //
  // This is the ONE change point that makes every existing crew server action
  // callable over /api/v1 without touching the actions themselves — they all
  // start with requireTechnicianActor(), so the identity resolves here and the
  // job-scoping, permission and claim logic below is shared verbatim between
  // web and mobile. Duplicating those 9 actions for the API would have been the
  // alternative, and they would have drifted.
  //
  // The cookie is checked FIRST, so browser behaviour is unchanged. Bearer
  // tokens are not sent automatically by browsers, so this path adds no CSRF
  // surface; a caller presenting one is authenticating as themselves.
  const token = bearerToken((await headers()).get("authorization"));
  if (!token) return null;
  const authUserId = await verifyCrewAccessToken(token);
  return authUserId ? technicianActorFromAuthUserId(authUserId) : null;
});

// Resolve the actor from an ALREADY-AUTHENTICATED Supabase auth user id.
// Extracted verbatim from getTechnicianActor so the cookie path (web) and the
// bearer path (mobile API, Phase 6) share one authorization body — a permission
// or crew-scoping rule can never drift between the two surfaces.
//
// SECURITY: callers must have verified the user id cryptographically. The web
// path gets it from the session cookie via @supabase/ssr; the API path verifies
// the access token with supabase.auth.getUser(token). Never pass a user id that
// came from a request body or header.
export async function technicianActorFromAuthUserId(
  authUserId: string,
): Promise<TechnicianActor | null> {
  const db = canesDb();
  const { data: rawAccount } = await db
    .from("crew_accounts")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const account = rawAccount as AccountRow | null;
  if (!account?.active) return null;

  const { data: rawMember } = await db
    .from("team_members")
    .select("id, name, phone, email, crew_id, active")
    .eq("id", account.team_member_id)
    .maybeSingle();
  const member = rawMember as TeamMemberRow | null;
  if (!member?.active) return null;

  const role: CrewAccountRole = account.account_role === "ops_manager" ? "ops_manager" : "technician";
  const permissions = resolvePermissions(role, account.permissions);

  // Technicians: exactly one roster-assigned crew — team_members.crew_id is the
  // authority so moving an employee immediately revokes the old crew. An ops
  // manager runs every crew (DJ dispatches all of them), so their scope is all
  // active crews and a missing crew_id doesn't lock them out.
  let crews: { id: string; name: string }[];
  if (role === "ops_manager") {
    const { data: rawCrews } = await db.from("crews").select("id, name").eq("active", true);
    crews = (rawCrews ?? []) as { id: string; name: string }[];
  } else {
    if (!member.crew_id) return null;
    const { data: rawCrews } = await db
      .from("crews")
      .select("id, name")
      .in("id", [member.crew_id])
      .eq("active", true);
    crews = (rawCrews ?? []) as { id: string; name: string }[];
    if (crews.length === 0) return null;
  }

  return {
    kind: "technician",
    accountId: account.id,
    authUserId,
    teamMemberId: member.id,
    email: account.email,
    name: member.name,
    phone: member.phone,
    role,
    permissions,
    crewIds: crews.map((crew) => crew.id),
    crewNames: crews.map((crew) => crew.name),
  };
}

export async function requireTechnicianActor(): Promise<TechnicianActor> {
  const actor = await getTechnicianActor();
  if (!actor) redirect("/CanesPressure/crew/login");
  return actor;
}

export async function technicianCanAccessJob(
  actor: TechnicianActor,
  jobId: string,
): Promise<boolean> {
  const { data } = await canesDb()
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .in("crew_id", actor.crewIds)
    .maybeSingle();
  return Boolean(data);
}

export async function requireTechnicianJob(
  actor: TechnicianActor,
  jobId: string,
): Promise<void> {
  if (!(await technicianCanAccessJob(actor, jobId))) {
    throw new Error("You do not have access to this job.");
  }
}
