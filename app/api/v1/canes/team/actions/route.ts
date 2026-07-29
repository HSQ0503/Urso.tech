import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import { addTeamMember, updateTeamMember, removeTeamMember } from "@/app/CanesPressure/actions";
import type { CompType, TeamRole } from "@urso/types";

// POST /api/v1/canes/team/actions — mutations on the roster.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. All three actions open with
// denyUnlessPermitted() — no key, so OWNER-ONLY — and because getAdminSession()
// resolves a bearer token as well as the web cookie (M6b), that guard sees the
// same actor here that it sees on the web. Adding a second check would be a
// second thing to keep in sync, and the completeJob bug came from exactly that
// kind of divergence.
//
// Pay terms live on these rows: comp_bps is BASIS POINTS and hourly_cents is
// INTEGER CENTS. Both are passed through untouched — no parsing, no scaling, no
// rounding. The shape check insists on a whole number so a client that computed
// 12.5% or $85.00 as a float is refused here instead of silently landing a
// rounded pay rate in the roster.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  id?: unknown;
  name?: unknown;
  role?: unknown;
  compType?: unknown;
  compBps?: unknown;
  hourlyCents?: unknown;
  crewId?: unknown;
  patch?: unknown;
};

type Patch = {
  name?: string;
  role?: TeamRole;
  compType?: CompType;
  compBps?: number;
  hourlyCents?: number;
  crewId?: string | null;
  active?: boolean;
};

// The only keys `update` accepts, written as a Record over Patch so a field
// added to that type without a branch below fails to COMPILE rather than
// quietly going missing from this sentence.
const PATCH_KEYS = Object.keys({
  name: 0, role: 0, compType: 0, compBps: 0, hourlyCents: 0, crewId: 0, active: 0,
} satisfies Record<keyof Patch, 0>);

// A whole-number field (basis points, integer cents). Rejects floats and the
// numeric strings a form-driven client would otherwise send.
function badInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return apiFail(`\`${field}\` must be a whole number.`, 422);
  }
  return null;
}

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
    case "add": {
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      // The action validates the role and comp type against the column's own
      // constraint and refuses an unknown one; re-listing the values here would
      // be a second copy to drift.
      if (typeof body.role !== "string") return apiFail("`role` must be a string.", 422);
      if (typeof body.compType !== "string") return apiFail("`compType` must be a string.", 422);

      let compBps: number | undefined;
      if (body.compBps !== undefined) {
        const bad = badInteger(body.compBps, "compBps");
        if (bad) return bad;
        compBps = body.compBps as number;
      }

      let hourlyCents: number | undefined;
      if (body.hourlyCents !== undefined) {
        const bad = badInteger(body.hourlyCents, "hourlyCents");
        if (bad) return bad;
        hourlyCents = body.hourlyCents as number;
      }

      // An hourly member must arrive WITH their rate. The web refuses this
      // (`compType === "hourly" && toCents(rate) <= 0` → "Enter the hourly
      // rate."), but the action does not: it stores `Math.max(0, ...(?? 0))`, so
      // an omitted or zero rate becomes a real roster row at $0.00/hr. Nothing
      // downstream complains — computePayouts multiplies hours by the rate and
      // pays them zero, correctly, forever, and it reads as a quiet payroll bug
      // rather than a rejected form.
      //
      // Only `hourly` is checked. The percentage comp types are NOT: the web's
      // own rule there is `!(Number(pct) >= 0)`, which an empty field passes as
      // 0, so a 0% profit_split is something the owner can legitimately create
      // today and this route must not start refusing it.
      if (body.compType === "hourly" && !(hourlyCents !== undefined && hourlyCents > 0)) {
        return apiFail("`hourlyCents` is required for an hourly member.", 422);
      }

      if (body.crewId !== undefined && body.crewId !== null && typeof body.crewId !== "string") {
        return apiFail("`crewId` must be a string or null.", 422);
      }

      return apiResult(
        await addTeamMember({
          name: body.name,
          role: body.role as TeamRole,
          compType: body.compType as CompType,
          compBps,
          hourlyCents,
          crewId: body.crewId as string | null | undefined,
        }),
      );
    }

    case "update": {
      if (typeof body.id !== "string") return apiFail("`id` must be a string.", 422);
      if (typeof body.patch !== "object" || body.patch === null) {
        return apiFail("`patch` must be an object.", 422);
      }
      // The action applies only the keys present, so the patch is copied key by
      // key rather than cast wholesale: an unrecognised key would otherwise ride
      // through unchecked, and compBps/hourlyCents have to clear the integer
      // check before they can reach a pay rate.
      const raw = body.patch as Record<string, unknown>;
      const patch: Patch = {};

      if (raw.name !== undefined) {
        if (typeof raw.name !== "string") return apiFail("`patch.name` must be a string.", 422);
        patch.name = raw.name;
      }
      if (raw.role !== undefined) {
        if (typeof raw.role !== "string") return apiFail("`patch.role` must be a string.", 422);
        patch.role = raw.role as TeamRole;
      }
      if (raw.compType !== undefined) {
        if (typeof raw.compType !== "string") {
          return apiFail("`patch.compType` must be a string.", 422);
        }
        patch.compType = raw.compType as CompType;
      }
      if (raw.compBps !== undefined) {
        const bad = badInteger(raw.compBps, "patch.compBps");
        if (bad) return bad;
        patch.compBps = raw.compBps as number;
      }
      if (raw.hourlyCents !== undefined) {
        const bad = badInteger(raw.hourlyCents, "patch.hourlyCents");
        if (bad) return bad;
        patch.hourlyCents = raw.hourlyCents as number;
      }
      if (raw.crewId !== undefined) {
        if (raw.crewId !== null && typeof raw.crewId !== "string") {
          return apiFail("`patch.crewId` must be a string or null.", 422);
        }
        patch.crewId = raw.crewId as string | null;
      }
      if (raw.active !== undefined) {
        if (typeof raw.active !== "boolean") {
          return apiFail("`patch.active` must be a boolean.", 422);
        }
        patch.active = raw.active;
      }

      // A patch whose keys are ALL unknown copies nothing, and updateTeamMember
      // returns a bare { ok: true } for an empty update without touching the
      // row — so a client that misspelled `hourly_cents` is told its pay change
      // saved. On web the patch is built by the form, so this cannot happen;
      // a phone assembling JSON is exactly where it can.
      if (Object.keys(patch).length === 0) {
        return apiFail(`Send at least one of: ${PATCH_KEYS.join(", ")}.`, 422);
      }
      // The pay-rate rule from `add`, applied to the one shape that can reach
      // the same end state: the web edit form submits compType and hourlyCents
      // together and refuses that pair at zero. A patch that moves someone to
      // hourly WITHOUT naming a rate is left alone — it keeps whatever rate the
      // row already had, which is not this route's call to second-guess.
      if (patch.compType === "hourly" && patch.hourlyCents !== undefined && patch.hourlyCents <= 0) {
        return apiFail("`patch.hourlyCents` must be more than zero for an hourly member.", 422);
      }

      return apiResult(await updateTeamMember(body.id, patch));
    }

    case "remove": {
      // Deactivation, not deletion — the action flips active to false so payout
      // history keeps its member rows.
      if (typeof body.id !== "string") return apiFail("`id` must be a string.", 422);
      return apiResult(await removeTeamMember(body.id));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
