import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { listBusinessExpenses } from "@/lib/canes/overhead";

// GET /api/v1/canes/overhead — the active business/overhead expense rows
// (subscriptions, insurance, truck, marketing) behind /CanesPressure/expenses.
//
// OWNER ONLY, matching requireOwnerPage() on that page.
//
// The raw rows are returned as stored: no monthly normalization, no pro-rating,
// no totals. Those are lib/canes/overhead computations the web page performs
// for display, and doing them here would be business logic this layer must not
// own. Amounts stay in integer cents.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  return apiOk(await listBusinessExpenses());
});
