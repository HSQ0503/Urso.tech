import type { NextRequest } from "next/server";
import { apiFail } from "@/lib/api/v1";
import { createAnalystAgentResponse, parseAnalystAgentBody } from "@/lib/ai/agent-runtime";
import { getWgMobileActor, sessionUserForWgActor } from "@/lib/mobile/woof-gang";

export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
  const actor = await getWgMobileActor(req.headers.get("authorization"));
  if (!actor) return apiFail("Sign in again.", 401);
  const body = parseAnalystAgentBody(await req.json().catch(() => null));
  if (!body) return apiFail("Send a valid analyst conversation.", 400);
  try {
    return await createAnalystAgentResponse(sessionUserForWgActor(actor), body, "text", req.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/v1/workspaces/woof-gang/ai/agent]", message);
    return apiFail(/API_KEY|not set/i.test(message) ? "The analyst is not configured yet." : "The analyst is temporarily unavailable. Try again.", 503);
  }
}
