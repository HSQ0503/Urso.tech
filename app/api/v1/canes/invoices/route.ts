import { apiFail, apiOk, apiResult, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listInvoices } from "@/lib/canes/invoices";
import { createInvoiceFromJob, createManualInvoice } from "@/app/CanesPressure/actions";

// GET /api/v1/canes/invoices — the invoice list, exactly as the owner console's
// /CanesPressure/invoices page reads it. That page gates on
// requirePagePermission("invoices"), so this gates on the same key.
//
// Money is returned in the integer cents the domain stores. Formatting is a
// client concern; rounding or summing here would make the API and the web
// console disagree about the same invoice.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "invoices");
  if (denied) return denied;

  const invoices = await listInvoices();
  return apiOk(invoices);
});

// POST /api/v1/canes/invoices — the two ways an invoice comes into existence,
// behind the same `action` discriminator the per-invoice route uses.
//
// Unlike the GET above, this adds NO guard of its own: both actions open with
// denyUnlessPermitted("invoices"), and getAdminSession() resolves a bearer token
// as well as the web cookie, so that guard sees the same actor here as on the
// web. A page-permission check bolted on here would be a second copy of the
// rule, free to drift from the one that actually decides.
//
// `totalCents` is integer cents, passed to the action untouched.

type PostBody = {
  action?: unknown;
  // createFromJob
  jobId?: unknown;
  // createManual
  contactId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  jobAddress?: unknown;
  jobName?: unknown;
  totalCents?: unknown;
};

export const POST = apiRoute(async ({ req }) => {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (typeof body.action !== "string") {
    return apiFail("Send an `action`.", 422);
  }

  switch (body.action) {
    case "createFromJob": {
      // Insert-only against the partial unique index on job_id, so a second
      // call returns the existing invoice id rather than a duplicate bill.
      if (typeof body.jobId !== "string") return apiFail("`jobId` must be a string.", 422);
      return apiResult(await createInvoiceFromJob(body.jobId));
    }

    case "createManual": {
      // A standalone invoice with no job behind it. Only presence and type are
      // checked; the blank-name, phone-format and amount refusals are the
      // action's, each with its own sentence.
      if (typeof body.customerName !== "string") return apiFail("`customerName` must be a string.", 422);
      if (typeof body.jobName !== "string") return apiFail("`jobName` must be a string.", 422);
      // MONEY.
      if (typeof body.totalCents !== "number" || !Number.isInteger(body.totalCents)) {
        return apiFail("`totalCents` must be an integer number of cents.", 422);
      }
      const optional: {
        contactId?: string;
        customerPhone?: string;
        customerEmail?: string;
        jobAddress?: string;
      } = {};
      if (body.contactId !== undefined) {
        if (typeof body.contactId !== "string") return apiFail("`contactId` must be a string.", 422);
        optional.contactId = body.contactId;
      }
      if (body.customerPhone !== undefined) {
        if (typeof body.customerPhone !== "string") return apiFail("`customerPhone` must be a string.", 422);
        optional.customerPhone = body.customerPhone;
      }
      if (body.customerEmail !== undefined) {
        if (typeof body.customerEmail !== "string") return apiFail("`customerEmail` must be a string.", 422);
        optional.customerEmail = body.customerEmail;
      }
      if (body.jobAddress !== undefined) {
        if (typeof body.jobAddress !== "string") return apiFail("`jobAddress` must be a string.", 422);
        optional.jobAddress = body.jobAddress;
      }
      return apiResult(
        await createManualInvoice({
          ...optional,
          customerName: body.customerName,
          jobName: body.jobName,
          totalCents: body.totalCents,
        }),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
