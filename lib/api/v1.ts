import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readMobileToken, type AdminScope } from "@/lib/urso-auth";
import { technicianActorFromAuthUserId, verifyCrewAccessToken } from "@/lib/canes/crew-auth";
import { accessAllows, type ConsoleAccess } from "@/lib/canes/access";
import { isDemo } from "@/lib/canes/data";
import type { CrewPermissionKey, TechnicianActor } from "@/lib/canes/crew-types";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@urso/types";

// ─────────────────────────────────────────────────────────────────────────────
// /api/v1 — the JSON layer the Expo app talks to (Phase 6).
//
// The web app calls lib/canes/* directly (server components) and mutates
// through server actions. React Native can do neither, so this layer gives the
// SAME domain functions an HTTP face. It adds no business logic of its own:
// authenticate → authorize with the existing access.ts rules → call the
// existing function → wrap the result.
//
// Three invariants, in order of importance:
//
//   1. NEVER widen a permission to make mobile easier. Every authorization
//      decision routes through the same access.ts predicates the web uses.
//      If an action refuses on web it must refuse here.
//   2. Authentication is cryptographic on every request. There is no ambient
//      session, no trusted header, no client-supplied identity.
//   3. Errors never leak driver text. A caller gets a stable notice plus a
//      request id; the real message goes to the server log.
//
// The response envelope is deliberately identical to the ActionResult shape
// every server action already returns ({ ok, notice? }), so the mobile client
// has ONE result type for reads and writes alike.
// ─────────────────────────────────────────────────────────────────────────────

export const API_VERSION = "1";

const VERSION_HEADER = { "X-Urso-Api-Version": API_VERSION } as const;

export type ApiActor =
  | { kind: "admin"; email: string; scope: AdminScope }
  | { kind: "technician"; actor: TechnicianActor };

// ── Response envelope ────────────────────────────────────────────────────────

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status, headers: VERSION_HEADER });
}

export function apiFail(notice: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, notice }, { status, headers: VERSION_HEADER });
}

// A domain ActionResult passed straight through. `ok:false` from an action is a
// business refusal ("This job just changed"), not a transport error — it maps to
// 409 so the client can distinguish it from 401/403 and simply show the notice.
export function apiResult(
  result: { ok: boolean; notice?: string } & Record<string, unknown>,
): NextResponse {
  if (result.ok) {
    // Anything else the action returned (invoiceId, grant, …) becomes the
    // payload — but the NOTICE IS KEPT, and that matters more than it looks.
    //
    // 17 actions return ok:true WITH a notice, and several of those are
    // QUALIFIED successes rather than confirmations: "Approved. The deposit
    // link could not be created — send it from the estimate.", the
    // double-booking warning from scheduleJob, a cash payment recorded against
    // a total that had already moved. Dropping the sentence turned every one of
    // them into an unqualified success, so a phone would report a deposit taken
    // that was never taken. On the money path that is the worst possible
    // rounding of the truth.
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      if (key !== "ok" && key !== "notice") data[key] = value;
    }
    if (typeof result.notice === "string" && result.notice.length > 0) {
      data.notice = result.notice;
    }
    return apiOk(data);
  }
  return apiFail(result.notice ?? "That didn't go through — try again.", 409);
}

// ── Authentication ───────────────────────────────────────────────────────────

function bearerFrom(req: NextRequest): string | null {
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const [scheme, ...rest] = raw.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join("");
  return token.length > 0 ? token : null;
}

