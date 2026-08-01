import { getSession } from "@/lib/auth";
import { createAnalystAgentResponse, parseAnalystAgentBody } from "@/lib/ai/agent-runtime";

export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = parseAnalystAgentBody(await req.json().catch(() => null));
  if (!body) return Response.json({ error: "invalid request" }, { status: 400 });
  try {
    return await createAnalystAgentResponse(user, body, "ui", req.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ai/agent] request failed:", message);
    return Response.json({ error: message }, { status: /API_KEY|not set/i.test(message) ? 503 : 500 });
  }
}
