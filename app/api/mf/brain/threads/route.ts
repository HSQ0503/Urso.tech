import { BRAIN_PROVIDERS } from "@/lib/brain/catalog";
import { getOrgKeyStatus } from "@/lib/brain/db";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { MF_BRAIN_PROJECT_ID } from "@/lib/mf-demo/brain-config";
import { resolveMfDemoPrincipal } from "@/lib/mf-demo/brain-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveMfDemoPrincipal(admin, url.searchParams.get("roleId"));
  if (!principal) return Response.json({ error: "MF Brain unavailable" }, { status: 503 });

  const { data, error } = await admin
    .from("brain_threads")
    .select("id, title, project_id, model, updated_at")
    .eq("organization_id", principal.organizationId)
    .eq("user_id", principal.userId)
    .eq("project_id", MF_BRAIN_PROJECT_ID)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ threads: data ?? [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { roleId?: string };
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveMfDemoPrincipal(admin, body.roleId);
  if (!principal) return Response.json({ error: "MF Brain unavailable" }, { status: 503 });

  const statuses = await getOrgKeyStatus(admin, principal.organizationId).catch(() => []);
  const provider = statuses[0]?.provider;
  const model = provider ? `${provider}/${BRAIN_PROVIDERS[provider].defaultModel}` : "";
  const { data, error } = await admin
    .from("brain_threads")
    .insert({
      organization_id: principal.organizationId,
      user_id: principal.userId,
      project_id: MF_BRAIN_PROJECT_ID,
      model,
    })
    .select("id, title, project_id, model, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ thread: data });
}
