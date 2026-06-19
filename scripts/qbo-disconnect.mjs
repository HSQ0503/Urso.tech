// Remove a QuickBooks connection (and its synced P&L) from Urso's database —
// e.g. when a company got connected under the WRONG client id. Deletes the
// quickbooks_connections row(s) for a client plus its quickbooks_pnl /
// quickbooks_pnl_totals data. SAFE BY DEFAULT: dry-run unless --confirm.
//
// This only removes Urso's stored token + data. It does NOT revoke the
// authorization on Intuit's side. To fully revoke, disconnect Urso from inside
// that QuickBooks company (gear → Apps / Connected apps → Disconnect). Simply
// re-running the connect flow for that company also issues a fresh token.
//
//   Preview:  node scripts/qbo-disconnect.mjs --client wp
//   Delete:   node scripts/qbo-disconnect.mjs --client wp --confirm
//   Narrow to one realm: node scripts/qbo-disconnect.mjs --client wp --realm 1234567890 --confirm
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const arg = (name, def) => {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return def;
  const a = process.argv[i];
  const eq = a.indexOf("=");
  if (eq !== -1) return a.slice(eq + 1); // --name=value
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true; // --name value  |  --name (flag)
};
const CLIENT = arg("client", null);
const REALM = arg("realm", null);
const CONFIRM = !!arg("confirm", false);

if (!CLIENT) {
  console.error("\n✖ --client is required, e.g.:  node scripts/qbo-disconnect.mjs --client wp\n");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("✖ Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } });

const withFilters = (q) => {
  q = q.eq("client_id", CLIENT);
  return REALM ? q.eq("realm_id", REALM) : q;
};

// Show exactly what will be removed.
const { data: conns, error: cErr } = await withFilters(
  db.from("quickbooks_connections").select("client_id, realm_id, environment, updated_at"),
);
if (cErr) {
  console.error(`✖ reading quickbooks_connections: ${cErr.message}`);
  process.exit(1);
}

console.log(`\nTarget: client_id='${CLIENT}'${REALM ? `, realm_id='${REALM}'` : ""}`);
if (!conns || !conns.length) {
  console.log("No matching connection rows found.\n");
} else {
  console.log("Connection(s) to remove:");
  for (const c of conns) console.log(`  realm ${c.realm_id}  (${c.environment})  updated ${c.updated_at}`);
}

const countOf = async (table) => {
  const { count } = await withFilters(db.from(table).select("*", { count: "exact", head: true }));
  return count ?? 0;
};
const pnl = await countOf("quickbooks_pnl");
const totals = await countOf("quickbooks_pnl_totals");
console.log(`  quickbooks_pnl        : ${pnl} rows`);
console.log(`  quickbooks_pnl_totals : ${totals} rows`);

if (!CONFIRM) {
  console.log(`\nDRY RUN — nothing deleted. Re-run with --confirm to delete.\n`);
  process.exit(0);
}

const del = async (table) => {
  const { error } = await withFilters(db.from(table).delete());
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
};
await del("quickbooks_pnl");
await del("quickbooks_pnl_totals");
await del("quickbooks_connections");
console.log(`\n✓ Removed connection + ${pnl + totals} P&L rows for client '${CLIENT}'${REALM ? ` / realm ${REALM}` : ""}.\n`);
