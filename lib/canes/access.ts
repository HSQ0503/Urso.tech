import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/urso-auth";
import { getTechnicianActor } from "@/lib/canes/crew-auth";
import { isDemo } from "@/lib/canes/data";
import type { CrewPermissionKey, TechnicianActor } from "@/lib/canes/crew-types";

// Who is using the owner console, and what may they do (0015).
//
// Three shapes of access:
//   owner — a provisioned Urso admin (Sebastian, Han). Every permission.
//   ops   — a crew account with account_role 'ops_manager' (DJ). Scoped by the
//           account's permission flags; money pages (insights, payouts,
//           expenses, settings) stay owner-only regardless of flags.
//   none  — everyone else.
//
// Pages gate with requirePagePermission / requireOwnerPage (redirects).
// Server actions gate with denyUnlessPermitted (returns an ActionResult-shaped
// refusal or null), so enforcement lives on the server, never in hidden UI.

export type ConsoleAccess =
  | { kind: "owner"; email: string }
  | { kind: "ops"; actor: TechnicianActor }
  | { kind: "none" };

export async function getConsoleAccess(): Promise<ConsoleAccess> {
  const admin = await getAdminSession();
  if (admin) return { kind: "owner", email: admin.email };
  const actor = await getTechnicianActor();
  if (actor?.role === "ops_manager") return { kind: "ops", actor };
  return { kind: "none" };
}

export function accessAllows(access: ConsoleAccess, key: CrewPermissionKey): boolean {
  if (access.kind === "owner") return true;
  if (access.kind === "ops") return access.actor.permissions[key];
  return false;
}

// Page guard: demo mode stays open (fixtures, nothing to protect); otherwise
// redirect an unpermitted session back to the console home.
export async function requirePagePermission(key: CrewPermissionKey): Promise<ConsoleAccess> {
  const access = await getConsoleAccess();
  if (isDemo()) return access;
  if (!accessAllows(access, key)) redirect("/CanesPressure");
  return access;
}

// Money pages: owner only, no flag can open them.
export async function requireOwnerPage(): Promise<void> {
  if (isDemo()) return;
  const access = await getConsoleAccess();
  if (access.kind !== "owner") redirect("/CanesPressure");
}

// Action guard. Returns null when allowed, or an ActionResult-shaped refusal
// to bubble straight back to the client. Owner-only actions pass no key.
export async function denyUnlessPermitted(
  key?: CrewPermissionKey,
): Promise<{ ok: false; notice: string } | null> {
  // Demo runs with no sessions at all — fixtures only, nothing to protect.
  // Live mutations never reach here in demo (they bail on canesConfigured()
  // first); this keeps the guarded read actions working in the demo too.
  if (isDemo()) return null;
  const access = await getConsoleAccess();
  if (access.kind === "owner") return null;
  if (key && access.kind === "ops") {
    return access.actor.permissions[key]
      ? null
      : { ok: false, notice: "Your account doesn't have permission for this — ask the owner." };
  }
  // Technicians in the crew portal still need their scoped action: a
  // permission-flagged technician account may call customers when the owner
  // turns that flag on.
  if (key) {
    const actor = await getTechnicianActor();
    if (actor?.permissions[key]) return null;
  }
  return { ok: false, notice: "You don't have permission for this — ask the owner." };
}
