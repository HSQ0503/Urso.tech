import { apiFail, apiOk, apiResult, apiRoute } from "@/lib/api/v1";
import {
  applyCustomerCredit,
  applyDocumentChange,
  customerCreditSources,
  declineEstimateByOwner,
  loadDocumentEdit,
  recordManualRefund,
} from "@/app/CanesPressure/document-actions";
import type { DocumentChange, DocumentKind } from "@urso/types";
const validKind = (value: string): value is DocumentKind =>
  ["estimate", "job", "invoice"].includes(value);
type Params = { kind: string; id: string };
export const GET = apiRoute<Params>(async ({ params, req }) => {
  if (!validKind(params.kind)) return apiFail("Document not found.", 404);
  if (
    params.kind === "invoice" &&
    req.nextUrl.searchParams.get("view") === "credits"
  ) {
    const result = await customerCreditSources(params.id);
    return result.ok ? apiOk(result.data) : apiFail(result.notice, 409);
  }
  const result = await loadDocumentEdit(params.kind, params.id);
  return result.ok ? apiOk(result.data) : apiFail(result.notice, 409);
});
export const POST = apiRoute<Params>(async ({ params, req }) => {
  if (!validKind(params.kind)) return apiFail("Document not found.", 404);
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return apiFail("Send a JSON object.", 422);
  if (body.action === "decline" && params.kind === "estimate")
    return apiResult(await declineEstimateByOwner(params.id));
  if (
    body.action === "refund" &&
    typeof body.paymentId === "string" &&
    typeof body.amountCents === "number" &&
    typeof body.requestKey === "string"
  )
    return apiResult(
      await recordManualRefund(
        body.paymentId,
        body.amountCents,
        body.requestKey,
      ),
    );
  if (
    body.action === "credit" &&
    typeof body.sourceId === "string" &&
    typeof body.amountCents === "number" &&
    typeof body.requestKey === "string"
  )
    return apiResult(
      await applyCustomerCredit(
        body.sourceId,
        params.id,
        body.amountCents,
        body.requestKey,
      ),
    );
  if (
    body.action !== "revise" ||
    !body.change ||
    typeof body.change !== "object"
  )
    return apiFail("Choose a document action.", 422);
  const input = body.change as DocumentChange;
  if (!Array.isArray(input.lines) || typeof input.fingerprint !== "string")
    return apiFail("Reload the document before revising it.", 422);
  const result = await applyDocumentChange(params.kind, params.id, input);
  return result.ok ? apiOk(result.data) : apiFail(result.notice, 409);
});
