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
// No money crosses this route — nothing here takes cents. addApprovedTechnician
// seeds comp_type/comp_bps internally from the role; changing pay is the Payouts
// surface, not this one.

export const dynamic = "force-dynamic";

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
      if (body.role !== undefined && typeof body.role !== "string") {
        return apiFail("`role` must be a string.", 422);
      }
      // The action email/phone/crew validation and the duplicate-email conflict
      // all come back as written notices. Note it reads `role` as
      // `=== "ops_manager"` without validating the union, so any other value —
      // including a typo — is treated as a worker, exactly as on the web.
      return apiResult(
        await addApprovedTechnician({
          name: body.name,
          email: body.email,
          phone: body.phone,
          crewId: body.crewId,
          role: body.role as CrewAccountRole | undefined,
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
