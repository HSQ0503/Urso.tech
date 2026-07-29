import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import {
  updateInvoice,
  sendInvoice,
  recordCashPayment,
  voidInvoice,
  deleteInvoice,
  setInvoiceRewardOffer,
  setRewardApproval,
} from "@/app/CanesPressure/actions";
import { REWARD_KIND_LABEL, type InvoiceRewardKind } from "@urso/types";

// POST /api/v1/canes/invoices/:id/actions — mutations on one invoice.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. Every action below opens with
// denyUnlessPermitted(...), and because getAdminSession() resolves a bearer
// token as well as the web cookie (M6b), that guard sees the same actor here
// that it sees on the web. Adding a second check would be a second thing to keep
// in sync, and the completeJob bug came from exactly that kind of divergence.
//
// This is the money path. The payments ledger is the source of truth for
// revenue, so every cents value arrives as integer cents and is handed to the
// action untouched — no parsing, no scaling, no rounding. A money field that
// isn't an integer is rejected at the door rather than silently coerced.
//
// NOT exposed here, deliberately: markInvoiceViewed and claimInvoiceReward. Both
// are unguarded because the PUBLIC customer page /i/[token] calls them with no
// session. Re-hosting them behind authentication would put the raw, token-only
// paths within reach of an owner-authenticated caller.
//
// The route's job is: parse, validate SHAPE, dispatch, and pass the result
// through untouched so the caller sees the sentence the action wrote.

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  // update
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  adjustmentCents?: unknown;
  messageToCustomer?: unknown;
  terms?: unknown;
  internalNotes?: unknown;
  // send
  channels?: unknown;
  toEmail?: unknown;
  toPhone?: unknown;
  // recordCashPayment
  amountCents?: unknown;
  // setRewardOffer
  kind?: unknown;
  enabled?: unknown;
  // setRewardApproval
  rewardId?: unknown;
  approve?: unknown;
  attributedMemberId?: unknown;
};

// Money crosses this boundary as integer cents or not at all. A float here means
// the caller multiplied a dollar figure somewhere and lost half a cent, so it is
// a 422 rather than something we round into the ledger.
function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

