import { getSession } from "@/lib/auth";
import { createAnalystThread, listAnalystThreads } from "@/lib/ai/thread-service";

export async function GET(): Promise<Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ threads: await listAnalystThreads(user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { scope?: unknown };
  const scope = typeof body.scope === "string" ? body.scope : "all";
  try {
    return Response.json({ thread: await createAnalystThread(user, scope) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
