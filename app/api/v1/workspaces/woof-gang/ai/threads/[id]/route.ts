import { apiFail, apiOk, apiRoute } from "@/lib/api/v1";
import { deleteAnalystThread, getAnalystThreadMessages, renameAnalystThread } from "@/lib/ai/thread-service";
import { getWgMobileActor, sessionUserForWgActor, type WgMobileActor } from "@/lib/mobile/woof-gang";

type Params = { id: string };

export const GET = apiRoute<Params, WgMobileActor>(async ({ actor, params }) => {
  try {
    const messages = await getAnalystThreadMessages(sessionUserForWgActor(actor), params.id);
    return messages ? apiOk({ messages }) : apiFail("Conversation not found.", 404);
  } catch (error) {
    console.error("[api/v1/workspaces/woof-gang/ai/threads] read:", error instanceof Error ? error.message : error);
    return apiFail("The conversation could not be loaded.", 503);
  }
}, { authenticate: (req) => getWgMobileActor(req.headers.get("authorization")) });

export const PATCH = apiRoute<Params, WgMobileActor>(async ({ req, actor, params }) => {
  const body = (await req.json().catch(() => ({}))) as { title?: unknown };
  if (typeof body.title !== "string" || !body.title.trim()) return apiFail("Enter a conversation name.", 400);
  try {
    const title = await renameAnalystThread(sessionUserForWgActor(actor), params.id, body.title);
    return title ? apiOk({ title }) : apiFail("Conversation not found.", 404);
  } catch (error) {
    console.error("[api/v1/workspaces/woof-gang/ai/threads] rename:", error instanceof Error ? error.message : error);
    return apiFail("The conversation could not be renamed.", 503);
  }
}, { authenticate: (req) => getWgMobileActor(req.headers.get("authorization")) });

export const DELETE = apiRoute<Params, WgMobileActor>(async ({ actor, params }) => {
  try {
    return await deleteAnalystThread(sessionUserForWgActor(actor), params.id)
      ? apiOk({ deleted: true })
      : apiFail("Conversation not found.", 404);
  } catch (error) {
    console.error("[api/v1/workspaces/woof-gang/ai/threads] delete:", error instanceof Error ? error.message : error);
    return apiFail("The conversation could not be deleted.", 503);
  }
}, { authenticate: (req) => getWgMobileActor(req.headers.get("authorization")) });
