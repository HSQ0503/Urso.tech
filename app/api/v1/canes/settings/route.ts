import { apiOk, apiRoute, denyUnlessOwner } from "@/lib/api/v1";
import { getSettings } from "@/lib/canes/data";

// GET /api/v1/canes/settings — message templates, timing offsets, estimate and
// invoice defaults, and the review-reward config, exactly as the domain returns
// them. Owner-only, matching the web settings page's requireOwnerPage(): no
// crew permission flag opens this surface.

export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ actor }) => {
  const denied = denyUnlessOwner(actor);
  if (denied) return denied;

  const settings = await getSettings();
  return apiOk(settings);
});
