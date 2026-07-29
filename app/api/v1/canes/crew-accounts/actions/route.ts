import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  addCrew,
  addApprovedTechnician,
  setTechnicianActive,
  setCrewMemberRole,
  setCrewAccountPermission,
  addJobChecklistItem,
  removeJobChecklistItem,
} from "@/app/CanesPressure/crew-owner-actions";
import { DEFAULT_CREW_PERMISSIONS } from "@urso/types";
import type { CrewAccountRole, CrewPermissionKey } from "@urso/types";

// POST /api/v1/canes/crew-accounts/actions — crew roster administration:
// crews, approved technicians, roles, permission flags, and the job-sheet
// checklist the dispatcher edits.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. These actions live in
// crew-owner-actions.ts rather than actions.ts and carry their own guards:
//
//   requireOwner()      — getAdminSession() only. addCrew, addApprovedTechnician,
//                         setTechnicianActive, setCrewMemberRole and
//                         setCrewAccountPermission are all strictly owner-only;
//                         no permission flag opens them, and an ops manager is
//                         refused with "Owner sign-in required."
//   requireDispatcher() — owner OR an ops_manager account holding `schedule`.
//                         The two checklist actions use this, deliberately: the
//                         job-sheet checklist is day-to-day dispatch work DJ runs.
//
// Both resolve a bearer token as well as the web cookie (getAdminSession and
// getTechnicianActor each fall back to the Authorization header in M6b), so the
// guards see the same actor here that they see on the web. Adding a second check
// would be a second thing to keep in sync, and the completeJob bug came from
// exactly that kind of divergence.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.
//
// No money crosses this route — nothing here takes cents. But `role` DOES:
// addApprovedTechnician seeds comp_type/comp_bps from it, so it is validated
// below. Changing pay after the fact is the Payouts surface, not this one.

export const dynamic = "force-dynamic";

// `role` is pay-determining, and this is the only place that can catch a bad
// one. addApprovedTechnician reads it as `input.role === "ops_manager"` and
// derives everything else from that single boolean — role, comp_type and
// comp_bps — so ANY other string, a typo included, silently seeds an hourly
// worker at 0/hr instead of an ops manager on a 20% profit share. Nothing
// downstream catches it: the team_members CHECK constraint only ever sees the
// already-collapsed "ops_manager"/"worker", never what the caller sent, and
// payouts.ts pays from the row that was written.
//
// Membership is read off DEFAULT_CREW_PERMISSIONS — a Record keyed by
// CrewAccountRole, so a role added to the union without a defaults entry fails
// to compile rather than being quietly rejected here. Same trick as
// isPaymentMethod over PAYMENT_METHOD_LABEL; a hand-written list would be a
// second copy to drift.
//
// setCrewMemberRole below is deliberately NOT given this check: that action
// validates the union itself and answers "Invalid role.", and a second copy of
// a rule is the divergence this layer keeps being bitten by.
function isCrewAccountRole(value: unknown): value is CrewAccountRole {
  return typeof value === "string" && Object.hasOwn(DEFAULT_CREW_PERMISSIONS, value);
}

type Body = {
  action?: unknown;
  name?: unknown;
  color?: unknown;
  email?: unknown;
  phone?: unknown;
  crewId?: unknown;
  role?: unknown;
  teamMemberId?: unknown;
  active?: unknown;
  key?: unknown;
  value?: unknown;
  jobId?: unknown;
  itemId?: unknown;
  required?: unknown;
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
    case "addCrew": {
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      if (typeof body.color !== "string") return apiFail("`color` must be a string.", 422);
      // The action trims, requires a non-empty name, enforces the #rrggbb color
      // format and rejects a duplicate name. Re-listing those here would be a
      // second copy to drift.
      return apiResult(await addCrew({ name: body.name, color: body.color }));
    }

    case "addApprovedTechnician": {
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      if (typeof body.email !== "string") return apiFail("`email` must be a string.", 422);
      if (typeof body.phone !== "string") return apiFail("`phone` must be a string.", 422);
      // Required by the action's input type but allowed to be empty: an ops
      // manager runs every crew, so the action makes the crew pick optional for
      // that role and refuses an empty one for a technician.
      if (typeof body.crewId !== "string") return apiFail("`crewId` must be a string.", 422);
      // Optional — the action defaults an absent role to a technician, which is
      // the same thing the web's unchecked "ops manager" box means. Present but
      // unrecognised is refused rather than collapsed to a worker.
      if (body.role !== undefined && !isCrewAccountRole(body.role)) {
        return apiFail("`role` must be technician or ops_manager.", 422);
      }
      // The action email/phone/crew validation and the duplicate-email conflict
      // all come back as written notices.
      return apiResult(
        await addApprovedTechnician({
          name: body.name,
          email: body.email,
          phone: body.phone,
          crewId: body.crewId,
          role: body.role,
        }),
      );
    }

    case "setTechnicianActive": {
      if (typeof body.teamMemberId !== "string") {
        return apiFail("`teamMemberId` must be a string.", 422);
      }
      if (typeof body.active !== "boolean") return apiFail("`active` must be a boolean.", 422);
      return apiResult(await setTechnicianActive(body.teamMemberId, body.active));
    }

    case "setCrewMemberRole": {
      if (typeof body.teamMemberId !== "string") {
        return apiFail("`teamMemberId` must be a string.", 422);
      }
      if (typeof body.role !== "string") return apiFail("`role` must be a string.", 422);
      // The action checks the role against its own union and answers
      // "Invalid role." for anything else.
      return apiResult(await setCrewMemberRole(body.teamMemberId, body.role as CrewAccountRole));
    }

    case "setCrewAccountPermission": {
      if (typeof body.teamMemberId !== "string") {
        return apiFail("`teamMemberId` must be a string.", 422);
      }
      if (typeof body.key !== "string") return apiFail("`key` must be a string.", 422);
      if (typeof body.value !== "boolean") return apiFail("`value` must be a boolean.", 422);
      // Granting capability to an employee account, so worth stating plainly:
      // the action opens with requireOwner(), which is getAdminSession() alone.
      // An ops manager cannot grant permissions — not even the ones they already
      // hold — and gets "Owner sign-in required." The action also rejects an
      // unknown key and refuses an account that has never signed in.
      return apiResult(
        await setCrewAccountPermission(
          body.teamMemberId,
          body.key as CrewPermissionKey,
          body.value,
        ),
      );
    }

    case "addJobChecklistItem": {
      if (typeof body.jobId !== "string") return apiFail("`jobId` must be a string.", 422);
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      if (typeof body.required !== "boolean") return apiFail("`required` must be a boolean.", 422);
      // The action owns the terminal-status rule ("A finished job's checklist
      // cannot be changed.") and the position it appends at.
      return apiResult(
        await addJobChecklistItem({ jobId: body.jobId, name: body.name, required: body.required }),
      );
    }

    case "removeJobChecklistItem": {
      if (typeof body.itemId !== "string") return apiFail("`itemId` must be a string.", 422);
      // Only checklist-only steps are removable; a sold service line refuses
      // with its own sentence, as does a finished job.
      return apiResult(await removeJobChecklistItem(body.itemId));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
