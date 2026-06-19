// Purge QuickBooks SANDBOX test data so it can never be mistaken for real
// client books. Auto-detects sandbox connections (environment = 'sandbox') and
// removes their rows from quickbooks_pnl / quickbooks_pnl_totals, and
// optionally the sandbox connection itself.
//
// SAFE BY DEFAULT: dry-run unless you pass --confirm. Run this AFTER the real
// (production) company is connected, or whenever you're done sandbox testing.
//
//   Preview:  node scripts/qbo-cleanup-sandbox.mjs
//   Delete:   node scripts/qbo-cleanup-sandbox.mjs --confirm
//   Also drop the sandbox connection row:
//             node scripts/qbo-cleanup-sandbox.mjs --confirm --drop-connection
//
//   Flags: --client=woof-gang  --confirm  --drop-connection
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
const CLIENT = arg("client", "woof-gang");
const CONFIRM = !!arg("confirm", false);
const DROP_CONN = !!arg("drop-connection", false);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("✖ Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } });

// 1. find sandbox connections for this client
const { data: conns, error: cErr } = await db
  .from("quickbooks_connections")
  .select("realm_id, environment")
  .eq("client_id", CLIENT)
  .eq("environment", "sandbox");
if (cErr) {
  console.error(`✖ reading quickbooks_connections: ${cErr.message}`);
  process.exit(1);
}
const realms = [...new Set((conns ?? []).map((c) => c.realm_id))];

console.log(`\nClient '${CLIENT}' — sandbox realms found: ${realms.length ? realms.join(", ") : "(none)"}`);
if (!realms.length) {
  console.log("Nothing to clean up.\n");
  process.exit(0);
}

const count = async (table) => {
  const { count } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("client_id", CLIENT)
    .in("realm_id", realms);
  return count ?? 0;
};
const pnl = await count("quickbooks_pnl");
const totals = await count("quickbooks_pnl_totals");
console.log(`  quickbooks_pnl        : ${pnl} sandbox rows`);
console.log(`  quickbooks_pnl_totals : ${totals} sandbox rows`);
console.log(`  quickbooks_connections: ${realms.length} sandbox connection(s)${DROP_CONN ? " (will drop)" : " (kept unless --drop-connection)"}`);

if (!CONFIRM) {
  console.log(`\nDRY RUN — nothing deleted. Re-run with --confirm to delete.\n`);
  process.exit(0);
}

const del = async (table) => {
  const { error } = await db.from(table).delete().eq("client_id", CLIENT).in("realm_id", realms);
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
};
await del("quickbooks_pnl");
await del("quickbooks_pnl_totals");
if (DROP_CONN) {
  const { error } = await db
    .from("quickbooks_connections")
    .delete()
    .eq("client_id", CLIENT)
    .eq("environment", "sandbox")
    .in("realm_id", realms);
  if (error) throw new Error(`quickbooks_connections delete failed: ${error.message}`);
}
console.log(`\n✓ Deleted ${pnl + totals} P&L rows${DROP_CONN ? ` and ${realms.length} sandbox connection(s)` : ""}. Clean.\n`);
