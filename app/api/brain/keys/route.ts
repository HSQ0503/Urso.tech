import { getBrainUser } from "@/lib/brain/access";
import { auditBrainEvent, canEditBrainTruth, resolveBrainPrincipal } from "@/lib/brain/authorization";
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

  const { error } = await auth.admin.from("brain_org_keys").upsert(
    {
      organization_id: auth.principal.organizationId,
      provider,
      key_ciphertext: ciphertext,
      key_last4: key.slice(-4),
      updated_by: auth.principal.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await auditBrainEvent(auth.admin, auth.principal, "provider_key.saved", "provider_key", provider);
  return Response.json({ ok: true, provider, last4: key.slice(-4) });
}

export async function DELETE(req: Request) {
  const auth = await authorizedAdmin();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider ?? "";
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });

  const { error } = await auth.admin
    .from("brain_org_keys")
    .delete()
    .eq("organization_id", auth.principal.organizationId)
    .eq("provider", provider);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await auditBrainEvent(auth.admin, auth.principal, "provider_key.deleted", "provider_key", provider);
  return Response.json({ ok: true });
}
