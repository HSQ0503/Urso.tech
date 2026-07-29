import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listCustomers } from "@/lib/canes/customers";

// GET /api/v1/canes/customers — the customer list the owner console shows,
// with the same optional `?q=` filter the web page passes through. Gated on
// `customers`, matching requirePagePermission("customers") on
// app/CanesPressure/(app)/customers/page.tsx.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessPagePermitted(actor, "customers");
  if (denied) return denied;

  const query = req.nextUrl.searchParams.get("q")?.trim();
  return apiOk(await listCustomers(query || undefined));
});
