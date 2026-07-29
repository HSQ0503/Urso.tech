import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted, isIsoInstant } from "@/lib/api/v1";
import { listLeads } from "@/lib/canes/data";
import { createLead, createQuoteVisit } from "@/app/CanesPressure/actions";
import type { LeadSource, LeadType } from "@urso/types";

// GET /api/v1/canes/leads — the lead list, exactly as the owner console's
// /CanesPressure/leads page reads it. That page gates on requirePagePermission
// ("leads"), so this gates on the same key.
//
// No filter is passed through: the web page also calls listLeads() unfiltered
// and narrows in the UI, and filtering here would be logic this layer must not
// own.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "leads");
  if (denied) return denied;

  const leads = await listLeads();
  return apiOk(leads);
});

// POST /api/v1/canes/leads — the two ways a lead row is born.
//
// Same discriminator model as /leads/:id/actions, and the same rule: this layer
// adds NO authorization of its own. createLead opens with
// denyUnlessPermitted("leads") and createQuoteVisit with
// denyUnlessPermitted("schedule"); getAdminSession() resolves a bearer token as
// well as the web cookie, so those guards see the same actor here as on web.
//
// createQuoteVisit lives HERE, not on /leads/:id/actions where the collection of
// lead mutations otherwise sits, because its real signature takes no lead id —
// it INSERTS a lead (a standalone, phone-less quote visit booked from the
// schedule board). Hanging it off /leads/:id would force a caller to invent an
// id that the action never reads.

type Body = {
  action?: unknown;
  // createLead
  name?: unknown;
  phone?: unknown;
  type?: unknown;
  source?: unknown;
  email?: unknown;
  service?: unknown;
  // createQuoteVisit
  customerName?: unknown;
  jobName?: unknown;
  // both
  address?: unknown;
  appointmentIso?: unknown;
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
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      if (typeof body.phone !== "string") return apiFail("`phone` must be a string.", 422);
      if (typeof body.type !== "string") return apiFail("`type` must be a string.", 422);
      if (typeof body.source !== "string") return apiFail("`source` must be a string.", 422);
      if (body.email !== undefined && typeof body.email !== "string") {
        return apiFail("`email` must be a string.", 422);
      }
      if (body.service !== undefined && typeof body.service !== "string") {
        return apiFail("`service` must be a string.", 422);
      }
      if (body.address !== undefined && typeof body.address !== "string") {
        return apiFail("`address` must be a string.", 422);
      }
      // The instant check matters most here of anywhere in this layer, because
      // createLead is the one caller that CANNOT report the failure. It inserts
      // the lead, then runs `if (fields.appointmentIso) await setAppointment(...)`
      // and DISCARDS the result — so setAppointment's own "Invalid date." refusal
      // is thrown away and the route answers ok:true for a lead with no visit
      // booked and no confirmation task queued. On web that is unreachable (the
      // form composes the instant with etLocalToIso); from a phone it is one bad
      // string. Refuse before the insert so there is no half-made lead — and note
      // that a retry with a good instant would then collide with the UNIQUE phone
      // constraint and read as a duplicate, which is why this cannot be left to
      // the domain.
      //
      // isIsoInstant, not Number.isFinite(Date.parse(…)): V8's fallback parser
      // reads "tomorrow at 3" as 2001-03-01, so the loose check would book that.
      if (body.appointmentIso !== undefined && !isIsoInstant(body.appointmentIso)) {
        return apiFail("`appointmentIso` must be an ISO instant.", 422);
      }
      // `type` and `source` are cast, not re-validated: both columns carry a
      // CHECK constraint, so an unknown member is refused in the database and
      // the message comes back as the notice. Re-listing the members here is
      // the second copy that drifts the first time a source is added.
      //
      // The phone is passed through raw — createLead runs it through toE164 and
      // answers "That phone number doesn't look valid." Normalizing it here
      // would mean two normalizers to keep identical.
      //
      // Note on the duplicate-phone refusal: createLead returns
      // { ok: false, notice, existingLeadId }, and apiResult forwards extra keys
      // only on the success path, so the id is dropped. The notice still names
      // the existing customer, which is what the screen shows.
      return apiResult(
        await createLead({
          name: body.name,
          phone: body.phone,
          type: body.type as LeadType,
          source: body.source as LeadSource,
          email: body.email,
          service: body.service,
          address: body.address,
          appointmentIso: body.appointmentIso,
        }),
      );
    }

    case "createQuoteVisit": {
      if (typeof body.customerName !== "string") {
        return apiFail("`customerName` must be a string.", 422);
      }
      if (typeof body.jobName !== "string") return apiFail("`jobName` must be a string.", 422);
      if (typeof body.address !== "string") return apiFail("`address` must be a string.", 422);
      // Same instant check as `create` above, though it is not load-bearing here:
      // createQuoteVisit validates the date itself and its refusal DOES reach the
      // caller. It only sharpens a 409 into a 422 for a string that is not an
      // instant at all — and keeps one definition of "ISO instant" in this file
      // rather than two that drift.
      if (!isIsoInstant(body.appointmentIso)) {
        return apiFail("`appointmentIso` must be an ISO instant.", 422);
      }
      // Emptiness, length caps, and "must be in the future" are all the
      // action's, each with its own sentence for the owner.
      return apiResult(
        await createQuoteVisit({
          customerName: body.customerName,
          jobName: body.jobName,
          address: body.address,
          appointmentIso: body.appointmentIso,
        }),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
