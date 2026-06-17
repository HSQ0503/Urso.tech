// A single console thread: hydrate its messages, rename it, or delete it. Every
// handler verifies the thread belongs to the signed-in user before touching it.

import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedThread } from "@/lib/ai/memory";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const owned = await getOwnedThread(admin, user.id, id);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const { data, error } = await admin
    .from("analyst_messages")
    .select("id, role, parts")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ messages: data ?? [] });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const owned = await getOwnedThread(admin, user.id, id);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const { title } = (await req.json().catch(() => ({}))) as { title?: string };
  const trimmed = (title ?? "").trim().slice(0, 80);
  if (!trimmed) return Response.json({ error: "title required" }, { status: 400 });

  const { error } = await admin.from("analyst_threads").update({ title: trimmed }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, title: trimmed });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const owned = await getOwnedThread(admin, user.id, id);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  // Messages cascade on thread delete (FK on delete cascade).
  const { error } = await admin.from("analyst_threads").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
