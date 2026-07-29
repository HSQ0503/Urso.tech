import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listEstimateExpenses } from "@/lib/canes/expenses";

// GET /api/v1/canes/estimates/:id/expenses — the quote-time cost rows for one
// estimate. The web surface is the estimate page's costs panel, which reads
// through listEstimateExpensesAction(); that action gates on
// denyUnlessPermitted("estimates"), so this gates on the same key. It is NOT
// owner-only, despite being money: the owner console deliberately shows crew
// with the estimates flag what a quote costs to fulfil.
//
// listEstimateExpenses() returns [] — never null — for an unknown estimate, the
// same answer as an estimate with no costs recorded yet, so there is no 404
// branch to write and no way to probe for estimate ids. It also degrades to []
// rather than throwing when the 0014 migration has not run.
//
// Amounts stay in integer cents exactly as the domain read returns them.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;

  const expenses = await listEstimateExpenses(params.id);
  return apiOk(expenses);
});
