import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  agreeRecurringPlanInPerson,
  cancelRecurringPlan,
  pauseRecurringPlan,
  resumeRecurringPlan,
  sendRecurringPlanContract,
  updateRecurringPlan,
} from "@/app/CanesPressure/actions";
import { isDateKey, isPlanCadence } from "@/lib/canes/recurring";
import type { PlanLineInput, PlanPatch } from "@/lib/canes/recurring";

// POST /api/v1/canes/recurring/:id/actions — mutations on one plan.
//
// Like every resource route: parse, validate SHAPE, dispatch, pass the action's
// own sentence through. The actions carry the permission guard; nothing is
// re-checked here. signRecurringPlan / markRecurringPlanViewed are NOT here —
// they are the public token page's, same rule as approveEstimate.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  patch?: unknown;
  channels?: unknown;
  reason?: unknown;
  cancelOpenVisit?: unknown;
  billFee?: unknown;
  nextDueOn?: unknown;
};

function isLineInput(value: unknown): value is PlanLineInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.quantity === "number" &&
    typeof v.unitPriceCents === "number" &&
    Number.isInteger(v.unitPriceCents) &&
    v.unitPriceCents >= 0
  );
}

const STRING_KEYS = ["jobName", "customerName", "customerPhone", "customerEmail", "jobAddress", "messageToCustomer"] as const;

export const POST = apiRoute<{ id: string }>(async ({ req, params }) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.action !== "string") return apiFail("Send an `action`.", 422);
  const id = params.id;

  switch (body.action) {
    case "update": {
      const raw = body.patch;
      if (typeof raw !== "object" || raw === null) return apiFail("`patch` must be an object.", 422);
      const v = raw as Record<string, unknown>;
      const patch: PlanPatch = {};
      for (const key of STRING_KEYS) {
        if (v[key] === undefined) continue;
        if (v[key] !== null && typeof v[key] !== "string") return apiFail(`\`patch.${key}\` must be a string.`, 422);
        if (key === "jobName" || key === "customerName") patch[key] = String(v[key] ?? "");
        else patch[key] = v[key] as string | null;
      }
      if (v.cadence !== undefined) {
        if (!isPlanCadence(v.cadence)) return apiFail("`patch.cadence` is not a cadence.", 422);
        patch.cadence = v.cadence;
      }
      for (const key of ["startsOn", "nextDueOn"] as const) {
        if (v[key] === undefined) continue;
        if (!isDateKey(v[key])) return apiFail(`\`patch.${key}\` must be a calendar date, YYYY-MM-DD.`, 422);
        patch[key] = v[key] as string;
      }
      for (const key of ["leadDays", "noticeDays"] as const) {
        if (v[key] === undefined) continue;
        if (typeof v[key] !== "number" || !Number.isInteger(v[key])) return apiFail(`\`patch.${key}\` must be a whole number.`, 422);
        patch[key] = v[key] as number;
      }
      if (v.items !== undefined) {
        if (!Array.isArray(v.items) || !v.items.every(isLineInput)) {
          return apiFail("`patch.items` must be a list of { name, quantity, unitPriceCents }.", 422);
        }
        patch.items = v.items;
      }
      if (Object.keys(patch).length === 0) {
        return apiFail(`\`patch\` has nothing to change. Accepted keys: ${[...STRING_KEYS, "cadence", "startsOn", "nextDueOn", "leadDays", "noticeDays", "items"].join(", ")}.`, 422);
      }
      return apiResult(await updateRecurringPlan(id, patch));
    }
    case "send": {
      const channels = body.channels;
      if (channels !== undefined && (typeof channels !== "object" || channels === null)) {
        return apiFail("`channels` must be an object.", 422);
      }
      const c = (channels ?? {}) as Record<string, unknown>;
      for (const key of ["text", "email"]) {
        if (c[key] !== undefined && typeof c[key] !== "boolean") return apiFail(`\`channels.${key}\` must be a boolean.`, 422);
      }
      return apiResult(await sendRecurringPlanContract(id, { channels: c as { text?: boolean; email?: boolean } }));
    }
    case "agreeInPerson":
      return apiResult(await agreeRecurringPlanInPerson(id));
    case "pause":
      return apiResult(await pauseRecurringPlan(id));
    case "resume": {
      if (body.nextDueOn !== undefined && !isDateKey(body.nextDueOn)) {
        return apiFail("`nextDueOn` must be a calendar date, YYYY-MM-DD.", 422);
      }
      return apiResult(await resumeRecurringPlan(id, body.nextDueOn as string | undefined));
    }
    case "cancel": {
      if (body.reason !== undefined && typeof body.reason !== "string") return apiFail("`reason` must be a string.", 422);
      for (const key of ["cancelOpenVisit", "billFee"] as const) {
        if (body[key] !== undefined && typeof body[key] !== "boolean") return apiFail(`\`${key}\` must be a boolean.`, 422);
      }
      return apiResult(
        await cancelRecurringPlan(id, {
          reason: body.reason as string | undefined,
          cancelOpenVisit: body.cancelOpenVisit as boolean | undefined,
          billFee: body.billFee as boolean | undefined,
        }),
      );
    }
    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
