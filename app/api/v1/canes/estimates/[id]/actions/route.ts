import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  updateEstimate,
  saveEstimateItems,
  sendEstimate,
  voidEstimate,
  deleteEstimate,
  approveEstimateInPerson,
} from "@/app/CanesPressure/actions";
import type { CatalogKind, EstimateType, PaymentMethod } from "@urso/types";

// POST /api/v1/canes/estimates/:id/actions — mutations on one estimate.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. Every action here already opens
// with denyUnlessPermitted("estimates") — deleteEstimate with no key, so it is
// owner-only — and because getAdminSession() resolves a bearer token as well as
// the web cookie (M6b), that guard sees the same actor here that it sees on the
// web. Adding a second check would be a second thing to keep in sync, and the
// completeJob bug came from exactly that kind of divergence.
//
// `decline` is deliberately ABSENT. declineEstimate(token, reason) is a
// PUBLIC-PATH action: it is keyed by the estimate's public token, not its id,
// and /e/[token] calls it with no session at all. There is no guarded owner
// equivalent to swap in (approveEstimateInPerson has no decline twin), so the
// action is omitted rather than wrapped — an authenticated route over an
// unguarded, token-keyed action is an invitation to reach the public path.
// The owner's route to the same outcome is `void`.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.

export const dynamic = "force-dynamic";

// Money crosses this layer as integer cents and nothing else. A float would be
// silently rounded by the action (Math.round), and a currency string would slip
// past a bare `typeof === "number"` check only to land as NaN in a totals
// column. Both checks, every time.
function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

// Mirrors the parameter types of the actions being dispatched to. These exist to
// name the cast at the call site, not to re-validate: the action owns which
// statuses may be edited, which estimate types may be approved in person, and
// what a valid phone or email looks like.
type EstimatePatch = {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  contactId?: string | null;
  jobAddress?: string;
  jobName?: string;
  estimateType?: EstimateType;
  adjustmentCents?: number;
  depositPercent?: number;
  messageToCustomer?: string;
  terms?: string;
  internalNotes?: string;
  expiresAtIso?: string | null;
  employee?: string;
};

type EstimateItemInput = {
  catalogId?: string | null;
  name: string;
  description?: string | null;
  kind: CatalogKind;
  quantity: number;
  unitPriceCents: number;
  discountCents?: number;
  taxable?: boolean;
  isOption?: boolean;
  isMandatory?: boolean;
  packageGroup?: string | null;
};

type Body = {
  action?: unknown;
  patch?: unknown;
  items?: unknown;
  channels?: unknown;
  toEmail?: unknown;
  toPhone?: unknown;
  depositCollected?: unknown;
  depositMethod?: unknown;
};

export const POST = apiRoute<{ id: string }>(async ({ req, params }) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.action !== "string") {
    return apiFail("Send an `action`.", 422);
  }

  const id = params.id;

  switch (body.action) {
    case "update": {
      if (typeof body.patch !== "object" || body.patch === null || Array.isArray(body.patch)) {
        return apiFail("`patch` must be an object.", 422);
      }
      const patch = body.patch as EstimatePatch;
      if (patch.adjustmentCents !== undefined && !isCents(patch.adjustmentCents)) {
        return apiFail("`patch.adjustmentCents` must be an integer number of cents.", 422);
      }
      // Not money, but the action feeds it straight to Math.round and clamps the
      // range itself — a string here would round to NaN and blank the deposit.
      if (patch.depositPercent !== undefined && typeof patch.depositPercent !== "number") {
        return apiFail("`patch.depositPercent` must be a number.", 422);
      }
      // The action refuses a non-draft estimate for anything but the contact
      // fields, and validates the phone; both refusals come back as a sentence.
      return apiResult(await updateEstimate(id, patch));
    }

    case "saveItems": {
      if (!Array.isArray(body.items)) return apiFail("`items` must be an array.", 422);
      // Replace-all semantics: an empty array is a legitimate "clear the lines".
      for (let i = 0; i < body.items.length; i += 1) {
        const raw: unknown = body.items[i];
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          return apiFail(`\`items[${i}]\` must be an object.`, 422);
        }
        const item = raw as Record<string, unknown>;
        if (typeof item.name !== "string") {
          return apiFail(`\`items[${i}].name\` must be a string.`, 422);
        }
        // `kind` is a CatalogKind; the column's check constraint owns the
        // membership test, so re-listing the values here would be a second copy.
        if (typeof item.kind !== "string") {
          return apiFail(`\`items[${i}].kind\` must be a string.`, 422);
        }
        // Quantity may be fractional (hours, square footage) — a number, not cents.
        if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity)) {
          return apiFail(`\`items[${i}].quantity\` must be a number.`, 422);
        }
        if (!isCents(item.unitPriceCents)) {
          return apiFail(`\`items[${i}].unitPriceCents\` must be an integer number of cents.`, 422);
        }
        if (item.discountCents !== undefined && !isCents(item.discountCents)) {
          return apiFail(`\`items[${i}].discountCents\` must be an integer number of cents.`, 422);
        }
      }
      return apiResult(await saveEstimateItems(id, body.items as EstimateItemInput[]));
    }

    case "send": {
      // All three opts are optional: no opts at all means "send to whatever is on
      // file", which is the action's documented back-compat path.
      if (body.channels !== undefined
          && (typeof body.channels !== "object" || body.channels === null
              || Array.isArray(body.channels))) {
        return apiFail("`channels` must be an object.", 422);
      }
      // The action calls .trim() on these, so a non-string is a TypeError, not a
      // refusal — that makes them shape, and shape is this layer's job.
      if (body.toEmail !== undefined && typeof body.toEmail !== "string") {
        return apiFail("`toEmail` must be a string.", 422);
      }
      if (body.toPhone !== undefined && typeof body.toPhone !== "string") {
        return apiFail("`toPhone` must be a string.", 422);
      }
      return apiResult(
        await sendEstimate(id, {
          channels: body.channels as { email?: boolean; text?: boolean } | undefined,
          toEmail: body.toEmail,
          toPhone: body.toPhone,
        }),
      );
    }

    case "void": {
      // Terminal by design: flips to 'expired' and cancels the pending send and
      // reminder tasks so a dead estimate never texts the customer.
      return apiResult(await voidEstimate(id));
    }

    case "delete": {
      // Owner-only inside the action (denyUnlessPermitted with no key), and it
      // refuses anything approved, declined, live, or attached to a job or
      // invoice. Every one of those is a written sentence.
      return apiResult(await deleteEstimate(id));
    }

    case "approveInPerson": {
      // The GUARDED owner equivalent of the public approveEstimate — same
      // finalize path (job, deposit link, lead → won) with the signature
      // recorded as an in-person agreement.
      if (body.depositCollected !== undefined && typeof body.depositCollected !== "boolean") {
        return apiFail("`depositCollected` must be a boolean.", 422);
      }
      if (body.depositMethod !== undefined && typeof body.depositMethod !== "string") {
        return apiFail("`depositMethod` must be a string.", 422);
      }
      // The payment method union is enforced by the column; the action defaults
      // to cash when it is absent.
      return apiResult(
        await approveEstimateInPerson(id, {
          depositCollected: body.depositCollected,
          depositMethod: body.depositMethod as PaymentMethod | undefined,
        }),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
