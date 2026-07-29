import { apiFail, apiResult, apiRoute, isCents, isPaymentMethod } from "@/lib/api/v1";
import { createManualJob } from "@/app/CanesPressure/actions";
import type { PaymentMethod } from "@urso/types";

// POST /api/v1/canes/jobs — collection-level job mutations, same `action`
// discriminator as /jobs/:id/actions so the mobile client has one call shape.
//
// This layer adds NO authorization of its own. createManualJob already opens
// with denyUnlessPermitted("schedule"), and getAdminSession() resolves a bearer
// token as well as the web cookie (M6b), so that guard sees the same actor here
// that it sees on the web. A second check would be a second thing to keep in
// sync.
//
// Only the manual path lives here. The other way a job is born,
// createJobFromEstimate, is a PUBLIC-path action the customer estimate page
// /e/[token] calls with no session; exposing it behind auth would invite a
// caller onto the unguarded approval path.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  contactId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  jobAddress?: unknown;
  jobName?: unknown;
  totalCents?: unknown;
  depositCollectedCents?: unknown;
  depositMethod?: unknown;
  scheduledAtIso?: unknown;
  durationMinutes?: unknown;
  crewId?: unknown;
  notes?: unknown;
};

// Optional string inputs. The action .trim()s most of these, so a number here
// would throw inside the domain and surface as a 500 with a reference id rather
// than a written notice — hence a type check on each, and nothing more: phone
// format, email format and the crew id are all the action's to refuse.
const OPTIONAL_STRINGS = [
  "contactId",
  "customerPhone",
  "customerEmail",
  "jobAddress",
  "scheduledAtIso",
  "crewId",
  "notes",
  "depositMethod",
] as const;

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
    case "createManual": {
      // Same unchecked cast as the other deposit paths, plus a negative-cents
      // gap: the action caps a deposit with Math.min but never rejects a
      // negative one, so it silently reduced collected money and reported ok.
      if (typeof body.customerName !== "string") {
        return apiFail("`customerName` must be a string.", 422);
      }
      if (typeof body.jobName !== "string") {
        return apiFail("`jobName` must be a string.", 422);
      }
      // MONEY. Integer cents in, integer cents through — never a currency
      // string, never scaled, never rounded here.
      // isCents also rejects a NEGATIVE. Number.isInteger alone admits one, and
      // nothing below refuses it: createManualJob caps a deposit with Math.min
      // but never checks the sign, so a negative silently reduced collected
      // money and answered ok.
      if (!isCents(body.totalCents)) {
        return apiFail("`totalCents` must be whole cents, 0 or more.", 422);
      }
      let depositCollectedCents: number | undefined;
      if (body.depositCollectedCents !== undefined) {
        if (!isCents(body.depositCollectedCents)) {
          return apiFail("`depositCollectedCents` must be whole cents, 0 or more.", 422);
        }
        depositCollectedCents = body.depositCollectedCents;
      }
      let durationMinutes: number | undefined;
      if (body.durationMinutes !== undefined) {
        if (typeof body.durationMinutes !== "number" || !Number.isFinite(body.durationMinutes)) {
          return apiFail("`durationMinutes` must be a number.", 422);
        }
        durationMinutes = body.durationMinutes;
      }

      const optional: Partial<Record<(typeof OPTIONAL_STRINGS)[number], string>> = {};
      for (const key of OPTIONAL_STRINGS) {
        const value = body[key];
        if (value === undefined) continue;
        if (typeof value !== "string") return apiFail(`\`${key}\` must be a string.`, 422);
        optional[key] = value;
      }

      // The comment here used to say the action "refuses an unknown one
      // downstream". It does not: createManualJob passes depositMethod through
      // to a column with no CHECK constraint, so any string became the recorded
      // method on a real deposit. Validated here instead.
      let depositMethod: PaymentMethod | undefined;
      if (optional.depositMethod !== undefined) {
        if (!isPaymentMethod(optional.depositMethod)) {
          return apiFail("`depositMethod` is not a payment method.", 422);
        }
        depositMethod = optional.depositMethod;
      }

      // The action owns everything else: an empty name, a deposit above the
      // total, an unparseable date, a bad phone or email — and it writes the
      // sentence for each. On success the result carries jobId, which
      // apiResult() hands back as the payload.
      return apiResult(
        await createManualJob({
          ...optional,
          depositMethod,
          customerName: body.customerName,
          jobName: body.jobName,
          totalCents: body.totalCents,
          depositCollectedCents,
          durationMinutes,
        }),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
