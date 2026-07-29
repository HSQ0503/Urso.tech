import { apiOk, apiRoute, denyUnlessPagePermitted } from "@/lib/api/v1";
import { listCustomerDirectory } from "@/lib/canes/customers";

// GET /api/v1/canes/customers/directory — the lean picker directory (id, name,
// phone, email, primary address) behind the customer typeahead. Same
// `customers` gate as the full list.
//
// "directory" is a static segment sitting beside the dynamic [id] route; Next
// resolves static segments first, so a customer whose id is literally
// "directory" is unreachable here — an acceptable trade for a UUID key space.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessPagePermitted(actor, "customers");
  if (denied) return denied;

  return apiOk(await listCustomerDirectory());
});
