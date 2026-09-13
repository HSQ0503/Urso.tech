import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import {
  createRecurringPlan,
  createRecurringPlanFromEstimate,
  createRecurringPlanFromInvoice,
  createRecurringPlanFromJob,
} from "@/app/CanesPressure/actions";
import { isDateKey, isPlanCadence, listPlans, mrrCentsOf } from "@/lib/canes/recurring";
import type { PlanLineInput } from "@/lib/canes/recurring";

// GET /api/v1/canes/recurring — every recurring plan, newest first, plus the
// headline the Recurring screen prints: MRR / ARR across active plans.
//
// POST /api/v1/canes/recurring — create a plan: from an estimate, an invoice,
// a work order, or by hand. Same `action` discriminator as the other
// collections so the mobile client has one call shape.
//
// Guarded on `estimates`: a plan is a contract the customer signs, the same
// family of document as a quote, and the same permission gates it.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;
  const plans = await listPlans();
  const mrrCents = mrrCentsOf(plans);
  return apiOk({
    plans,
    summary: {
      activeCount: plans.filter((p) => p.status === "active").length,
      mrrCents,
      arrCents: mrrCents * 12,
    },
  });
});

type Body = {
  action?: unknown;
  estimateId?: unknown;
  invoiceId?: unknown;
  jobId?: unknown;
  cadence?: unknown;
  startsOn?: unknown;
  input?: unknown;
};

function isLineInput(value: unknown): value is PlanLineInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.quantity === "number" &&
    typeof v.unitPriceCents === "number" &&
    Number.isInteger(v.unitPriceCents) &&
    v.unitPriceCents >= 0 &&
    (v.description === undefined || v.description === null || typeof v.description === "string")
  );
}

export const POST = apiRoute(async ({ req }) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.action !== "string") return apiFail("Send an `action`.", 422);

  // Every creation needs the two things the source document cannot know: how
  // often, and when the first visit is. Both are validated here so a plan is
  // never half-made from a typo the action would have refused after the insert.
  const needsCadence = () => {
    if (!isPlanCadence(body.cadence)) return apiFail("`cadence` must be monthly, quarterly, semiannual or yearly.", 422);
    if (!isDateKey(body.startsOn)) return apiFail("`startsOn` must be a calendar date, YYYY-MM-DD.", 422);
    return null;
  };

  switch (body.action) {
    case "createFromEstimate": {
      if (typeof body.estimateId !== "string") return apiFail("`estimateId` must be a string.", 422);
      const bad = needsCadence();
      if (bad) return bad;
      return apiResult(
        await createRecurringPlanFromEstimate(body.estimateId, { cadence: body.cadence as never, startsOn: body.startsOn as string }),
      );
    }
    case "createFromInvoice": {
      if (typeof body.invoiceId !== "string") return apiFail("`invoiceId` must be a string.", 422);
      const bad = needsCadence();
      if (bad) return bad;
      return apiResult(
        await createRecurringPlanFromInvoice(body.invoiceId, { cadence: body.cadence as never, startsOn: body.startsOn as string }),
      );
    }
    case "createFromJob": {
      if (typeof body.jobId !== "string") return apiFail("`jobId` must be a string.", 422);
      const bad = needsCadence();
      if (bad) return bad;
      return apiResult(
        await createRecurringPlanFromJob(body.jobId, { cadence: body.cadence as never, startsOn: body.startsOn as string }),
      );
    }
    case "create": {
      const input = body.input;
      if (typeof input !== "object" || input === null) return apiFail("`input` must be an object.", 422);
      const v = input as Record<string, unknown>;
      if (typeof v.customerName !== "string") return apiFail("`input.customerName` must be a string.", 422);
      if (!isPlanCadence(v.cadence)) return apiFail("`input.cadence` must be monthly, quarterly, semiannual or yearly.", 422);
      if (!isDateKey(v.startsOn)) return apiFail("`input.startsOn` must be a calendar date, YYYY-MM-DD.", 422);
      if (!Array.isArray(v.items) || !v.items.every(isLineInput)) {
        return apiFail("`input.items` must be a list of { name, quantity, unitPriceCents }.", 422);
      }
      for (const key of ["contactId", "customerPhone", "customerEmail", "jobAddress", "jobName"] as const) {
        if (v[key] !== undefined && v[key] !== null && typeof v[key] !== "string") {
          return apiFail(`\`input.${key}\` must be a string.`, 422);
        }
      }
      return apiResult(
        await createRecurringPlan({
          contactId: (v.contactId as string | null | undefined) ?? null,
          customerName: v.customerName,
          customerPhone: (v.customerPhone as string | null | undefined) ?? null,
          customerEmail: (v.customerEmail as string | null | undefined) ?? null,
          jobAddress: (v.jobAddress as string | null | undefined) ?? null,
          jobName: (v.jobName as string | null | undefined) ?? null,
          cadence: v.cadence,
          startsOn: v.startsOn,
          items: v.items,
        }),
      );
    }
    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
