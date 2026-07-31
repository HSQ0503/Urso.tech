import { apiFail, apiOk, apiRoute, denyUnlessConsole } from "@/lib/api/v1";
import { isAllowedHandoffPath, mintHandoffTicket } from "@/lib/canes/webview-handoff";

// POST /api/v1/canes/webview-ticket — mint a one-time URL that opens a web
// console surface inside the app's WebView, already signed in.
//
// The AUTHENTICATION is the wrapper's, exactly like every other route here:
// apiRoute resolves the bearer, and denyUnlessConsole is the layout-equivalent
// guard — the same bar as reaching the console at all, because that is precisely
// what this hands over. Adding a second check here is what broke completeJob;
// adding a WEAKER one would be worse.
//
// The caller names its destination, so the destination is whitelisted server
// side (isAllowedHandoffPath). A client-chosen redirect on an endpoint that
// mints a session is an open redirect with credentials attached.

export const dynamic = "force-dynamic";

type Body = { to?: unknown };

export const POST = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessConsole(actor);
  if (denied) return denied;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }

  if (!isAllowedHandoffPath(body.to)) {
    return apiFail("`to` must be a console path this app can open.", 422);
  }

  // An admin bearer resolves to kind "admin"; a crew account reaching here via
  // denyUnlessConsole (an ops manager) has no admin email to hand to the web
  // session, and the console it would land on is guarded by that same session.
  // Refuse rather than invent an identity.
  const email = actor.kind === "admin" ? actor.email : null;
  if (email === null) {
    return apiFail("Open this from the owner account.", 403);
  }

  const ticket = await mintHandoffTicket(email);
  if (ticket === null) return apiFail("Sign in again.", 401);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://urso.ws";
  const url = `${base}/api/canes/webview/enter?t=${encodeURIComponent(ticket)}&to=${encodeURIComponent(body.to)}`;
  return apiOk({ url });
});
