import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listJobExpenses } from "@/lib/canes/expenses";

// GET /api/v1/canes/jobs/:id/expenses — costs logged against one job, oldest
// first, amounts in integer cents exactly as stored.
//
// TWO gates, because the web needs two for the same data: the panel that shows
// these lives inside the job detail sheet on the schedule page
// (requirePagePermission("schedule")), and the read itself goes through
// listJobExpensesAction, which gates on denyUnlessPermitted("invoices").
// Gating this route on `schedule` alone — as the brief specified — would let an
// ops manager with schedule but not invoices read job costs the web console
// refuses them. Requiring both is exact parity, not a widening.

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const deniedSchedule = denyUnlessPagePermitted(actor, "schedule");
  if (deniedSchedule) return deniedSchedule;
  const deniedInvoices = denyUnlessPagePermitted(actor, "invoices");
  if (deniedInvoices) return deniedInvoices;

  const expenses = await listJobExpenses(params.id);
  return apiOk(expenses);
});
