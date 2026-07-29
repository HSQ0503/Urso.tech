import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listCustomers } from "@/lib/canes/customers";
import { createCustomer } from "@/app/CanesPressure/actions";
import type { LeadSource } from "@urso/types";

// GET /api/v1/canes/customers — the customer list the owner console shows,
// with the same optional `?q=` filter the web page passes through. Gated on
// `customers`, matching requirePagePermission("customers") on
// app/CanesPressure/(app)/customers/page.tsx.
//
// POST /api/v1/canes/customers — create a customer. Same `action` discriminator
// as every other mutation route, on the COLLECTION because there is no id yet.
//
// The asymmetry in guards below is deliberate, not an oversight. The GET reads
// through listCustomers(), a plain data function that carries no guard of its
// own, so the route has to supply the page-parity one. The POST calls a server
// action that already opens with denyUnlessPermitted("customers"), and
// getAdminSession() resolves a bearer token as well as the web cookie, so that
// guard sees the same actor here as on the web. Adding a second check would be a
// second thing to keep in sync — the shape that produced the completeJob bug.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessPagePermitted(actor, "customers");
  if (denied) return denied;

  const query = req.nextUrl.searchParams.get("q")?.trim();
  return apiOk(await listCustomers(query || undefined));
});

type Body = {
  action?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  notes?: unknown;
  source?: unknown;
};

type CustomerFields = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  source?: LeadSource;
};

const OPTIONAL_STRINGS = ["phone", "email", "address", "notes"] as const;

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
      // Presence and type only. The action owns "is this name blank", "is this
      // phone dialable", "is this email shaped like one", and the duplicate-phone
      // rule — all of which come back as written sentences.
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      const fields: CustomerFields = { name: body.name };
      // Copy a key only when the caller sent it: createCustomer branches on
      // `undefined` vs empty string in several places (an empty phone skips the
      // duplicate lookup entirely).
      for (const key of OPTIONAL_STRINGS) {
        const value = body[key];
        if (value === undefined) continue;
        if (typeof value !== "string") return apiFail(`\`${key}\` must be a string.`, 422);
        fields[key] = value;
      }
      if (body.source !== undefined) {
        if (typeof body.source !== "string") return apiFail("`source` must be a string.", 422);
        // Not re-validated against the union; it lands in a Postgres enum column
        // and re-listing the members would be a second copy to drift.
        fields.source = body.source as LeadSource;
      }
      return apiResult(await createCustomer(fields));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
