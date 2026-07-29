import { apiFail, apiResult, apiRoute } from "@/lib/api/v1";
import { saveSettings } from "@/app/CanesPressure/actions";

// POST /api/v1/canes/settings/actions — write the business settings.
//
// This layer adds NO authorization of its own. saveSettings opens with
// denyUnlessPermitted() — no key, so OWNER-ONLY — and getAdminSession() resolves
// a bearer token as well as the web cookie (M6b), so that guard sees the same
// actor here as on the web.
//
// It DOES validate, and that is not a contradiction of "the action owns business
// rules". saveSettings owns none: it is a bare Object.entries(patch) loop that
// upserts whatever key/value pairs it is handed, with no shape check, no range
// check and no key whitelist. Nothing downstream is safer either — getSettings
// reads the row back with Number(...) and hands it to the estimate builder.
//
// So an unvalidated forward was not "trusting the domain", it was writing
// arbitrary rows into the table the whole business reads from. The one that
// forced this rewrite: estimate_tax_rate_bps is basis points, snapshotted onto
// every estimate at creation. POST 500000 and every estimate afterwards bills
// the customer fifty times the subtotal in tax, on invoices already sent. There
// is no undo for an estimate a customer has approved.
//
// saveSettings takes a PATCH — one row per key present, absent keys untouched —
// so an unknown key is rejected rather than ignored: a typo like "review_reward"
// would otherwise write a row nothing ever reads and silently not save the
// setting the user thought they saved.

export const dynamic = "force-dynamic";

type SettingsPatch = Parameters<typeof saveSettings>[0];

type Body = {
  action?: unknown;
  settings?: unknown;
};

// Every key saveSettings accepts, with how to check it. Anything absent from
// this map is refused.
const KEYS = [
  "quiet_hours",
  "confirmation_offset_hours",
  "templates",
  "lead_vendor_phones",
  "estimate_terms",
  "estimate_message",
  "deposit_presets",
  "estimate_expiry_days",
  "estimate_tax_rate_bps",
  "estimate_reminder_days",
  "invoice_reminder_days",
  "review_rewards",
] as const;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const intInRange = (v: unknown, lo: number, hi: number): boolean => isInt(v) && v >= lo && v <= hi;
const intArray = (v: unknown, lo: number, hi: number): boolean =>
  Array.isArray(v) && v.every((n) => intInRange(n, lo, hi));

// Returns an error sentence, or null when the value is acceptable.
function invalid(key: (typeof KEYS)[number], v: unknown): string | null {
  switch (key) {
    case "quiet_hours": {
      if (typeof v !== "object" || v === null) return "`quiet_hours` must be an object.";
      const q = v as Record<string, unknown>;
      if (!intInRange(q.start, 0, 23) || !intInRange(q.end, 0, 23)) {
        return "`quiet_hours.start` and `.end` must be hours 0-23.";
      }
      if (!isStr(q.timezone)) return "`quiet_hours.timezone` must be a string.";
      return null;
    }
    case "confirmation_offset_hours":
      return intInRange(v, 0, 168) ? null : "`confirmation_offset_hours` must be 0-168.";
    case "templates": {
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        return "`templates` must be an object of strings.";
      }
      return Object.values(v as Record<string, unknown>).every(isStr)
        ? null
        : "Every template must be a string.";
    }
    case "lead_vendor_phones":
      return Array.isArray(v) && v.every(isStr) ? null : "`lead_vendor_phones` must be strings.";
    case "estimate_terms":
    case "estimate_message":
      return isStr(v) ? null : `\`${key}\` must be a string.`;
    // Money, in cents. Non-negative integers only.
    case "deposit_presets":
      return intArray(v, 0, 100_000_00) ? null : "`deposit_presets` must be whole cents, 0 or more.";
    case "estimate_expiry_days":
      // A zero or negative expiry would expire every estimate the moment it is
      // created; getSettings coerces with Number() and would take NaN happily.
      return intInRange(v, 1, 365) ? null : "`estimate_expiry_days` must be 1-365.";
    case "estimate_tax_rate_bps":
      // Basis points: 10000 = 100%. Snapshotted onto every estimate, so an
      // out-of-range value bills real customers.
      return intInRange(v, 0, 10_000) ? null : "`estimate_tax_rate_bps` must be 0-10000 (0-100%).";
    case "estimate_reminder_days":
    case "invoice_reminder_days":
      return intArray(v, 0, 365) ? null : `\`${key}\` must be whole days, 0-365.`;
    case "review_rewards": {
      if (typeof v !== "object" || v === null) return "`review_rewards` must be an object.";
      const r = v as Record<string, unknown>;
      for (const cents of ["google_cents", "facebook_cents", "follow_cents"] as const) {
        // Money off an invoice. A negative would ADD to what the customer owes.
        if (!intInRange(r[cents], 0, 100_000_00)) {
          return `\`review_rewards.${cents}\` must be whole cents, 0 or more.`;
        }
      }
      for (const url of ["google_url", "facebook_url", "instagram_url"] as const) {
        if (!isStr(r[url])) return `\`review_rewards.${url}\` must be a string.`;
      }
      return null;
    }
  }
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
    case "save": {
      if (typeof body.settings !== "object" || body.settings === null || Array.isArray(body.settings)) {
        return apiFail("`settings` must be an object.", 422);
      }
      const raw = body.settings as Record<string, unknown>;

      const unknownKey = Object.keys(raw).find(
        (k) => !(KEYS as readonly string[]).includes(k),
      );
      if (unknownKey !== undefined) {
        return apiFail(`\`settings.${unknownKey}\` is not a setting.`, 422);
      }

      const patch: Record<string, unknown> = {};
      for (const key of KEYS) {
        const value = raw[key];
        if (value === undefined) continue; // absent stays absent — never defaulted
        const problem = invalid(key, value);
        if (problem !== null) return apiFail(problem, 422);
        patch[key] = value;
      }

      // An empty patch would write nothing and answer ok — a save that silently
      // did not save. Refuse it as a malformed request instead.
      if (Object.keys(patch).length === 0) {
        return apiFail("`settings` must name at least one setting to save.", 422);
      }

      return apiResult(await saveSettings(patch as SettingsPatch));
    }

    default:
      return apiFail(`Unknown action "${body.action}".`, 422);
  }
});
