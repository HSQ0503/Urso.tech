import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import {
  getPushPreferences,
  isPushEventType,
  updatePushPreferences,
  type PushEventType,
} from "@/lib/canes/push";

export const dynamic = "force-dynamic";

type PatchBody = {
  enabled?: unknown;
  eventTypes?: unknown;
  quietHours?: unknown;
};

export const GET = apiRoute(async ({ actor }) => apiOk(await getPushPreferences(actor)));

export const PATCH = apiRoute(async ({ req, actor }) => {
  let body: PatchBody;
  try {
    const value = await req.json() as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return apiFail("Send a JSON object.", 422);
    }
    body = value as PatchBody;
  } catch {
    return apiFail("Send a JSON body.", 422);
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return apiFail("enabled must be true or false.", 422);
  }

  let eventTypes: Partial<Record<PushEventType, boolean>> | undefined;
  if (body.eventTypes !== undefined) {
    if (typeof body.eventTypes !== "object" || body.eventTypes === null || Array.isArray(body.eventTypes)) {
      return apiFail("eventTypes must be an object.", 422);
    }
    eventTypes = {};
    for (const [key, value] of Object.entries(body.eventTypes)) {
      if (!isPushEventType(key)) return apiFail(`Unknown notification type "${key}".`, 422);
      if (typeof value !== "boolean") return apiFail(`${key} must be true or false.`, 422);
      eventTypes[key] = value;
    }
  }

  let quietHours:
    | { enabled?: boolean; startHour?: number; endHour?: number; timezone?: string }
    | undefined;
  if (body.quietHours !== undefined) {
    if (typeof body.quietHours !== "object" || body.quietHours === null || Array.isArray(body.quietHours)) {
      return apiFail("quietHours must be an object.", 422);
    }
    const raw = body.quietHours as Record<string, unknown>;
    const unknown = Object.keys(raw).find(
      (key) => !["enabled", "startHour", "endHour", "timezone"].includes(key),
    );
    if (unknown) return apiFail(`Unknown quietHours field "${unknown}".`, 422);
    if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
      return apiFail("quietHours.enabled must be true or false.", 422);
    }
    if (raw.startHour !== undefined && !Number.isInteger(raw.startHour)) {
      return apiFail("quietHours.startHour must be a whole hour.", 422);
    }
    if (raw.endHour !== undefined && !Number.isInteger(raw.endHour)) {
      return apiFail("quietHours.endHour must be a whole hour.", 422);
    }
    if (raw.timezone !== undefined && typeof raw.timezone !== "string") {
      return apiFail("quietHours.timezone must be an IANA timezone.", 422);
    }
    quietHours = {
      enabled: raw.enabled as boolean | undefined,
      startHour: raw.startHour as number | undefined,
      endHour: raw.endHour as number | undefined,
      timezone: raw.timezone as string | undefined,
    };
  }

  if (body.enabled === undefined && eventTypes === undefined && quietHours === undefined) {
    return apiFail("Send at least one notification preference.", 422);
  }

  try {
    return apiOk(await updatePushPreferences(actor, {
      enabled: body.enabled as boolean | undefined,
      eventTypes,
      quietHours,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("quiet hours")) {
      return apiFail("Quiet hours must use 0-23 and a valid IANA timezone.", 422);
    }
    throw error;
  }
});
