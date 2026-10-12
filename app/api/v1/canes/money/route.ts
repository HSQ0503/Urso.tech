import {
  apiFail,
  apiOk,
  apiResult,
  apiRoute,
  denyUnlessOwner,
} from "@/lib/api/v1";
import { getMoneyReport, parseMoneyPeriod } from "@/lib/canes/money";
import { mutateMoney } from "@/app/CanesPressure/money-actions";
import type { MoneyMutation } from "@urso/types";

export const dynamic = "force-dynamic";
export const GET = apiRoute(async ({ actor, req }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  return apiOk(
    await getMoneyReport(
      parseMoneyPeriod(req.nextUrl.searchParams.get("period")),
    ),
  );
});
export const POST = apiRoute(async ({ actor, req }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (
    !input ||
    typeof input !== "object" ||
    !("action" in input) ||
    typeof input.action !== "string"
  )
    return apiFail("Choose a money action.", 422);
  return apiResult(await mutateMoney(input as MoneyMutation));
});
