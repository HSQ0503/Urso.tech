import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { getWgMobileActor, type WgMobileActor } from "@/lib/mobile/woof-gang";
import { getAdmin, makeMobileToken } from "@/lib/urso-auth";

export const dynamic = "force-dynamic";

// Exchange a live Woof Gang Supabase urso_admin identity for the same Urso
// mobile bearer used by the existing Canes support surface. This is what makes
// one verified platform login portable across both client workspaces without
// teaching Canes to trust a JWT issued by another tenant's Supabase project.
export const POST = apiRoute<Record<string, string>, WgMobileActor>(async ({ actor }) => {
  if (actor.source !== "supabase" || actor.platformRole !== "admin") {
    return apiFail("Platform administrator access is required.", 403);
  }

  const admin = getAdmin(actor.user.email);
  if (!admin || admin.scope !== "admin") {
    return apiFail("This administrator is not enabled for mobile support.", 403);
  }

  try {
    return apiOk({
      token: makeMobileToken(actor.user.email),
      email: actor.user.email,
      name: admin.name,
      scope: "admin" as const,
    });
  } catch (error) {
    console.error(`[api/v1/mobile/admin/exchange] ${error instanceof Error ? error.message : String(error)}`);
    return apiFail("Urso Control is not configured on this server.", 503);
  }
}, {
  authenticate: (req) => getWgMobileActor(req.headers.get("authorization")),
});
