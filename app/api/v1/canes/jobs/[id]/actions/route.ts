import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  scheduleJob,
  moveJob,
  unscheduleJob,
  assignJob,
  setJobStatus,
  updateJobDetails,
  setJobRecurrence,
  startJob,
  completeJob,
  reopenJob,
  deleteJob,
  recordJobDeposit,
} from "@/app/CanesPressure/actions";
import type { JobRecurrence, JobStatus, PaymentMethod } from "@urso/types";

// POST /api/v1/canes/jobs/:id/actions — mutations on one job.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. Every action already opens with
// denyUnlessPermitted(...), and because getAdminSession() resolves a bearer
// token as well as the web cookie (M6b), that guard sees the same actor here
// that it sees on the web. Adding a second check would be a second thing to keep
// in sync, and the completeJob bug came from exactly that kind of divergence —
// an owner guard sitting on a crew path silently broke job completion in
// production for a month.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.
//
// createJobFromEstimate is NOT here. It is a public-path action (the customer
// estimate page /e/[token] calls it with no session), and wrapping it in an
// authenticated route would invite a caller onto the unguarded path. Jobs are
// born from an approved estimate on that page, or from createManualJob on the
// collection route.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  scheduledIso?: unknown;
  durationMinutes?: unknown;
  crewId?: unknown;
  status?: unknown;
  reason?: unknown;
  fields?: unknown;
  recurrence?: unknown;
  amountCents?: unknown;
  method?: unknown;
};

// The shape every crew slot takes across these actions: an id, or null for
// "no crew".
const isCrewId = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

// The three on-site fields updateJobDetails accepts. Anything else in `fields`
// is dropped rather than forwarded — the action patches these and nothing else.
const DETAIL_FIELDS = ["notes", "gateCode", "siteNotes"] as const;

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
    case "schedule": {
      if (typeof body.scheduledIso !== "string") {
        return apiFail("`scheduledIso` must be an ISO instant.", 422);
      }
      if (typeof body.durationMinutes !== "number" || !Number.isFinite(body.durationMinutes)) {
        return apiFail("`durationMinutes` must be a number.", 422);
      }
      // Required, and explicitly nullable. scheduleJob's fourth argument has no
      // "leave the crew alone" value, so treating an absent key as null would
      // quietly unassign the crew on every reschedule. `move` is the action that
      // can keep the current crew.
      if (!isCrewId(body.crewId)) {
        return apiFail("`crewId` must be a string or null.", 422);
      }
      // The action parses the date itself and refuses an invalid one with its
      // own notice, and floors the duration at 15 minutes. Neither is re-checked
      // here — a second copy of those rules is a second copy to drift.
      return apiResult(await scheduleJob(id, body.scheduledIso, body.durationMinutes, body.crewId));
    }

    case "move": {
      // null is a real value here: moveJob(id, null) means "send it back to the
      // tray" and delegates to unscheduleJob.
      const scheduledIso = body.scheduledIso;
      if (scheduledIso !== null && typeof scheduledIso !== "string") {
        return apiFail("`scheduledIso` must be an ISO instant or null.", 422);
      }
      // Absent and null differ for BOTH remaining arguments, and the difference
      // is load-bearing: omitted durationMinutes/crewId keep the job's current
      // values, an explicit null crewId clears the crew.
      let durationMinutes: number | undefined;
      if (body.durationMinutes !== undefined) {
        if (typeof body.durationMinutes !== "number" || !Number.isFinite(body.durationMinutes)) {
          return apiFail("`durationMinutes` must be a number.", 422);
        }
        durationMinutes = body.durationMinutes;
      }
      let crewId: string | null | undefined;
      if (body.crewId !== undefined) {
        if (!isCrewId(body.crewId)) {
          return apiFail("`crewId` must be a string or null.", 422);
        }
        crewId = body.crewId;
      }
      return apiResult(await moveJob(id, scheduledIso, durationMinutes, crewId));
    }

    case "unschedule": {
      return apiResult(await unscheduleJob(id));
    }

    case "assign": {
      if (!isCrewId(body.crewId)) {
        return apiFail("`crewId` must be a string or null.", 422);
      }
      // The action refuses an unknown crew id ("Crew not found."), so the id is
      // not checked against the crew list here.
      return apiResult(await assignJob(id, body.crewId));
    }

    case "setStatus": {
      if (typeof body.status !== "string") return apiFail("`status` must be a string.", 422);
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      // The action owns the status union and the cancel-needs-a-reason rule, and
      // writes the refusal sentence for both; re-listing the statuses here would
      // be a second copy to drift.
      return apiResult(await setJobStatus(id, body.status as JobStatus, reason));
    }

    case "updateDetails": {
      const fields = body.fields;
      if (typeof fields !== "object" || fields === null) {
        return apiFail("`fields` must be an object.", 422);
      }
      const raw = fields as Record<string, unknown>;
      const patch: { notes?: string; gateCode?: string; siteNotes?: string } = {};
      for (const key of DETAIL_FIELDS) {
        const value = raw[key];
        if (value === undefined) continue;
        // The action calls .trim() on whatever it is handed, so a non-string
        // would throw inside the domain and come back as a 500 with a reference
        // id instead of a written notice.
        if (typeof value !== "string") return apiFail(`\`fields.${key}\` must be a string.`, 422);
        patch[key] = value;
      }
      return apiResult(await updateJobDetails(id, patch));
    }

    case "setRecurrence": {
      if (typeof body.recurrence !== "string") {
        return apiFail("`recurrence` must be a string.", 422);
      }
      // The action checks the cadence against its own list and refuses an
      // unknown one with "Invalid cadence."
      return apiResult(await setJobRecurrence(id, body.recurrence as JobRecurrence));
    }

    case "start": {
      return apiResult(await startJob(id));
    }

    case "complete": {
      // NO GUARD. completeJob gates itself with
      // denyUnlessPermittedOrAssignedTechnician("schedule", jobId) — the owner's
      // button and the assigned technician's are the SAME call, and the
      // assignment is verified against the database rather than anything the
      // caller sends. This is the exact path an extra owner-only check broke in
      // production; do not add one.
      //
      // On success the result carries invoiceId, which apiResult() hands back as
      // the payload — the billing screen keys off it.
      return apiResult(await completeJob(id));
    }

    case "reopen": {
      return apiResult(await reopenJob(id));
    }

    case "delete": {
      // Owner-only inside the action, and it refuses an estimate-backed job or
      // one carrying an invoice, money, or logged crew hours. Every refusal
      // comes back as a written sentence.
      return apiResult(await deleteJob(id));
    }

    case "recordDeposit": {
      // MONEY. Integer cents in, integer cents through — no currency string is
      // ever parsed here, nothing is scaled, nothing is rounded. A float is
      // rejected outright rather than silently rounded by the action, because
      // "4999.999999" arriving as a dollar-math artifact is a bug upstream, not
      // a deposit.
      if (typeof body.amountCents !== "number" || !Number.isInteger(body.amountCents)) {
        return apiFail("`amountCents` must be an integer number of cents.", 422);
      }
      if (typeof body.method !== "string") return apiFail("`method` must be a string.", 422);
      // The action owns the rest: a non-positive amount, the cumulative cap
      // against the job total, the 20-second double-submit guard, and the
      // already-sent-invoice refusal.
      return apiResult(
        await recordJobDeposit(id, body.amountCents, body.method as PaymentMethod),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
