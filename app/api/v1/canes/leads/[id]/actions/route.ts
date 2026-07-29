import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  setLeadStatus,
  setAppointment,
  snoozeLead,
  updateLeadFields,
  logCallOutcome,
  sendMessage,
  sendConfirmationNow,
  deleteLead,
} from "@/app/CanesPressure/actions";
import type { LeadStatus } from "@urso/types";

// POST /api/v1/canes/leads/:id/actions — mutations on one lead.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. Every action already opens with
// denyUnlessPermitted(...), and because getAdminSession() resolves a bearer
// token as well as the web cookie (M6b), that guard sees the same actor here
// that it sees on the web. Adding a second check would be a second thing to keep
// in sync, and the completeJob bug came from exactly that kind of divergence.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.
//
// Lead CREATION (createLead, and createQuoteVisit — which despite the name is a
// lead insert, not a mutation of an existing one) lives on the collection route,
// POST /api/v1/canes/leads.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  status?: unknown;
  lostReason?: unknown;
  untilIso?: unknown;
  fields?: unknown;
  appointmentIso?: unknown;
  outcome?: unknown;
  detail?: unknown;
  phone?: unknown;
  message?: unknown;
};

// The four dispositions logCallOutcome accepts. Listed here — and nowhere else
// in this layer — because logCallOutcome is the one action on this route that
// does NOT own its own validation: it DERIVES the stored call status from the
// outcome ("no_answer" → "no-answer", everything else → "completed") and writes
// a lead status from it, so an unknown value is not refused by the action or by
// a column CHECK. It would log a call that reads correct and quietly leave the
// lead status wrong. Compare setStatus below: an unknown status IS refused
// downstream (the leads.status CHECK), so it needs no list here.
const CALL_OUTCOMES = ["closed", "follow_up", "no_answer", "lost"] as const;

type CallOutcome = (typeof CALL_OUTCOMES)[number];

function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && (CALL_OUTCOMES as readonly string[]).includes(value);
}

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
    case "setStatus": {
      if (typeof body.status !== "string") return apiFail("`status` must be a string.", 422);
      const lostReason = typeof body.lostReason === "string" ? body.lostReason : undefined;
      // The action validates the status value against its own union and refuses
      // an unknown one; re-listing the statuses here would be a second copy to
      // drift.
      return apiResult(await setLeadStatus(id, body.status as LeadStatus, lostReason));
    }

    case "snooze": {
      if (typeof body.untilIso !== "string") return apiFail("`untilIso` must be an ISO instant.", 422);
      if (!Number.isFinite(Date.parse(body.untilIso))) {
        return apiFail("`untilIso` must be an ISO instant.", 422);
      }
      return apiResult(await snoozeLead(id, body.untilIso));
    }

    case "update": {
      if (typeof body.fields !== "object" || body.fields === null) {
        return apiFail("`fields` must be an object.", 422);
      }
      return apiResult(await updateLeadFields(id, body.fields as Record<string, string | null>));
    }

    case "setAppointment": {
      if (typeof body.appointmentIso !== "string") {
        return apiFail("`appointmentIso` must be an ISO instant.", 422);
      }
      // No Date.parse here, unlike `snooze` above: snoozeLead writes untilIso
      // straight to the column, but setAppointment does its own
      // `Number.isNaN(when.getTime())` check and answers "Invalid date." So the
      // instant is already validated one layer down — a second check would be a
      // second sentence for the same failure.
      return apiResult(await setAppointment(id, body.appointmentIso));
    }

    case "logCallOutcome": {
      if (!isCallOutcome(body.outcome)) {
        return apiFail(`\`outcome\` must be one of ${CALL_OUTCOMES.join(", ")}.`, 422);
      }
      // `detail` becomes the lost_reason when the outcome is "lost"; the action
      // decides that, not this route.
      const detail = typeof body.detail === "string" ? body.detail : undefined;
      return apiResult(await logCallOutcome(id, body.outcome, detail));
    }

    case "sendMessage": {
      // The peer phone is a body field rather than something read off the lead,
      // because the thread key IS the peer phone and the web composer is given
      // it the same way (Composer({ peerPhone, leadId })). Re-deriving it from
      // the lead here would make mobile text a different number than web does
      // for the same thread.
      if (typeof body.phone !== "string") {
        return apiFail("`phone` must be the peer phone number.", 422);
      }
      if (typeof body.message !== "string") {
        return apiFail("`message` must be a string.", 422);
      }
      // The action trims, refuses an empty body, and moves a "new" lead to
      // "contacted" on a successful send.
      return apiResult(await sendMessage(body.phone, body.message, id));
    }

    case "sendConfirmationNow": {
      // No body fields. Every precondition — phone present, not opted out,
      // appointment set — is checked by the action and comes back as a written
      // sentence.
      return apiResult(await sendConfirmationNow(id));
    }

    case "delete": {
      // Owner-only inside the action, and it refuses a lead that has opted out
      // or has active work. Both refusals come back as a written sentence.
      return apiResult(await deleteLead(id));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
