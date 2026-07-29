import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  updateCustomer,
  addCustomerAddress,
  setPrimaryAddress,
  deleteContact,
} from "@/app/CanesPressure/actions";

// POST /api/v1/canes/customers/:id/actions — mutations on one customer.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action, matching /api/v1/canes/leads/[id]/actions. Four files here would be
// four places to forget a guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. All four actions open with
// denyUnlessPermitted (`customers` for the first three, owner-only for delete),
// and because getAdminSession() resolves a bearer token as well as the web
// cookie (M6b), that guard sees the same actor here that it sees on the web.
// A second check would be a second thing to keep in sync, and the completeJob
// bug came from exactly that kind of divergence.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.
//
// SHAPE validation is heavier here than on leads because updateCustomer's field
// bag is heterogeneous — four strings and a boolean — and it calls .trim() on
// the strings without checking. A number where a name belongs would be a
// TypeError, i.e. a 500 with a reference id, instead of a 422 telling the caller
// what they got wrong. Types and presence only; the action still owns every
// business rule (phone format, email format, uniqueness).

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  fields?: unknown;
  line?: unknown;
  siteNotes?: unknown;
  addressId?: unknown;
};

type CustomerFields = {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  archived?: boolean;
};

const STRING_FIELDS = ["name", "phone", "email", "notes"] as const;

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
      if (typeof body.fields !== "object" || body.fields === null) {
        return apiFail("`fields` must be an object.", 422);
      }
      const raw = body.fields as Record<string, unknown>;
      const fields: CustomerFields = {};
      // Copy a key only when the caller actually sent it. updateCustomer
      // distinguishes an absent field (leave it alone) from an empty string
      // (clear it), so materialising a key nobody sent would wipe live data.
      for (const key of STRING_FIELDS) {
        const value = raw[key];
        if (value === undefined) continue;
        if (typeof value !== "string") return apiFail(`\`fields.${key}\` must be a string.`, 422);
        fields[key] = value;
      }
      if (raw.archived !== undefined) {
        if (typeof raw.archived !== "boolean") {
          return apiFail("`fields.archived` must be a boolean.", 422);
        }
        fields.archived = raw.archived;
      }
      return apiResult(await updateCustomer(id, fields));
    }

    case "addAddress": {
      if (typeof body.line !== "string") return apiFail("`line` must be a string.", 422);
      const siteNotes = typeof body.siteNotes === "string" ? body.siteNotes : undefined;
      // The action rejects a blank line and decides on its own whether this is
      // the contact's first address (and therefore the primary one).
      return apiResult(await addCustomerAddress(id, body.line, siteNotes));
    }

    case "setPrimaryAddress": {
      if (typeof body.addressId !== "string") return apiFail("`addressId` must be a string.", 422);
      // Scoped to this contact inside the action — an addressId belonging to
      // someone else matches nothing and promotes nothing.
      return apiResult(await setPrimaryAddress(id, body.addressId));
    }

    case "delete": {
      // Owner-only inside the action, and it refuses any customer with an
      // estimate, job, or invoice on file. That refusal comes back as a written
      // sentence pointing at archiving instead.
      return apiResult(await deleteContact(id));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
