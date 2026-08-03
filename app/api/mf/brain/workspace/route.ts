import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { getMfBrainWorkspace, resolveMfDemoPrincipal } from "@/lib/mf-demo/brain-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const principal = await resolveMfDemoPrincipal(admin, url.searchParams.get("roleId"));
  if (!principal) {
    return Response.json({ error: "The MF Brain tenant is not provisioned yet." }, { status: 503 });
  }

  try {
    return Response.json(await getMfBrainWorkspace(admin, principal));
  } catch (error) {
    console.error("[mf-brain] workspace failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "The MF Brain workspace could not be loaded." }, { status: 503 });
  }
}
