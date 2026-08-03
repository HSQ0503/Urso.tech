import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { isMfDemoRoleId } from "@/lib/mf-demo/brain-config";
import { getMfBrainWorkspace, resolveMfDemoPrincipal } from "@/lib/mf-demo/brain-server";
import { MfSessionContractError } from "@/lib/mf-demo/session-runtime.mjs";
import {
  mfSessionCredentialsFromRequest,
  mfSessionErrorResponse,
  requireMfDemoSession,
} from "@/lib/mf-demo/session-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });

  try {
    await requireMfDemoSession(admin, mfSessionCredentialsFromRequest(request));
    const roleId = url.searchParams.get("roleId");
    if (!isMfDemoRoleId(roleId)) {
      throw new MfSessionContractError("invalid_role", 400, "Unknown MF demo role.");
    }
    const principal = await resolveMfDemoPrincipal(admin, roleId);
    if (!principal) {
      return Response.json({ error: "The MF Brain tenant is not provisioned yet." }, { status: 503 });
    }
    return Response.json(await getMfBrainWorkspace(admin, principal));
  } catch (error) {
    if (error instanceof MfSessionContractError) return mfSessionErrorResponse(error);
    console.error("[mf-brain] workspace failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "The MF Brain workspace could not be loaded." }, { status: 503 });
  }
}
