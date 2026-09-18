import {
  apiFail,
  apiOk,
  apiResult,
  apiRoute,
  denyUnlessOwner,
} from "@/lib/api/v1";
import { getExpenseLedger } from "@/lib/canes/expense-ledger";
import {
  addExpenseEmployee,
  editExpenseOccurrence,
  recordEmployeePayment,
  updateExpenseRule,
} from "@/app/CanesPressure/expense-actions";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  return apiOk(await getExpenseLedger());
});
export const POST = apiRoute(async ({ req, actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object")
    return apiFail("Send a JSON object.", 422);
  if (body.action === "addEmployee" && typeof body.name === "string")
    return apiResult(await addExpenseEmployee(body.name));
  if (
    body.action === "pay" &&
    typeof body.employeeId === "string" &&
    typeof body.amountCents === "number" &&
    typeof body.paidOn === "string" &&
    typeof body.method === "string" &&
    typeof body.requestKey === "string"
  ) {
    return apiResult(
      await recordEmployeePayment({
        employeeId: body.employeeId,
        amountCents: body.amountCents,
        paidOn: body.paidOn,
        method: body.method,
        requestKey: body.requestKey,
        note: typeof body.note === "string" ? body.note : undefined,
      }),
    );
  }
  if (body.action === "rule" && typeof body.id === "string")
    return apiResult(
      await updateExpenseRule(body.id, {
        active: typeof body.active === "boolean" ? body.active : undefined,
        amountCents:
          typeof body.amountCents === "number" ? body.amountCents : undefined,
        nextDueOn:
          typeof body.nextDueOn === "string" ? body.nextDueOn : undefined,
        endsOn:
          typeof body.endsOn === "string" || body.endsOn === null
            ? body.endsOn
            : undefined,
      }),
    );
  if (body.action === "entry" && typeof body.id === "string")
    return apiResult(
      await editExpenseOccurrence(body.id, {
        amountCents:
          typeof body.amountCents === "number" ? body.amountCents : undefined,
        skipped: typeof body.skipped === "boolean" ? body.skipped : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      }),
    );
  return apiFail("Choose a valid expense action and fields.", 422);
});
