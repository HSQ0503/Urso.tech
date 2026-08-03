// Read-only isolation and provisioning gate for the MF demonstration Brain.
import { readFileSync } from "node:fs";

for (const file of ["../.env.local", "../.env"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

const url = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
const key = process.env.URSO_SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const org = "minerbo-fuchs-demo";
const project = "uberlandia-refrescos-f3";

async function rows(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${(await response.text()).slice(0, 180)}`);
  return response.json();
}

const checks = [];
async function check(name, operation) {
  try {
    checks.push({ name, ...(await operation()) });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

await check("MF organization and project exist", async () => {
  const [organizations, projects] = await Promise.all([
    rows(`brain_organizations?select=id&id=eq.${org}`),
    rows(`brain_projects?select=id&organization_id=eq.${org}&id=eq.${project}`),
  ]);
  return organizations.length === 1 && projects.length === 1
    ? { ok: true, detail: `${org}/${project}` }
    : { ok: false, detail: "organization or project missing" };
});

await check("All 15 MF departments exist", async () => {
  const departments = await rows(`brain_departments?select=id&organization_id=eq.${org}`);
  return departments.length === 15
    ? { ok: true, detail: "15 departments" }
    : { ok: false, detail: `${departments.length}/15 departments` };
});

await check("Five demo personas are project scoped", async () => {
  const [memberships, projects] = await Promise.all([
    rows(`brain_memberships?select=user_id&organization_id=eq.${org}&user_id=like.mf-demo:*&active=eq.true`),
    rows(`brain_project_memberships?select=user_id&organization_id=eq.${org}&project_id=eq.${project}&active=eq.true`),
  ]);
  const projectUsers = new Set(projects.map((row) => row.user_id));
  const missing = memberships.filter((row) => !projectUsers.has(row.user_id));
  return memberships.length === 5 && missing.length === 0
    ? { ok: true, detail: "5/5 project memberships" }
    : { ok: false, detail: `${memberships.length} personas, ${missing.length} missing project access` };
});

await check("MF corpus cannot overlap Urso paths", async () => {
  const [mfDocs, ursoDocs] = await Promise.all([
    rows(`brain_docs?select=path&organization_id=eq.${org}`),
    rows("brain_docs?select=path&organization_id=eq.urso"),
  ]);
  const ursoPaths = new Set(ursoDocs.map((row) => row.path));
  const overlap = mfDocs.filter((row) => ursoPaths.has(row.path));
  return overlap.length === 0
    ? { ok: true, detail: `${mfDocs.length} MF docs, zero cross-tenant path overlap` }
    : { ok: false, detail: `${overlap.length} overlapping paths` };
});

await check("Temporal truth is evidence backed", async () => {
  const [claims, evidence] = await Promise.all([
    rows(`brain_claims?select=id&organization_id=eq.${org}&project_id=eq.${project}`),
    rows(`brain_claim_evidence?select=claim_id&organization_id=eq.${org}`),
  ]);
  const backed = new Set(evidence.map((row) => row.claim_id));
  const missing = claims.filter((claim) => !backed.has(claim.id));
  return claims.length >= 10 && missing.length === 0
    ? { ok: true, detail: `${claims.length} claims, all evidence backed` }
    : { ok: false, detail: `${claims.length} claims, ${missing.length} without evidence` };
});

let failed = false;
console.log("\nMF Brain isolation gate:\n");
for (const result of checks) {
  const marker = result.ok ? "✓" : "✖";
  if (!result.ok) failed = true;
  console.log(`  ${marker} ${result.name}\n      ${result.detail}`);
}
console.log(failed ? "\n✖ MF Brain isolation failed.\n" : "\n✓ MF Brain isolation passed.\n");
process.exit(failed ? 1 : 0);