const REWARD_KINDS = Object.keys(REWARD_KIND_LABEL) as InvoiceRewardKind[];

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
    case "update": {
      // Build the patch field by field: `undefined` means "not sent" to the
      // action, and it distinguishes that from an empty string (which clears
      // the field). A blind spread of the body would send junk keys and could
      // smuggle a non-integer adjustment past the money check.
      const patch: Parameters<typeof updateInvoice>[1] = {};
      if (body.customerName !== undefined) {
        if (typeof body.customerName !== "string") return apiFail("`customerName` must be a string.", 422);
        patch.customerName = body.customerName;
      }
      if (body.customerPhone !== undefined) {
        if (typeof body.customerPhone !== "string") return apiFail("`customerPhone` must be a string.", 422);
        patch.customerPhone = body.customerPhone;
      }
      if (body.customerEmail !== undefined) {
        if (typeof body.customerEmail !== "string") return apiFail("`customerEmail` must be a string.", 422);
        patch.customerEmail = body.customerEmail;
      }
      if (body.adjustmentCents !== undefined) {
        // MONEY. This is the "actual amount" lever on the bill.
        if (!isCents(body.adjustmentCents)) {
          return apiFail("`adjustmentCents` must be an integer number of cents.", 422);
        }
        patch.adjustmentCents = body.adjustmentCents;
      }
      if (body.messageToCustomer !== undefined) {
        if (typeof body.messageToCustomer !== "string") return apiFail("`messageToCustomer` must be a string.", 422);
        patch.messageToCustomer = body.messageToCustomer;
      }
      if (body.terms !== undefined) {
        if (typeof body.terms !== "string") return apiFail("`terms` must be a string.", 422);
        patch.terms = body.terms;
      }
      if (body.internalNotes !== undefined) {
        if (typeof body.internalNotes !== "string") return apiFail("`internalNotes` must be a string.", 422);
        patch.internalNotes = body.internalNotes;
      }
      // Draft-only (contact fields excepted) is the action's rule, and it
      // returns the sentence explaining it.
      return apiResult(await updateInvoice(id, patch));
    }

    case "send": {
      // Every field is optional: `send` with no options texts and emails
      // whatever the invoice snapshot already carries. Only the shape is
      // checked — the no-destination and already-paid refusals are the
      // action's, written for the reader.
      const opts: NonNullable<Parameters<typeof sendInvoice>[1]> = {};
      if (body.channels !== undefined) {
        if (typeof body.channels !== "object" || body.channels === null) {
          return apiFail("`channels` must be an object.", 422);
        }
        const { email, text } = body.channels as { email?: unknown; text?: unknown };
        if (email !== undefined && typeof email !== "boolean") {
          return apiFail("`channels.email` must be a boolean.", 422);
        }
        if (text !== undefined && typeof text !== "boolean") {
          return apiFail("`channels.text` must be a boolean.", 422);
        }
        opts.channels = { ...(email !== undefined ? { email } : {}), ...(text !== undefined ? { text } : {}) };
      }
      if (body.toEmail !== undefined) {
        if (typeof body.toEmail !== "string") return apiFail("`toEmail` must be a string.", 422);
        opts.toEmail = body.toEmail;
      }
      if (body.toPhone !== undefined) {
        if (typeof body.toPhone !== "string") return apiFail("`toPhone` must be a string.", 422);
        opts.toPhone = body.toPhone;
      }
      return apiResult(await sendInvoice(id, opts));
    }

    case "recordCashPayment": {
      // MONEY, and the one action here that writes a payments-ledger row.
      // `amountCents` is passed through exactly as received; the action owns
      // the double-record lock, the partial-payment arithmetic and the settle
      // decision.
      if (!isCents(body.amountCents)) {
        return apiFail("`amountCents` must be an integer number of cents.", 422);
      }
      return apiResult(await recordCashPayment(id, body.amountCents));
    }

    case "void": {
      // Refuses a paid invoice, releases the job for re-billing and kills the
      // Square link. All of that is the action's.
      return apiResult(await voidInvoice(id));
    }

    case "delete": {
      // Drafts and voids only, and never one money or Square has touched.
      return apiResult(await deleteInvoice(id));
    }

    case "setRewardOffer": {
      // `kind` is a closed union, so membership IS the shape here. Checked
      // against the keys of the shared REWARD_KIND_LABEL rather than a local
      // list, so there is no second copy to drift — and because the action
      // looks the kind up in the reward config without checking, an unknown
      // one would throw and become a 500 for what is really a client typo.
      if (typeof body.kind !== "string" || !REWARD_KINDS.includes(body.kind as InvoiceRewardKind)) {
        return apiFail("`kind` must be a reward kind.", 422);
      }
      if (typeof body.enabled !== "boolean") return apiFail("`enabled` must be a boolean.", 422);
      return apiResult(await setInvoiceRewardOffer(id, body.kind as InvoiceRewardKind, body.enabled));
    }

    case "setRewardApproval": {
      // Keyed by REWARD id, not invoice id — one invoice carries several reward
      // rows, and the action reads the invoice back off the reward. The `:id`
      // in the path is the context the caller navigated from, nothing more.
      if (typeof body.rewardId !== "string") return apiFail("`rewardId` must be a string.", 422);
      if (typeof body.approve !== "boolean") return apiFail("`approve` must be a boolean.", 422);
      if (
        body.attributedMemberId !== undefined
        && body.attributedMemberId !== null
        && typeof body.attributedMemberId !== "string"
      ) {
        return apiFail("`attributedMemberId` must be a string or null.", 422);
      }
      // Approving is the money mutation: the reward enters recomputeInvoiceTotals
      // and the bill drops. Its overshoot and zero-out refusals come back verbatim.
      return apiResult(
        await setRewardApproval(body.rewardId, body.approve, body.attributedMemberId as string | null | undefined),
      );
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
