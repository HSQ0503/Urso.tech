// Apply a SQL migration to the Supabase database — this project has no Supabase
// CLI and no direct DB connection string, so migrations are otherwise pasted by
// hand into the dashboard SQL editor. This runs them via the Supabase
// Management API instead.
//
//   Run:  node scripts/apply-migration.mjs 0021
//         node scripts/apply-migration.mjs supabase/migrations/0021_quickbooks_pnl_totals.sql
//
// One-time setup: create a Personal Access Token at
//   https://supabase.com/dashboard/account/tokens
// and add it to .env.local as:
//   SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx
// (This is a personal token, NOT the service key — the service key can't run DDL.)
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

// ── env (no dependency, matches the other scripts) ───────────────────────────
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

const token = process.env.SUPABASE_ACCESS_TOKEN;
const targetArg = process.argv[2];

// Resolve the migration file FIRST, then route on the RESOLVED repo-relative
// path — routing on the raw argv string let an absolute path to a canes/urso
// migration slip through to the Woof Gang database.
const migDir = new URL("../supabase/migrations/", import.meta.url);
if (!targetArg) fail("Usage: node scripts/apply-migration.mjs <number|filename|path>   e.g. 0020");
let file;
if (targetArg.includes("/") || targetArg.endsWith(".sql")) {
  file = targetArg.startsWith("/")
    ? new URL(`file://${targetArg}`)
    : targetArg.startsWith("supabase/")
      ? new URL("../" + targetArg, import.meta.url)
      : new URL(targetArg, migDir);
} else {
  const match = readdirSync(migDir).find((f) => f.startsWith(targetArg));
  if (!match) fail(`No migration in supabase/migrations starting with '${targetArg}'.`);
  file = new URL(match, migDir);
}
const repoRoot = decodeURIComponent(new URL("../", import.meta.url).pathname);
const resolvedPath = decodeURIComponent(file.pathname);
if (!resolvedPath.startsWith(repoRoot)) fail(`Migration must live inside the repo: ${resolvedPath}`);
const relPath = resolvedPath.slice(repoRoot.length);
if (!/^supabase\/(migrations|canes|urso)\//.test(relPath)) {
  fail(`Unrecognized migration location '${relPath}' — expected supabase/migrations|canes|urso.`);
}

const isUrsoMigration = relPath.startsWith("supabase/urso/");
// Canes runs on its OWN Supabase project. Without this branch a
// supabase/canes/* path would silently apply to the Woof Gang database.
const isCanesMigration = relPath.startsWith("supabase/canes/");
const supaUrl = isUrsoMigration
  ? process.env.NEXT_PUBLIC_URSO_SUPABASE_URL
  : isCanesMigration
    ? process.env.NEXT_PUBLIC_CANES_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!token)
  fail(
    "Needs SUPABASE_ACCESS_TOKEN in .env.local.\n" +
      "  Create one at https://supabase.com/dashboard/account/tokens (personal access token, sbp_…)\n" +
      "  — this is NOT the service key; the service key can't run DDL.",
  );
if (!supaUrl) {
  fail(
    isUrsoMigration
      ? "Needs NEXT_PUBLIC_URSO_SUPABASE_URL in .env.local."
      : isCanesMigration
        ? "Needs NEXT_PUBLIC_CANES_SUPABASE_URL in .env.local."
        : "Needs NEXT_PUBLIC_SUPABASE_URL in .env.local.",
  );
}

// Project ref = the subdomain of the Supabase URL (https://<ref>.supabase.co).
const ref = new URL(supaUrl).hostname.split(".")[0];

let sql;
try {
  sql = readFileSync(file, "utf8");
} catch {
  fail(`Could not read migration file: ${file.pathname}`);
}

console.log(`\nApplying ${decodeURIComponent(file.pathname.split("/").pop())} to project ${ref} …`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  fail(`Management API returned ${res.status}: ${text.slice(0, 400)}`);
}
console.log(`✓ Applied. ${text && text !== "[]" ? "Response: " + text.slice(0, 300) : "(no rows returned — expected for DDL)"}`);

// ── Ledger ───────────────────────────────────────────────────────────────────
// Record the apply in schema_migrations so check-drift.mjs can tell "applied
// but unrecorded" from "not applied". Same Management API, second query; the
// values are inlined because the API takes raw SQL — the filename gets its
// single quotes doubled, the checksum is hex so it needs no escaping.
const filename = decodeURIComponent(file.pathname.split("/").pop());
const checksum = createHash("sha256").update(sql).digest("hex");
const ledgerSql =
  `insert into schema_migrations (filename, checksum, applied_by) ` +
  `values ('${filename.replace(/'/g, "''")}', '${checksum}', 'apply-migration.mjs') ` +
  `on conflict (filename) do update set checksum = excluded.checksum, applied_at = now(), applied_by = excluded.applied_by;`;

const ledgerRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: ledgerSql }),
});
if (ledgerRes.ok) {
  console.log(`✓ Recorded in schema_migrations (sha256 ${checksum.slice(0, 12)}…)\n`);
} else {
  // The migration itself IS applied — a ledger miss must never fail the run.
  // Most likely cause: the ledger table hasn't been created in this project
  // yet. Name its migration by scanning the dir instead of hardcoding a number
  // (canes has already grown past the number the ledger was planned under).
  const detail = (await ledgerRes.text()).slice(0, 200);
  const dir = isUrsoMigration ? "supabase/urso" : isCanesMigration ? "supabase/canes" : "supabase/migrations";
  let ledgerFile = null;
  try {
    const base = new URL(`../${dir}/`, import.meta.url);
    ledgerFile = readdirSync(base)
      .filter((f) => f.endsWith(".sql"))
      .find((f) => readFileSync(new URL(f, base), "utf8").includes("create table if not exists schema_migrations"));
  } catch {}
  console.warn(
    `⚠ Applied, but recording it in schema_migrations failed (${ledgerRes.status}): ${detail}\n` +
      `  If the ledger table doesn't exist yet, apply ${ledgerFile ? `${dir}/${ledgerFile}` : `the ${dir} schema_migrations ledger migration`},\n` +
      `  then re-run this apply so the row gets recorded.\n`,
  );
}
