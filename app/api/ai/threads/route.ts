// Thread list + create for the urso.ai strategy console. All access is scoped to
// the signed-in user via the service-role client (ownership enforced in code).

import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("analyst_threads")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ threads: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { scope?: string };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("analyst_threads")
    .insert({ user_id: user.id, client_id: user.clientId, scope: body.scope ?? "all" })
    .select("id, title, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ thread: data });
}