// Resolve the caller. Admin is tried first because it is a local HMAC check
// with no network round-trip; a Supabase JWT simply fails that signature check
// and falls through. Both paths are cryptographically verified, so the order is
// a performance choice, not a security one.
export async function authenticate(req: NextRequest): Promise<ApiActor | null> {
  const token = bearerFrom(req);
  if (!token) return null;

  let admin: { email: string; scope: AdminScope } | null = null;
  try {
    admin = readMobileToken(token);
  } catch (e) {
    // readMobileToken throws only when URSO_AUTH_SECRET is missing in
    // production — a real misconfiguration, logged loudly here. It must NOT
    // take crew access down with it: technicians authenticate against Supabase
    // and never touch this secret. Admins simply cannot authenticate (there is
    // no key to verify with), which is the correct fail-closed outcome.
    console.error(
      `[api/v1] admin token verification unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (admin) return { kind: "admin", email: admin.email, scope: admin.scope };

  const authUserId = await verifyCrewAccessToken(token);
  if (!authUserId) return null;

  // Re-resolves role, permissions and crew scoping from the database on every
  // request — the same body the web cookie path uses, so deactivating an
  // account or moving a technician between crews takes effect immediately.
  const actor = await technicianActorFromAuthUserId(authUserId);
  return actor ? { kind: "technician", actor } : null;
}

// ── Authorization ────────────────────────────────────────────────────────────

// Map a bearer actor onto the ConsoleAccess shape access.ts already reasons
// about, so the pure accessAllows() predicate is shared rather than reimplemented.
export function consoleAccessFor(actor: ApiActor): ConsoleAccess {
  if (actor.kind === "admin") return { kind: "owner", email: actor.email };
  if (actor.actor.role === "ops_manager") return { kind: "ops", actor: actor.actor };
  return { kind: "none" };
}

// Mirrors denyUnlessPermitted() in lib/canes/access.ts, including its
// technician fallback (a technician with a flag turned on may use that scoped
// capability). Returns null when allowed, or the response to return.
export function denyUnlessApiPermitted(
  actor: ApiActor,
  key?: CrewPermissionKey,
): NextResponse | null {
  const access = consoleAccessFor(actor);
  if (access.kind === "owner") return null;
  if (key && access.kind === "ops") {
    return access.actor.permissions[key]
      ? null
      : apiFail("Your account doesn't have permission for this — ask the owner.", 403);
  }
  if (key && actor.kind === "technician" && actor.actor.permissions[key]) return null;
  if (!key) {
    // Owner-only endpoint (money pages): no flag can open it.
    return apiFail("This is owner-only.", 403);
  }
  return apiFail("You don't have permission for this — ask the owner.", 403);
}

// Owner-only, matching requireOwnerPage(): insights, payouts, expenses, settings.
export function denyUnlessOwner(actor: ApiActor): NextResponse | null {
  return actor.kind === "admin" ? null : apiFail("This is owner-only.", 403);
}

// "May this caller use the owner console at all?" — the guard the (app) LAYOUT
// applies on the web, which has no equivalent here.
//
// This gap produced the worst finding of the M6b review. The Today page carries
// no requirePagePermission of its own, so a route built from it looked like it
// needed no guard — but app/CanesPressure/(app)/layout.tsx redirects a plain
// technician to /CanesPressure/crew before the page ever renders. /api/v1 has no
// layout, so that protection silently vanished and any active crew account could
// read the owner's revenue. Same shape as the completeJob bug: a guard that
// lives in one surface's STRUCTURE does not travel to another surface.
//
// Owner or ops-manager, not owner-only: DJ genuinely has Today on the web.
export function denyUnlessConsole(actor: ApiActor): NextResponse | null {
  return consoleAccessFor(actor).kind === "none"
    ? apiFail("This is for the owner console.", 403)
    : null;
}

// Page-parity permission check, for routes derived from a PAGE rather than an
// action. denyUnlessApiPermitted mirrors denyUnlessPermitted, including its
// technician fallback — correct for actions a flagged technician may invoke from
// the crew portal, but WRONG for reads that back an owner-console page:
// requirePagePermission goes through accessAllows, which is false for any plain
// technician regardless of flags. Using the action guard for a page read makes
// mobile strictly more permissive than web.
export function denyUnlessPagePermitted(
  actor: ApiActor,
  key: CrewPermissionKey,
): NextResponse | null {
  return accessAllows(consoleAccessFor(actor), key)
    ? null
    : apiFail("You don’t have permission for this — ask the owner.", 403);
}

// Technician-surface endpoints. An ops manager is also a crew account and keeps
// its crew scoping, so it passes; a pure admin has no crew identity and must use
// the owner endpoints instead.
export function requireTechnician(actor: ApiActor): TechnicianActor | NextResponse {
  if (actor.kind !== "technician") {
    return apiFail("This endpoint is for crew accounts.", 403);
  }
  return actor.actor;
}

export { accessAllows };

// ── Shared body validators ───────────────────────────────────────────────────

// `as PaymentMethod` is an assertion, not a check — TypeScript verifies nothing
// at runtime, and nothing downstream does either: the actions default with
// `?? "cash"` and the column has no CHECK constraint. An arbitrary string
// therefore lands in the payments ledger as the recorded method, which is the
// record the business reconciles against. Validated against the label map so a
// new method can never be accepted here before it exists in the domain.
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && Object.hasOwn(PAYMENT_METHOD_LABEL, value);
}

// Money crossing this layer is always integer cents and never negative. The
// actions clamp some of it (`Math.min` caps a deposit at the total) but nothing
// rejects a negative, so a negative deposit silently REDUCES what was collected
// and reports success.
export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// ── Handler wrapper ──────────────────────────────────────────────────────────

export type ApiHandler<P = Record<string, string>> = (ctx: {
  req: NextRequest;
  actor: ApiActor;
  params: P;
}) => Promise<NextResponse>;

export type CrewHandler<P = Record<string, string>> = (ctx: {
  req: NextRequest;
  actor: ApiActor;
  technician: TechnicianActor;
  params: P;
}) => Promise<NextResponse>;

// Wraps every /api/v1 route: demo gate → authenticate → handler → error net.
//
// Demo deployments return 503 rather than serving fixtures. The web app
// deliberately serves fixtures when CANES_DEMO=1, but a mobile client has no
// visible "demo" affordance and a technician looking at seeded jobs in a real
// yard is a genuinely bad failure. Fail closed and say why.
export function apiRoute<P extends Record<string, string> = Record<string, string>>(
  handler: ApiHandler<P>,
) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<P> } = { params: Promise.resolve({} as P) },
  ): Promise<NextResponse> => {
    if (isDemo()) {
      return apiFail("This deployment is in demo mode — the mobile API is disabled.", 503);
    }
    try {
      const actor = await authenticate(req);
      if (!actor) return apiFail("Sign in again.", 401);
      const params = await ctx.params;
      return await handler({ req, actor, params });
    } catch (e) {
      // A redirect() inside an action throws NEXT_REDIRECT. Two very different
      // things arrive here that way, and treating them alike was wrong.
      //
      //   requireTechnicianActor() -> redirect to a LOGIN page = auth failure.
      //   deleteLead / deleteEstimate / deleteInvoice / deleteContact all END
      //   in redirect("/CanesPressure/<list>") on SUCCESS — that is how the web
      //   navigates away from a page whose record no longer exists.
      //
      // Mapping every NEXT_REDIRECT to 401 meant a successful delete removed the
      // row and then told the client its session had died: the owner got bounced
      // to sign-in, and on retry saw "not found" for something they had in fact
      // just deleted. The destination is what separates the two cases.
      if (
        e && typeof e === "object" && "digest" in e && typeof e.digest === "string" &&
        e.digest.startsWith("NEXT_REDIRECT")
      ) {
        // digest is "NEXT_REDIRECT;<kind>;<url>;<status>;"
        const target = e.digest.split(";")[2] ?? "";
        if (/\/login(\/|$|\?)/.test(target)) return apiFail("Sign in again.", 401);
        // A post-mutation redirect means the action completed. Hand back the
        // destination so a client can follow the same navigation the web does.
        return apiOk({ done: true, redirectTo: target });
      }
      // Never surface driver text: a Postgres or Supabase message can name
      // tables, columns and constraints. Log it, hand back an id.
      const id = randomUUID().slice(0, 8);
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[api/v1 ${id}] ${req.method} ${req.nextUrl.pathname} — ${msg}`);
      return apiFail(`Something went wrong. Reference ${id}.`, 500);
    }
  };
}

// Technician-surface routes. Asserts crew identity BEFORE the handler runs,
// which fixes two things the acceptance suite caught:
//
//   1. Routes that delegate straight to a crew server action used to answer 401
//      for an authenticated admin, because the action re-resolved identity
//      internally, found no technician and redirect()ed. 401 tells the app "your
//      session died, sign in again" — which would drop a perfectly good owner
//      session. An authenticated caller on the wrong surface is 403.
//   2. Routes that parse a body used to answer 422 ("Send a JSON body") before
//      deciding whether the caller may call them at all. Authorization must
//      precede request-shape validation, or the endpoint describes itself to
//      someone who was never allowed to reach it.
export function crewRoute<P extends Record<string, string> = Record<string, string>>(
  handler: CrewHandler<P>,
) {
  return apiRoute<P>(async ({ req, actor, params }) => {
    const technician = requireTechnician(actor);
    if (technician instanceof Response) return technician;
    return handler({ req, actor, technician, params });
  });
}
