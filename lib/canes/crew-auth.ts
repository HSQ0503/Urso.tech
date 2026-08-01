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

// ── First-sign-in provisioning ───────────────────────────────────────────────
// The roster is the authorization record; the Supabase auth user and the
// crew_accounts row are just its plumbing, minted on the first sign-in attempt
// rather than when Sebastian adds someone. Adding a technician in Settings
// writes a team_members row and nothing else, deliberately — an account nobody
// ever signs into should not exist.
//
// Lives HERE, not in app/CanesPressure/crew/auth-actions.ts where it was
// written, because that file is "use server": every export in it becomes a
// callable server action, so the web login could not share this with the mobile
// auth broker without also publishing it as an endpoint. Both callers now reach
// one copy of the rule — the alternative was a second copy of an authorization
// decision, which is how completeJob broke for every technician for weeks.
type ApprovedMember = {
  id: string;
  email: string;
  crew_id: string | null;
  active: boolean;
  role: string;
};

export type ProvisionedCrewAccount = {
  id: string;
  auth_user_id: string;
  active: boolean;
};

export async function ensureApprovedTechnicianAccount(
  email: string,
): Promise<ProvisionedCrewAccount | null> {
  const db = canesDb();
  // Workers and ops managers may sign in (0015). A worker still needs a crew;
  // an ops manager runs every crew, so crew_id is optional for them.
  const { data: rawMember, error: memberError } = await db
    .from("team_members")
    .select("id, email, crew_id, active, role")
    .eq("email", email)
    .in("role", ["worker", "ops_manager"])
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  const member = rawMember as ApprovedMember | null;
  if (!member?.active) return null;
  const isOps = member.role === "ops_manager";
  if (!isOps && !member.crew_id) return null;

  const { data: rawExisting } = await db
    .from("crew_accounts")
    .select("id, auth_user_id, active")
    .eq("team_member_id", member.id)
    .maybeSingle();
  const existing = rawExisting as ProvisionedCrewAccount | null;
  if (existing) {
    if (!existing.active) return null;
    // Keep the account's role in sync with the roster: promoting/demoting on
    // the roster takes effect at the next sign-in. Metadata — a failed update
    // (0015 not yet migrated) must not block login.
    const { error: roleErr } = await db
      .from("crew_accounts")
      .update({ account_role: isOps ? "ops_manager" : "technician" })
      .eq("id", existing.id);
    if (roleErr) console.error(`[canes crew auth] account_role sync failed: ${roleErr.message}`);
    if (!isOps && member.crew_id) {
      await db
        .from("crew_account_access")
        .delete()
        .eq("account_id", existing.id)
        .neq("crew_id", member.crew_id);
      await db.from("crew_account_access").upsert(
        { account_id: existing.id, crew_id: member.crew_id },
        { onConflict: "account_id,crew_id", ignoreDuplicates: true },
      );
    }
    return existing;
  }

  const { data: usersData, error: listError } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error(listError.message);
  let user = usersData.users.find(
    (candidate) => candidate.email?.toLowerCase() === email,
  );
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { canes_role: "technician" },
    });
    if (error) throw new Error(error.message);
    user = data.user;
  }
  if (!user) throw new Error("Could not provision the technician Auth user.");

  const { data: rawCreated, error: accountError } = await db
    .from("crew_accounts")
    .insert({
      auth_user_id: user.id,
      team_member_id: member.id,
      email,
      active: true,
      // account_role only when ops: the column default covers technicians, and
      // omitting it keeps worker logins working before 0015 widens the check.
      ...(isOps ? { account_role: "ops_manager" } : {}),
    })
    .select("id, auth_user_id, active")
    .single();
  if (accountError) {
    // A simultaneous first-login request may have won the unique insert.
    const { data: raced } = await db
      .from("crew_accounts")
      .select("id, auth_user_id, active")
      .eq("team_member_id", member.id)
      .maybeSingle();
    if (!raced) throw new Error(accountError.message);
    return raced as ProvisionedCrewAccount;
  }
  const created = rawCreated as ProvisionedCrewAccount;
  if (!isOps && member.crew_id) {
    await db.from("crew_account_access").upsert(
      { account_id: created.id, crew_id: member.crew_id },
      { onConflict: "account_id,crew_id", ignoreDuplicates: true },
    );
  }
  return created;
}
