import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  addJobExpense,
  deleteJobExpense,
  addEstimateExpense,
  deleteEstimateExpense,
  addBusinessExpense,
  deleteBusinessExpense,
} from "@/app/CanesPressure/actions";
import type { ExpenseFrequency } from "@urso/types";

// POST /api/v1/canes/expenses — the cost side of the money model.
//
// ONE route with an `action` discriminator rather than a file per action. The
// discriminator also names the SCOPE the expense hangs off, because "an expense"
// is three different rows with three different guards:
//
//   addJob      / deleteJob      → job_expenses      (action gates on `invoices`)
//   addEstimate / deleteEstimate → estimate_expenses (action gates on `estimates`)
//   addBusiness / deleteBusiness → business_expenses (action is owner-only)
//
// Those three guards are NOT restated here. Every action opens with
// denyUnlessPermitted(...), and because getAdminSession() resolves a bearer token
// as well as the web cookie (M6b), that guard sees the same actor on mobile that
// it sees on the web. A second check in this file would be a second thing to keep
// in sync, and that divergence is exactly what silently broke job completion.
//
// MONEY IS INTEGER CENTS, end to end. Every cents value is type-checked and then
// passed through untouched: no parsing a currency string, no multiplying by 100,
// no rounding. A float or a dollars value reaching the DB is a wrong number on a
// real invoice, so it is refused at the door instead of coerced.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  id?: unknown;
  jobId?: unknown;
  estimateId?: unknown;
  amountCents?: unknown;
  category?: unknown;
  note?: unknown;
  name?: unknown;
  recurring?: unknown;
  frequency?: unknown;
  incurredOn?: unknown;
  endsOn?: unknown;
};

// Shape check only: it asserts the caller sent cents, not dollars and not a
// string. Whether the amount is positive is the action's rule, and re-stating it
// here would be a second copy to drift.
function centsOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

// `note` is optional on all three add actions; anything non-string is simply
// absent rather than an error, matching the web forms that omit an empty field.
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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
    case "addJob": {
      if (typeof body.jobId !== "string") return apiFail("`jobId` must be a string.", 422);
      const amountCents = centsOrNull(body.amountCents);
      if (amountCents === null) {
        return apiFail("`amountCents` must be an integer number of cents.", 422);
      }
      if (typeof body.category !== "string") return apiFail("`category` must be a string.", 422);
      // The action resolves the job, refuses an unknown one, and logs the
      // expense against its lead. All of that stays there.
      return apiResult(
        await addJobExpense({
          jobId: body.jobId,
          amountCents,
          category: body.category,
          note: optionalText(body.note),
        }),
      );
    }

    case "deleteJob": {
      if (typeof body.id !== "string") return apiFail("`id` must be a string.", 422);
      return apiResult(await deleteJobExpense(body.id));
    }

    case "addEstimate": {
      if (typeof body.estimateId !== "string") {
        return apiFail("`estimateId` must be a string.", 422);
      }
      const amountCents = centsOrNull(body.amountCents);
      if (amountCents === null) {
        return apiFail("`amountCents` must be an integer number of cents.", 422);
      }
      if (typeof body.category !== "string") return apiFail("`category` must be a string.", 422);
      return apiResult(
        await addEstimateExpense({
          estimateId: body.estimateId,
          amountCents,
          category: body.category,
          note: optionalText(body.note),
        }),
      );
    }

    case "deleteEstimate": {
      if (typeof body.id !== "string") return apiFail("`id` must be a string.", 422);
      return apiResult(await deleteEstimateExpense(body.id));
    }

    case "addBusiness": {
      if (typeof body.name !== "string") return apiFail("`name` must be a string.", 422);
      const amountCents = centsOrNull(body.amountCents);
      if (amountCents === null) {
        return apiFail("`amountCents` must be an integer number of cents.", 422);
      }
      if (typeof body.category !== "string") return apiFail("`category` must be a string.", 422);
      if (typeof body.recurring !== "boolean") {
        return apiFail("`recurring` must be a boolean.", 422);
      }
      if (typeof body.frequency !== "string") return apiFail("`frequency` must be a string.", 422);
      // `endsOn` is genuinely tri-state: absent means "leave it", explicit null
      // means "no end date". Both reach the action as written.
      const endsOn =
        body.endsOn === null ? null : typeof body.endsOn === "string" ? body.endsOn : undefined;
      return apiResult(
        await addBusinessExpense({
          name: body.name,
          amountCents,
          category: body.category,
          recurring: body.recurring,
          // The frequency union and the incurred/ends dates are owned downstream
          // (the column has its own constraint, and the action defaults an
          // omitted date to today in Eastern time). Listing the allowed values
          // here would be a second copy to drift.
          frequency: body.frequency as ExpenseFrequency,
          incurredOn: optionalText(body.incurredOn),
          endsOn,
          note: optionalText(body.note),
        }),
      );
    }

    case "deleteBusiness": {
      if (typeof body.id !== "string") return apiFail("`id` must be a string.", 422);
      return apiResult(await deleteBusinessExpense(body.id));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
