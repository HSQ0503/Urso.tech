// Org BYO API keys. v1: any signed-in Urso HQ user may manage them (the project
// holds only Urso's own people); add a role column before provisioning demo
// users for outsiders. Keys are AES-256-GCM encrypted at rest; only the last 4
// characters ever leave the server.

import { getBrainUser } from "@/lib/brain/access";
import { ursoDbSafe, URSO_DB_MISSING } from "@/lib/brain/supabase";
import { encryptApiKey } from "@/lib/brain/crypto";
import { getOrgKeyStatus } from "@/lib/brain/db";
import { isBrainProvider } from "@/lib/brain/models";

export async function GET() {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  return Response.json({ keys: await getOrgKeyStatus(admin) });
}

export async function POST(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string; key?: string };
  const provider = body.provider ?? "";
  const key = (body.key ?? "").trim();
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });
  if (key.length < 8) return Response.json({ error: "that doesn't look like an API key" }, { status: 400 });

  let ciphertext: string;
  try {
    ciphertext = encryptApiKey(key);
  } catch (e) {
    // BRAIN_KEYS_SECRET missing — tell the admin exactly what to fix.
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const { error } = await admin.from("brain_org_keys").upsert(
    {
      provider,
      key_ciphertext: ciphertext,
      key_last4: key.slice(-4),
      updated_by: user.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, provider, last4: key.slice(-4) });
}

export async function DELETE(req: Request) {
  const user = await getBrainUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider ?? "";
  if (!isBrainProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });

  const admin = ursoDbSafe();
  if (!admin) return Response.json({ error: URSO_DB_MISSING }, { status: 503 });
  const { error } = await admin.from("brain_org_keys").delete().eq("provider", provider);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
