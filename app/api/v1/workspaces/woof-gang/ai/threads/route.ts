import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { createAnalystThread, listAnalystThreads } from "@/lib/ai/thread-service";
import { getWgMobileActor, sessionUserForWgActor, type WgMobileActor } from "@/lib/mobile/woof-gang";

export const GET = apiRoute<Record<string, string>, WgMobileActor>(async ({ actor }) => {
  try {
    return apiOk({ threads: await listAnalystThreads(sessionUserForWgActor(actor)) });
  } catch (error) {
    console.error("[api/v1/workspaces/woof-gang/ai/threads] list:", error instanceof Error ? error.message : error);
    return apiFail("Conversations could not be loaded.", 503);
  }
}, { authenticate: (req) => getWgMobileActor(req.headers.get("authorization")) });

export const POST = apiRoute<Record<string, string>, WgMobileActor>(async ({ req, actor }) => {
  const body = (await req.json().catch(() => ({}))) as { scope?: unknown };
  const scope = typeof body.scope === "string" ? body.scope : "all";
  try {
    return apiOk({ thread: await createAnalystThread(sessionUserForWgActor(actor), scope) }, 201);
  } catch (error) {
    console.error("[api/v1/workspaces/woof-gang/ai/threads] create:", error instanceof Error ? error.message : error);
    return apiFail("A new conversation could not be created.", 503);
  }
}, { authenticate: (req) => getWgMobileActor(req.headers.get("authorization")) });
