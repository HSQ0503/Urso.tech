// Brain thread list + create. Scoped to the signed-in brain user via the
// service-role client (ownership enforced in code).

import { getBrainUser } from "@/lib/brain/access";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brain_threads")
    .select("id, title, project_id, model, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ threads: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brain_threads")
    .insert({ user_id: user.id, project_id: body.projectId ?? null })
    .select("id, title, project_id, model, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ thread: data });
}
