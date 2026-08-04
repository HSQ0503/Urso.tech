// Synchronize the MF demo's legacy provider rows from Urso's canonical
// encrypted registry. Ciphertext is copied byte-for-byte: this command never
// reads plaintext provider keys and never re-encrypts with a local secret.
// The MF runtime reads the canonical Urso registry directly; this sync keeps
// older deployments compatible during rollout.
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
if (!url || !serviceKey) {
  console.error("[FAIL] Supabase URL and server credential are required.");
  process.exit(1);
}

const sourceOrganizationId = "urso";
const targetOrganizationId = "minerbo-fuchs-demo";
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: sourceKeys, error: readError } = await db
  .from("brain_org_keys")
  .select("provider,key_ciphertext,key_last4")
  .eq("organization_id", sourceOrganizationId);
if (readError) {
  console.error(`[FAIL] Could not read the canonical provider registry: ${readError.message}`);
  process.exit(1);
}
if (!sourceKeys?.length) {
  console.error("[FAIL] The canonical Urso provider registry is empty.");
  process.exit(1);
}

const { error: writeError } = await db.from("brain_org_keys").upsert(
  sourceKeys.map((row) => ({
    organization_id: targetOrganizationId,
    provider: row.provider,
    key_ciphertext: row.key_ciphertext,
    key_last4: row.key_last4,
    updated_by: "brain-mf-provider-sync:urso",
    updated_at: new Date().toISOString(),
  })),
  { onConflict: "organization_id,provider" },
);
if (writeError) {
  console.error(`[FAIL] Could not synchronize the MF provider registry: ${writeError.message}`);
  process.exit(1);
}

console.log(
  `[PASS] Synchronized ${sourceKeys.length} encrypted provider row(s) from Urso to the MF compatibility registry: ${sourceKeys.map((row) => row.provider).join(", ")}.`,
);
