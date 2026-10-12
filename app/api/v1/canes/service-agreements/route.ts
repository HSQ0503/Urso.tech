import {
  apiFail,
  apiOk,
  apiResult,
  apiRoute,
  denyUnlessOwner,
} from "@/lib/api/v1";
import type { ServiceAgreementAction } from "@urso/types";
import { getServiceAgreements } from "@/lib/canes/service-agreements";
import {
  configureServiceAgreement,
  createServiceCancellationLink,
  enableServiceOffers,
  finalizeServiceInvoice,
  saveCrewAvailability,
  scheduleServiceOccurrence,
  setServiceCancellationFee,
} from "@/app/CanesPressure/service-agreement-actions";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  return apiOk(await getServiceAgreements());
});
export const POST = apiRoute(async ({ actor, req }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;
  let input: ServiceAgreementAction;
  try {
    input = await req.json();
  } catch {
    return apiFail("Send a JSON body.", 422);
  }
  if (!input || typeof input.action !== "string")
    return apiFail("Choose an agreement action.", 422);
  switch (input.action) {
    case "offers":
      return apiResult(await enableServiceOffers(input));
    case "configure":
      return apiResult(await configureServiceAgreement(input));
    case "availability":
      return apiResult(await saveCrewAvailability(input));
    case "link":
      return apiResult(
        await createServiceCancellationLink(input.id, input.sendText),
      );
    case "waive":
      return apiResult(await setServiceCancellationFee(input));
    case "finalize":
      return apiResult(await finalizeServiceInvoice(input.invoiceId));
    case "schedule":
      return apiResult(await scheduleServiceOccurrence(input));
    default:
      return apiFail("Unknown agreement action.", 422);
  }
});
