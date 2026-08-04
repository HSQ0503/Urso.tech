// Refresh only the isolated MF demo tenant's encrypted provider rows from
// server-side environment keys. Secret values are never printed or copied to
// the client. Unusable legacy rows are removed only from the MF demo tenant.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of ["../.env.local", "../.env"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
      }
    }
  } catch {}
}

const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
const serviceKey = process.env.URSO_SUPABASE_SECRET_KEY;
const encryptionSecret = process.env.BRAIN_KEYS_SECRET;
if (!url || !serviceKey || !encryptionSecret || encryptionSecret.length < 16) {
  console.error("[FAIL] Supabase credentials and BRAIN_KEYS_SECRET (16+ characters) are required.");
  process.exit(1);
}

const providerEnvironment = [
  ["openai", "OPENAI_API_KEY"],
  ["google", "GOOGLE_GENERATIVE_AI_API_KEY"],
  ["anthropic", "ANTHROPIC_API_KEY"],
  ["moonshot", "MOONSHOT_API_KEY"],
];
const available = providerEnvironment
  .map(([provider, variable]) => ({ provider, key: process.env[variable]?.trim() ?? "" }))
  .filter((item) => item.key.length >= 8);
if (available.length === 0) {
  console.error("[FAIL] No supported provider API key is available in the server environment.");
  process.exit(1);
}

const derivedKey = createHash("sha256").update(encryptionSecret).digest();
function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

function canDecrypt(ciphertext) {
  try {
    const [version, iv, tag, data] = ciphertext.split(":");
    if (version !== "v1" || !iv || !tag || !data) return false;
    const decipher = createDecipheriv("aes-256-gcm", derivedKey, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
    return true;
  } catch {
    return false;
  }
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const organizationId = "minerbo-fuchs-demo";
const { data: existing, error: readError } = await db
  .from("brain_org_keys")
  .select("provider,key_ciphertext")
  .eq("organization_id", organizationId);
if (readError) {
  console.error(`[FAIL] Could not inspect MF provider keys: ${readError.message}`);
  process.exit(1);
}

const now = new Date().toISOString();
const { error: writeError } = await db.from("brain_org_keys").upsert(
  available.map((item) => ({
    organization_id: organizationId,
    provider: item.provider,
    key_ciphertext: encrypt(item.key),
    key_last4: item.key.slice(-4),
    updated_by: "brain-mf-provider-refresh",
    updated_at: now,
  })),
  { onConflict: "organization_id,provider" },
);
if (writeError) {
  console.error(`[FAIL] Could not refresh MF provider keys: ${writeError.message}`);
  process.exit(1);
}

const refreshed = new Set(available.map((item) => item.provider));
const unusableLegacy = (existing ?? [])
  .filter((item) => !refreshed.has(item.provider) && !canDecrypt(item.key_ciphertext))
  .map((item) => item.provider);
if (unusableLegacy.length > 0) {
  const { error: deleteError } = await db
    .from("brain_org_keys")
    .delete()
    .eq("organization_id", organizationId)
    .in("provider", unusableLegacy);
  if (deleteError) {
    console.error(`[FAIL] Refreshed keys, but could not remove unusable MF rows: ${deleteError.message}`);
    process.exit(1);
  }
}

console.log(`[PASS] Refreshed ${available.length} MF provider key(s): ${available.map((item) => item.provider).join(", ")}.`);
if (unusableLegacy.length > 0) {
  console.log(`[PASS] Removed ${unusableLegacy.length} undecryptable legacy MF provider row(s): ${unusableLegacy.join(", ")}.`);
}
