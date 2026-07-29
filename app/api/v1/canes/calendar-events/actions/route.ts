import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import { createCalendarEvent } from "@/app/CanesPressure/actions";
import type { CalendarEventKind } from "@urso/types";

// POST /api/v1/canes/calendar-events/actions — the non-job calendar blocks
// (holiday / time off / note) drawn behind the schedule board.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. createCalendarEvent opens with
// denyUnlessPermitted("schedule"), and because getAdminSession() resolves a
// bearer token as well as the web cookie (M6b), that guard sees the same actor
// here that it sees on the web. Adding a second check would be a second thing to
// keep in sync, and the completeJob bug came from exactly that kind of
// divergence.
//
// Jobs are NOT created here — they come from estimate approval or
// createManualJob. This route only mints the blocks.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  title?: unknown;
  startIso?: unknown;
  endIso?: unknown;
  allDay?: unknown;
  crewId?: unknown;
  kind?: unknown;
  notes?: unknown;
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
      if (typeof body.title !== "string") return apiFail("`title` must be a string.", 422);
      // Strings only. The action parses both instants and refuses an unparseable
      // one ("Invalid date.") or an end at or before the start ("End must be
      // after start."), and those sentences are written for the reader — parsing
      // them again here would be a second copy of the same rules.
      if (typeof body.startIso !== "string") return apiFail("`startIso` must be an ISO instant.", 422);
      if (typeof body.endIso !== "string") return apiFail("`endIso` must be an ISO instant.", 422);

      if (body.allDay !== undefined && typeof body.allDay !== "boolean") {
        return apiFail("`allDay` must be a boolean.", 422);
      }
      if (body.crewId !== undefined && body.crewId !== null && typeof body.crewId !== "string") {
        return apiFail("`crewId` must be a string or null.", 422);
      }
      // The column's own constraint owns the kind vocabulary; re-listing the
      // values here would be a second copy to drift.
      if (body.kind !== undefined && typeof body.kind !== "string") {
        return apiFail("`kind` must be a string.", 422);
      }
      if (body.notes !== undefined && typeof body.notes !== "string") {
        return apiFail("`notes` must be a string.", 422);
      }

      return apiResult(
        await createCalendarEvent({
          title: body.title,
          startIso: body.startIso,
          endIso: body.endIso,
          allDay: body.allDay as boolean | undefined,
          crewId: body.crewId as string | null | undefined,
          kind: body.kind as CalendarEventKind | undefined,
          notes: body.notes as string | undefined,
        }),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
