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
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!token)
  fail(
    "Needs SUPABASE_ACCESS_TOKEN in .env.local.\n" +
      "  Create one at https://supabase.com/dashboard/account/tokens (personal access token, sbp_…)\n" +
      "  — this is NOT the service key; the service key can't run DDL.",
  );
if (!supaUrl) fail("Needs NEXT_PUBLIC_SUPABASE_URL in .env.local.");

// Project ref = the subdomain of the Supabase URL (https://<ref>.supabase.co).
const ref = new URL(supaUrl).hostname.split(".")[0];

// Resolve the migration file from a number ("0020"), a filename, or a path.
const which = process.argv[2];
if (!which) fail("Usage: node scripts/apply-migration.mjs <number|filename|path>   e.g. 0020");

const migDir = new URL("../supabase/migrations/", import.meta.url);
let file;
if (which.includes("/") || which.endsWith(".sql")) {
  file = which.startsWith("supabase/") ? new URL("../" + which, import.meta.url) : new URL(which, migDir);
} else {
  const match = readdirSync(migDir).find((f) => f.startsWith(which));
  if (!match) fail(`No migration in supabase/migrations starting with '${which}'.`);
  file = new URL(match, migDir);
}

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
console.log(`✓ Applied. ${text && text !== "[]" ? "Response: " + text.slice(0, 300) : "(no rows returned — expected for DDL)"}\n`);
