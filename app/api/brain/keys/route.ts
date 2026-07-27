import { getBrainUser } from "@/lib/brain/access";
import { canEditBrainTruth, resolveBrainPrincipal } from "@/lib/brain/authorization";
import { encryptApiKey } from "@/lib/brain/crypto";
import { getOrgKeyStatus } from "@/lib/brain/db";
import { isBrainProvider } from "@/lib/brain/models";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";

async function authorizedAdmin() {
  const user = await getBrainUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const admin = ursoDbSafe();
  if (!admin) return { error: Response.json({ error: URSO_DB_MISSING }, { status: 503 }) };
  const principal = await resolveBrainPrincipal(admin, user);
  if (!principal || !canEditBrainTruth(principal)) {
    return { error: Response.json({ error: "knowledge steward access required" }, { status: 403 }) };
  }
  return { admin, principal };
}

export async function GET() {
  const auth = await authorizedAdmin();
  if ("error" in auth) return auth.error;
  return Response.json({
    keys: await getOrgKeyStatus(auth.admin, auth.principal.organizationId),
  });
}

export async function POST(req: Request) {
  const auth = await authorizedAdmin();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { provider?: string; key?: string };
  const provider = body.provider ?? "";
  const key = (body.key ?? "").trim();
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });
  if (key.length < 8) return Response.json({ error: "that doesn't look like an API key" }, { status: 400 });

  let ciphertext: string;
  try {
    ciphertext = encryptApiKey(key);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }

  const { error } = await auth.admin.rpc("brain_save_org_key", {
    p_organization_id: auth.principal.organizationId,
    p_actor_user_id: auth.principal.userId,
    p_actor_email: auth.principal.email,
    p_provider: provider,
    p_key_ciphertext: ciphertext,
    p_key_last4: key.slice(-4),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, provider, last4: key.slice(-4) });
}

export async function DELETE(req: Request) {
  const auth = await authorizedAdmin();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider ?? "";
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });

  const { data, error } = await auth.admin.rpc("brain_delete_org_key", {
    p_organization_id: auth.principal.organizationId,
    p_actor_user_id: auth.principal.userId,
    p_provider: provider,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "provider key not found" }, { status: 404 });
  return Response.json({ ok: true });
}
