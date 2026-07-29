import { apiFail, apiResult, apiRoute, isCents } from "@/lib/api/v1";
import { upsertCatalogItem, deleteCatalogItem } from "@/app/CanesPressure/actions";
import type { CatalogKind } from "@urso/types";

// POST /api/v1/canes/catalog/actions — mutations on the service catalog.
//
// ONE route per resource with an `action` discriminator, matching
// /api/v1/canes/leads/[id]/actions. The catalog has no per-item route because
// upsert carries the id in its body (absent id = insert), so both actions live
// on the collection.
//
// This layer adds NO authorization of its own. Both actions open with
// denyUnlessPermitted("estimates") — the same key /CanesPressure/estimates/items
// gates on — and getAdminSession() resolves a bearer token as well as the web
// cookie, so that guard sees the same actor here as on the web.
//
// MONEY. `defaultPriceCents` is integer cents and is passed through untouched:
// no parse, no multiply, no round. The check is `isCents` — integer AND
// non-negative — because upsertCatalogItem calls Math.round() on whatever
// arrives and clamps nothing, so anything this route lets past becomes the
// price. A float or numeric string would be silently coerced into a price
// nobody typed (49.99 must be rejected, not quietly stored as 50 cents), and a
// NEGATIVE price is worse: the catalog default prefills an estimate line, and
// lineTotalCents multiplies it by the quantity, so one line silently subtracts
// from the subtotal. The web refuses it already — dollarsToCents() in
// catalog-editor.tsx returns null for n < 0 and the field is min=0 — so this is
// parity, not a new rule.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  defaultPriceCents?: unknown;
  description?: unknown;
  unit?: unknown;
  taxable?: unknown;
  active?: unknown;
  position?: unknown;
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
    case "upsert": {
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      if (typeof body.kind !== "string") return apiFail("`kind` must be a string.", 422);
      if (!isCents(body.defaultPriceCents)) {
        return apiFail("`defaultPriceCents` must be a whole number of cents, and not negative.", 422);
      }
      // An id turns this into an update; without one the action inserts.
      if (body.id !== undefined && typeof body.id !== "string") {
        return apiFail("`id` must be a string.", 422);
      }
      // `description` is nullable in the action's own signature: null clears it,
      // undefined leaves the column at null on insert.
      if (body.description !== undefined && body.description !== null
          && typeof body.description !== "string") {
        return apiFail("`description` must be a string or null.", 422);
      }
      if (body.unit !== undefined && typeof body.unit !== "string") {
        return apiFail("`unit` must be a string.", 422);
      }
      if (body.taxable !== undefined && typeof body.taxable !== "boolean") {
        return apiFail("`taxable` must be a boolean.", 422);
      }
      if (body.active !== undefined && typeof body.active !== "boolean") {
        return apiFail("`active` must be a boolean.", 422);
      }
      if (body.position !== undefined
          && (typeof body.position !== "number" || !Number.isInteger(body.position))) {
        return apiFail("`position` must be an integer.", 422);
      }
      // `kind` is not re-validated against the union here; the action passes it
      // to a Postgres enum column, and re-listing the members would be a second
      // copy to drift.
      return apiResult(
        await upsertCatalogItem({
          id: body.id,
          name: body.name,
          kind: body.kind as CatalogKind,
          defaultPriceCents: body.defaultPriceCents,
          description: body.description,
          unit: body.unit,
          taxable: body.taxable,
          active: body.active,
          position: body.position,
        }),
      );
    }

    case "delete": {
      if (typeof body.id !== "string") return apiFail("`id` must be a string.", 422);
      // Soft-delete inside the action — catalog items are referenced by
      // historical estimate lines, so it deactivates rather than removes.
      return apiResult(await deleteCatalogItem(body.id));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
