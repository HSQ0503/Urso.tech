// Read-only presenter preflight for the MF pilot-decision demo.
// It verifies the database, governed truth, context registry, Harness contract,
// role access, and provider configuration without spending model tokens.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createDecipheriv, createHash } from "node:crypto";
import { createMfHarnessSnapshot, getMfRoleWorkspace, transitionMfHarness } from "../lib/mf-demo/harness-runtime.mjs";
import { mfScenarioManifest } from "../lib/mf-demo/manifest.mjs";

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
const key = process.env.URSO_SUPABASE_SECRET_KEY;
const org = "minerbo-fuchs-demo";
const project = mfScenarioManifest.project.id;
const checks = [];

function record(level, name, detail) {
  checks.push({ level, name, detail });
}

async function gate(name, operation, { warning = false } = {}) {
  try {
    const result = await operation();
    record(result.ok ? "PASS" : warning ? "WARN" : "FAIL", name, result.detail);
  } catch (error) {
    record(warning ? "WARN" : "FAIL", name, error instanceof Error ? error.message : String(error));
  }
}

async function rows(table, params = {}) {
  const endpoint = new URL(`/rest/v1/${table}`, url);
  for (const [name, value] of Object.entries(params)) endpoint.searchParams.set(name, value);
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${(await response.text()).slice(0, 180)}`);
  return response.json();
}

await gate("Runtime credentials", async () => ({
  ok: Boolean(url && key),
  detail: url && key ? "Supabase URL and server credential are available" : "Missing NEXT_PUBLIC_URSO_SUPABASE_URL or URSO_SUPABASE_SECRET_KEY",
}));

if (url && key) {
  await gate("Isolated MF project", async () => {
    const [organizations, projects] = await Promise.all([
      rows("brain_organizations", { select: "id", id: `eq.${org}` }),
      rows("brain_projects", { select: "id", organization_id: `eq.${org}`, id: `eq.${project}` }),
    ]);
    return {
      ok: organizations.length === 1 && projects.length === 1,
      detail: organizations.length === 1 && projects.length === 1 ? `${org}/${project}` : "Organization or project is missing",
    };
  });

  await gate("Discipline and persona registry", async () => {
    const [departments, memberships, projectMemberships] = await Promise.all([
      rows("brain_departments", { select: "id", organization_id: `eq.${org}` }),
      rows("brain_memberships", { select: "user_id", organization_id: `eq.${org}`, user_id: "like.mf-demo:*", active: "eq.true" }),
      rows("brain_project_memberships", { select: "user_id", organization_id: `eq.${org}`, project_id: `eq.${project}`, active: "eq.true" }),
    ]);
    const authorized = new Set(projectMemberships.map((item) => item.user_id));
    const missing = memberships.filter((item) => !authorized.has(item.user_id));
    return {
      ok: departments.length === 15 && memberships.length === 5 && missing.length === 0,
      detail: `${departments.length}/15 disciplines, ${memberships.length}/5 personas, ${missing.length} missing project grants`,
    };
  });

  let documents = [];
  await gate("Project context corpus", async () => {
    documents = await rows("brain_docs", {
      select: "id,path,current_version",
      organization_id: `eq.${org}`,
      deleted_at: "is.null",
    });
    return { ok: documents.length === 39, detail: `${documents.length}/39 controlled MF + project documents` };
  });

  await gate("Current searchable context", async () => {
    if (documents.length === 0) return { ok: false, detail: "No current documents available" };
    const chunks = await rows("brain_doc_chunks", {
      select: "doc_id,version",
      organization_id: `eq.${org}`,
      doc_id: `in.(${documents.map((item) => item.id).join(",")})`,
      embedding: "not.is.null",
    });
    const versions = new Map(documents.map((item) => [item.id, item.current_version]));
    const currentChunks = chunks.filter((item) => versions.get(item.doc_id) === item.version);
    const covered = new Set(currentChunks.map((item) => item.doc_id));
    return {
      ok: covered.size === documents.length && currentChunks.length >= documents.length,
      detail: `${currentChunks.length} embedded current-version chunks across ${covered.size}/${documents.length} documents`,
    };
  });

  await gate("Connected-source evidence registry", async () => {
    const corpusNames = new Set(documents.map((item) => basename(item.path).toLocaleLowerCase()));
    const evidencePaths = mfScenarioManifest.sources.flatMap((source) => source.evidencePaths);
    const missing = evidencePaths.filter((path) => !corpusNames.has(basename(path).toLocaleLowerCase()));
    return {
      ok: missing.length === 0,
      detail: missing.length === 0
        ? `${mfScenarioManifest.sources.length} sources resolve to ${evidencePaths.length} controlled evidence references`
        : `${missing.length}/${evidencePaths.length} evidence references unresolved: ${missing.map((path) => basename(path)).join(", ")}`,
    };
  });

  await gate("Canonical Revision B/C truth", async () => {
    const ids = {
      revisionB: "d2000000-0000-4000-8000-000000000001",
      electricalB: "d2000000-0000-4000-8000-000000000002",
      chilledWaterB: "d2000000-0000-4000-8000-000000000003",
      operatingLoadB: "d2000000-0000-4000-8000-000000000004",
      revisionC: "d2000000-0000-4000-8000-000000000011",
      electricalC: "d2000000-0000-4000-8000-000000000012",
      chilledWaterC: "d2000000-0000-4000-8000-000000000013",
      operatingLoadC: "d2000000-0000-4000-8000-000000000014",
      decision: "d2000000-0000-4000-8000-000000000021",
    };
    const claims = await rows("brain_claims", {
      select: "id,object_value,lifecycle,resolution",
      organization_id: `eq.${org}`,
      project_id: `eq.${project}`,
      id: `in.(${Object.values(ids).join(",")})`,
    });
    const byId = new Map(claims.map((claim) => [claim.id, claim]));
    const expected = [
      [ids.revisionB, "Revision B"], [ids.electricalB, 420], [ids.chilledWaterB, 118], [ids.operatingLoadB, 146],
      [ids.revisionC, "Revision C"], [ids.electricalC, 483], [ids.chilledWaterC, 139], [ids.operatingLoadC, 168],
    ];
    const mismatches = expected.filter(([id, value]) => String(byId.get(id)?.object_value) !== String(value));
    const decision = byId.get(ids.decision);
    const coherentState = decision?.object_value === "pending" || decision?.object_value === "approved";
    return {
      ok: claims.length === Object.keys(ids).length && mismatches.length === 0 && coherentState,
      detail: mismatches.length === 0
        ? `Rev B 420/118/146; Rev C 483/139/168; DEC-042 ${decision?.object_value ?? "missing"}`
        : `${mismatches.length} canonical claim values do not match the demo contract`,
    };
  });

  await gate("Brain provider availability", async () => {
    const providers = await rows("brain_org_keys", { select: "provider,key_ciphertext", organization_id: `eq.${org}` });
    const secret = process.env.BRAIN_KEYS_SECRET;
    const usable = secret && secret.length >= 16
      ? providers.filter((provider) => {
        try {
          const [version, iv, tag, data] = provider.key_ciphertext.split(":");
          if (version !== "v1" || !iv || !tag || !data) return false;
          const decipher = createDecipheriv(
            "aes-256-gcm",
            createHash("sha256").update(secret).digest(),
            Buffer.from(iv, "base64"),
          );
          decipher.setAuthTag(Buffer.from(tag, "base64"));
          Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
          return true;
        } catch {
          return false;
        }
      })
      : [];
    return {
      ok: usable.length > 0,
      detail: usable.length > 0
        ? `${usable.length}/${providers.length} encrypted provider configuration(s) decrypt with the active server secret`
        : providers.length > 0
          ? `${providers.length} provider row(s) exist, but none decrypt with the active BRAIN_KEYS_SECRET`
          : "No MF Brain provider key configured",
    };
  });
}

await gate("Harness objective contract", async () => {
  const baseline = createMfHarnessSnapshot(0);
  const approved = transitionMfHarness(baseline, 3, "preflight-approve", "project-manager");
  const rewound = transitionMfHarness(approved, 2, "preflight-rewind", "project-manager");
  const roleWorkspaces = mfScenarioManifest.roles.map((role) => getMfRoleWorkspace(approved, role.id));
  const completeRoles = roleWorkspaces.every((workspace) => workspace.role && workspace.objective && workspace.tasks.length > 0);
  return {
    ok: approved.truth.currentRevision === "C" && rewound.truth.currentRevision === "B" && completeRoles,
    detail: completeRoles
      ? `${roleWorkspaces.length}/5 role workspaces; Rev B -> Rev C -> Rev B is reversible`
      : "One or more role workspaces lack an objective or work packet",
  };
});

console.log("\nMF pilot demo preflight:\n");
for (const check of checks) console.log(`  [${check.level}] ${check.name}\n         ${check.detail}`);
const failures = checks.filter((check) => check.level === "FAIL").length;
const warnings = checks.filter((check) => check.level === "WARN").length;
console.log(failures === 0
  ? `\n[READY] ${checks.length - warnings}/${checks.length} gates passed${warnings ? ` with ${warnings} warning(s)` : ""}.\n`
  : `\n[BLOCKED] ${failures} required gate(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
