import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/lib/canes/data";
import { consumeHandoffTicket, isAllowedHandoffPath } from "@/lib/canes/webview-handoff";
import { getAdmin, setAdminSession } from "@/lib/urso-auth";

// GET /api/canes/webview/enter?t=…&to=… — redeem a one-time ticket, set the
// admin session cookie, and land on the console page the app asked for.
//
// This lives under /api/canes rather than /api/v1 on purpose: it is a top-level
// BROWSER navigation inside the app's WebView, not a JSON call. It returns
// redirects and HTML-less responses, and it must not be wrapped in the mobile
// envelope.
//
// UNAUTHENTICATED by design, exactly like /api/v1/auth/verify-code: possession
// of the single-use ticket IS the credential, and it was minted only for an
// already-authenticated admin. Everything that makes that safe lives in
// consumeHandoffTicket — hash-at-rest, 60-second TTL, delete-to-claim so a
// replay finds nothing, and ADMINS re-checked at redemption.
//
// The destination is re-validated HERE as well as at mint. The two checks are
// not redundant: the ticket and the `to` travel separately in the URL, so a
// holder of a valid ticket could otherwise rewrite `to` and aim a
// freshly-authenticated browser anywhere.

export const dynamic = "force-dynamic";

// A dead end, not a redirect: sending failures onward from an endpoint whose
// whole job is redirecting is how open redirects grow back.
function refuse(message: string, status: number): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (isDemo()) return refuse("This deployment is in demo mode.", 503);

  const params = req.nextUrl.searchParams;
  const ticket = params.get("t") ?? "";
  const to = params.get("to") ?? "";

  if (!isAllowedHandoffPath(to)) return refuse("That link cannot open here.", 400);

  // consumeHandoffTicket throws on a database error. Unhandled, that renders a
  // raw framework 500 inside the WebView — the one surface with no styling and
  // no way back. Fail closed with a sentence instead. This leaks nothing about
  // the ticket: a bad ticket against a healthy database is still 401 below,
  // and this path is reached only when the database itself is unreachable.
  let email: string | null;
  try {
    email = await consumeHandoffTicket(ticket);
  } catch (error) {
    console.error(`[canes] webview handoff redeem failed — ${String(error)}`);
    return refuse("Couldn’t open that just now. Try again from the app.", 503);
  }
  // One sentence for expired, already-used, forged and unknown alike — the
  // difference between them is not something a caller should be able to probe.
  if (email === null) return refuse("This link has already been used. Open it again from the app.", 401);

  const admin = getAdmin(email);
  if (!admin) return refuse("This link has already been used. Open it again from the app.", 401);

  await setAdminSession(email, admin.scope);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const target = new URL(to, base);
  // Re-check the RESOLVED path, not just the string that was validated. The URL
  // constructor normalises dot-segments, so this is the check that cannot be
  // talked around by an encoding isAllowedHandoffPath did not anticipate — and
  // the session cookie is already set by the time we get here.
  if (!isAllowedHandoffPath(target.pathname) || target.origin !== new URL(base).origin) {
    return refuse("That link cannot open here.", 400);
  }
  const res = NextResponse.redirect(target, 303);
  // The ticket is spent, but the URL that carried it is now in the WebView's
  // history. no-store keeps this response itself out of any cache.
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
