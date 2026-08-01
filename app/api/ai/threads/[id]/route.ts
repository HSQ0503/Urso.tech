import { getSession } from "@/lib/auth";
import { deleteAnalystThread, getAnalystThreadMessages, renameAnalystThread } from "@/lib/ai/thread-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context): Promise<Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const messages = await getAnalystThreadMessages(user, (await params).id);
    return messages ? Response.json({ messages }) : Response.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Context): Promise<Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { title?: unknown };
  if (typeof body.title !== "string" || !body.title.trim()) return Response.json({ error: "title required" }, { status: 400 });
  try {
    const title = await renameAnalystThread(user, (await params).id, body.title);
    return title ? Response.json({ ok: true, title }) : Response.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Context): Promise<Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return await deleteAnalystThread(user, (await params).id)
      ? Response.json({ ok: true })
      : Response.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
