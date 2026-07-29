import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listEstimates } from "@/lib/canes/estimates";
import {
  createEstimate,
  createEstimateFromLead,
  createEstimateForCustomer,
} from "@/app/CanesPressure/actions";
import type { EstimateType } from "@urso/types";

// GET /api/v1/canes/estimates — the estimate list, exactly as the owner
// console's /CanesPressure/estimates page reads it. That page gates on
// requirePagePermission("estimates"), so this gates on the same key.
//
// listEstimates() accepts an optional { leadId, status } filter; nothing is
// passed through here. The web page reads unfiltered and narrows in the UI, and
// deciding what to filter by would be logic this layer must not own.
//
// POST /api/v1/canes/estimates — the three ways an estimate comes into
// existence, behind an `action` discriminator. All three end in createEstimate,
// which opens with denyUnlessPermitted("estimates"); this layer adds no
// authorization of its own, and no page gate either — the GET above is a page
// read, the POST below is an action, and mixing the two guards is how mobile
// drifts from web.
//
// None of these carry money: an estimate is created empty and priced later
// through saveItems on /estimates/:id/actions.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "estimates");
  if (denied) return denied;

  const estimates = await listEstimates();
  return apiOk(estimates);
});

// Mirrors createEstimate's input. Named here only to type the cast; the action
// owns the estimate-type union, phone normalization, and contact resolution.
type CreateEstimateInput = {
  leadId?: string;
  contactId?: string;
  estimateType: EstimateType;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  jobAddress?: string;
  jobName?: string;
};

type Body = {
  action?: unknown;
  input?: unknown;
  leadId?: unknown;
  contactId?: unknown;
};

export const POST = apiRoute(async ({ req }) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.action !== "string") {
    return apiFail("Send an `action`.", 422);
  }

  switch (body.action) {
    case "create": {
      if (typeof body.input !== "object" || body.input === null || Array.isArray(body.input)) {
        return apiFail("`input` must be an object.", 422);
      }
      const input = body.input as CreateEstimateInput;
      // estimateType is the one required field. Its value is an EstimateType,
      // checked by the column's constraint — re-listing the union here would be
      // a second copy to drift.
      if (typeof input.estimateType !== "string") {
        return apiFail("`input.estimateType` must be a string.", 422);
      }
      return apiResult(await createEstimate(input));
    }

    case "createFromLead": {
      if (typeof body.leadId !== "string") return apiFail("`leadId` must be a string.", 422);
      // Prefills from the lead and refuses an unknown one with its own sentence.
      return apiResult(await createEstimateFromLead(body.leadId));
    }

    case "createForCustomer": {
      if (typeof body.contactId !== "string") return apiFail("`contactId` must be a string.", 422);
      // Prefills from the contact, their primary address, and the linked lead.
      return apiResult(await createEstimateForCustomer(body.contactId));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
