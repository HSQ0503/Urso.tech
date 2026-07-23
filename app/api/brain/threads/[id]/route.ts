// A single brain thread: hydrate its messages, rename it, or delete it. Every
// handler verifies the thread belongs to the signed-in user first.

import { getBrainUser } from "@/lib/brain/access";
import { resolveBrainPrincipal } from "@/lib/brain/authorization";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { getOwnedBrainThread } from "@/lib/brain/threads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) return Response.json({ error: "active brain membership required" }, { status: 403 });
  const owned = await getOwnedBrainThread(admin, user.id, id, principal.organizationId);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const { data, error } = await admin
    .from("brain_messages")
    .select("id, role, parts")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ messages: data ?? [], projectId: owned.project_id });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) return Response.json({ error: "active brain membership required" }, { status: 403 });
  const owned = await getOwnedBrainThread(admin, user.id, id, principal.organizationId);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const { title } = (await req.json().catch(() => ({}))) as { title?: string };
  const trimmed = (title ?? "").trim().slice(0, 80);
  if (!trimmed) return Response.json({ error: "title required" }, { status: 400 });

  const { error } = await admin
    .from("brain_threads")
    .update({ title: trimmed })
    .eq("organization_id", principal.organizationId)
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, title: trimmed });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal) return Response.json({ error: "active brain membership required" }, { status: 403 });
  const owned = await getOwnedBrainThread(admin, user.id, id, principal.organizationId);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  // Messages cascade on thread delete (FK on delete cascade).
  const { error } = await admin
    .from("brain_threads")
    .delete()
    .eq("organization_id", principal.organizationId)
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
