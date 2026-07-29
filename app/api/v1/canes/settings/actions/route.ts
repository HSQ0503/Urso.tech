import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import { saveSettings } from "@/app/CanesPressure/actions";

// POST /api/v1/canes/settings/actions — write the business settings.
//
// ONE route per resource with an `action` discriminator, rather than a route per
// action. There are 72 owner actions; 72 files would be 72 places to forget a
// guard, and the guard is the whole point.
//
// This layer adds NO authorization of its own. saveSettings opens with
// denyUnlessPermitted() — no key, so OWNER-ONLY — and because getAdminSession()
// resolves a bearer token as well as the web cookie (M6b), that guard sees the
// same actor here that it sees on the web. Adding a second check would be a
// second thing to keep in sync, and the completeJob bug came from exactly that
// kind of divergence.
//
// saveSettings takes a PATCH, not the whole settings object: it upserts one row
// per key present and leaves every absent key alone (`settings` is a key/value
// table, and the web form saves one section at a time — templates here, review
// rewards there). So `settings` is forwarded VERBATIM, keys and all. Two things
// follow, and both are deliberate:
//
//   * No field is enumerated or re-validated here. The shape is the action's
//     parameter type, and copying it into this file would be a second copy to
//     drift the moment a setting is added.
//   * Nothing is defaulted or filled in. Inventing a key the caller did not send
//     would overwrite a live setting with a guess, which is exactly the blanking
//     this route must not do.
//
// The cents inside review_rewards ride through untouched for the same reason —
// no parsing, no scaling, no rounding anywhere on this path.

export const dynamic = "force-dynamic";

type SettingsPatch = Parameters<typeof saveSettings>[0];

type Body = {
  action?: unknown;
  settings?: unknown;
};

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
    case "save": {
      if (typeof body.settings !== "object" || body.settings === null || Array.isArray(body.settings)) {
        return apiFail("`settings` must be an object.", 422);
      }
      // An empty patch would write nothing and answer ok — a save that silently
      // did not save. Refuse it as a malformed request instead.
      if (Object.keys(body.settings).length === 0) {
        return apiFail("`settings` must name at least one setting to save.", 422);
      }
      return apiResult(await saveSettings(body.settings as SettingsPatch));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
