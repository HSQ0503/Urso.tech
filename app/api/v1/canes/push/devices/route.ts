import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import {
  disablePushDevice,
  isExpoPushToken,
  registerPushDevice,
  type PushWorkspace,
} from "@/lib/canes/push";

export const dynamic = "force-dynamic";

type RegisterBody = {
  installationId?: unknown;
  expoPushToken?: unknown;
  platform?: unknown;
  workspace?: unknown;
  deviceName?: unknown;
  appVersion?: unknown;
  buildNumber?: unknown;
  timezone?: unknown;
};

function isWorkspace(value: unknown): value is PushWorkspace {
  return value === "owner" || value === "crew";
}

function optionalText(value: unknown, max: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

async function jsonBody(req: Request): Promise<RegisterBody | null> {
  try {
    const value = await req.json() as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as RegisterBody
      : null;
  } catch {
    return null;
  }
}

export const POST = apiRoute(async ({ req, actor }) => {
  const body = await jsonBody(req);
  if (!body) return apiFail("Send a JSON body.", 422);
  if (
    typeof body.installationId !== "string" ||
    body.installationId.length < 16 ||
    body.installationId.length > 200
  ) {
    return apiFail("Send a valid installationId.", 422);
  }
  if (typeof body.expoPushToken !== "string" || !isExpoPushToken(body.expoPushToken)) {
    return apiFail("Send a valid Expo push token.", 422);
  }
  if (body.platform !== "ios" && body.platform !== "android") {
    return apiFail("platform must be ios or android.", 422);
  }
  if (!isWorkspace(body.workspace)) {
    return apiFail("workspace must be owner or crew.", 422);
  }
  if (
    !optionalText(body.deviceName, 120) ||
    !optionalText(body.appVersion, 40) ||
    !optionalText(body.buildNumber, 40) ||
    !optionalText(body.timezone, 100)
  ) {
    return apiFail("Device metadata is invalid.", 422);
  }

  try {
    return apiOk(await registerPushDevice(actor, {
      installationId: body.installationId,
      expoPushToken: body.expoPushToken,
      platform: body.platform,
      workspace: body.workspace,
      deviceName: body.deviceName,
      appVersion: body.appVersion,
      buildNumber: body.buildNumber,
      timezone: body.timezone,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("cannot register")) {
      return apiFail("This account cannot register for that workspace.", 403);
    }
    if (error instanceof Error && error.message.includes("timezone")) {
      return apiFail("Send a valid IANA timezone.", 422);
    }
    throw error;
  }
});

export const DELETE = apiRoute(async ({ req, actor }) => {
  const body = await jsonBody(req);
  if (!body) return apiFail("Send a JSON body.", 422);
  if (
    typeof body.installationId !== "string" ||
    body.installationId.length < 16 ||
    body.installationId.length > 200
  ) {
    return apiFail("Send a valid installationId.", 422);
  }
  if (!isWorkspace(body.workspace)) {
    return apiFail("workspace must be owner or crew.", 422);
  }
  const result = await disablePushDevice(actor, body.installationId, body.workspace);
  return result.disabled ? apiOk(result) : apiFail("Push device not found.", 404);
});
