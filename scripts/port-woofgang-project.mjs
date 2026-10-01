// Selectively move the Woof Gang dashboard out of the shared Supabase project.
//
// The source project also hosts an unrelated education product. A normal
// Supabase backup/restore would copy that product too, so this script applies
// only the repo-owned Woof Gang migrations and copies only Woof Gang rows.
// The source is read-only for every mode.
//
//   Audit only:    node scripts/port-woofgang-project.mjs --target "WoofGang Data portover"
//   Initial copy:  node scripts/port-woofgang-project.mjs --target "WoofGang Data portover" --execute
//   Final sync:    node scripts/port-woofgang-project.mjs --target "WoofGang Data portover" --resume
//
// Requires a valid SUPABASE_ACCESS_TOKEN (sbp_...) in .env.local. The token is
// used to identify the target, apply SQL migrations, and preserve the eight
// dashboard Auth users (IDs + password hashes). Project API keys are read into
// memory from the Management API and are never printed or written to disk.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of ["../.env.local", "../.env"]) {
  try {
    const contents = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of contents.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {}
}

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const resume = args.includes("--resume");
const targetIndex = args.indexOf("--target");
const targetSelector = targetIndex >= 0 ? args[targetIndex + 1] : "WoofGang Data portover";
const startIndex = args.indexOf("--start-at");
const startAt = startIndex >= 0 ? args[startIndex + 1] : null;
const PAGE_SIZE = 500;
const CLIENT_SLUG = "woof-gang";
// QuickBooks predates the canonical tenant slug. These keys are the four Woof
// Gang stores plus the shared Windermere/Lakeside realm; copying by slug would
// silently drop the entire finance history.
const QBO_CLIENT_IDS = ["wp", "wg", "wm", "lv", "wm-lv"];
const SKIPPED_MIGRATIONS = new Set(["0005_twilio_missed_calls.sql"]);

if (execute && resume) throw new Error("Choose --execute for the initial copy or --resume for the final sync, not both.");
if (!targetSelector || targetSelector.startsWith("--")) throw new Error("--target needs a project name or project ref.");
if (startAt?.startsWith("--")) throw new Error("--start-at needs a table name.");

const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sourceKey = process.env.SUPABASE_SECRET_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!sourceUrl || !sourceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.");

const sourceRef = new URL(sourceUrl).hostname.split(".")[0];
const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const COPY_TABLES = [
  { name: "clients", scope: "client-row", primaryKey: ["id"] },
  { name: "stores", scope: "uuid-client", primaryKey: ["id"] },
  { name: "metrics_daily", scope: "uuid-client", primaryKey: ["store_id", "date"] },
  { name: "groomers", scope: "uuid-client", primaryKey: ["id"] },
  { name: "customers", scope: "uuid-client", primaryKey: ["id"] },
  { name: "reviews", scope: "uuid-client", primaryKey: ["id"] },
  { name: "store_listings", scope: "uuid-client", primaryKey: ["store_id"] },
  { name: "calls", scope: "uuid-client", primaryKey: ["id"] },
  { name: "agent_actions", scope: "uuid-client", primaryKey: ["id"] },
  { name: "quickbooks_connections", scope: "qbo-client", primaryKey: ["client_id", "realm_id"] },
  { name: "franpos_orders", scope: "uuid-client", primaryKey: ["order_id"], omit: ["order_date"] },
  { name: "franpos_order_items", scope: "uuid-client", primaryKey: ["order_item_id"], omit: ["item_date"] },
  { name: "product_sales_daily", scope: "uuid-client", primaryKey: ["store_id", "date", "sku"] },
  { name: "groomer_sales_daily", scope: "uuid-client", primaryKey: ["store_id", "date", "name"] },
  { name: "cohort_monthly", scope: "uuid-client", primaryKey: ["store_id", "month_offset"] },
  { name: "grooming_gap_buckets", scope: "uuid-client", primaryKey: ["store_id", "bucket"] },
  { name: "quickbooks_pnl", scope: "qbo-client", primaryKey: ["client_id", "realm_id", "month", "section", "account", "accounting_method"] },
  { name: "staff", scope: "uuid-client", primaryKey: ["client_id", "name_key"] },
  { name: "ai_briefs", scope: "uuid-client", primaryKey: ["client_id", "scope", "week_start"] },
  { name: "business_events", scope: "uuid-client", primaryKey: ["id"] },
  { name: "quickbooks_pnl_totals", scope: "qbo-client", primaryKey: ["client_id", "realm_id", "month", "label", "accounting_method"] },
  { name: "analyst_threads", scope: "slug-client", primaryKey: ["id"] },
  { name: "analyst_messages", scope: "thread", primaryKey: ["id"] },
  { name: "analyst_memory", scope: "slug-client", primaryKey: ["user_id"] },
  { name: "app_users", scope: "auth-user", primaryKey: ["user_id"] },
  { name: "action_events", scope: "uuid-client", primaryKey: ["id"] },
];

const managementHeaders = () => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

async function management(path, init = {}) {
  if (!accessToken?.startsWith("sbp_")) {
    throw new Error("SUPABASE_ACCESS_TOKEN is not a valid personal access token (expected sbp_...).");
  }
  const response = await fetch(`https://api.supabase.com/v1${path}`, {
    ...init,
    headers: { ...managementHeaders(), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function sql(projectRef, query) {
  return management(`/projects/${projectRef}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function applyScope(query, scope, context) {
  if (scope === "client-row") return query.eq("slug", CLIENT_SLUG);
  if (scope === "uuid-client") return query.eq("client_id", context.clientId);
  if (scope === "slug-client") return query.eq("client_id", CLIENT_SLUG);
  if (scope === "qbo-client") return query.in("client_id", QBO_CLIENT_IDS);
  if (scope === "thread") return query.in("thread_id", context.threadIds);
  if (scope === "auth-user") return query.in("user_id", context.authUserIds);
  return query;
}

async function sourceContext() {
  const { data: clients, error: clientError } = await source
    .from("clients")
    .select("id,slug,name")
    .eq("slug", CLIENT_SLUG);
  if (clientError) throw clientError;
  if (clients.length !== 1) throw new Error(`Expected one '${CLIENT_SLUG}' client row; found ${clients.length}.`);

  const { data: memberships, error: membershipError } = await source
    .from("app_users")
    .select("user_id")
    .or(`client_id.eq.${clients[0].id},client_id.is.null`);
  if (membershipError) throw membershipError;

  const { data: threads, error: threadError } = await source
    .from("analyst_threads")
    .select("id")
    .eq("client_id", CLIENT_SLUG);
  if (threadError) throw threadError;

  return {
    clientId: clients[0].id,
    authUserIds: memberships.map(({ user_id }) => user_id),
    threadIds: threads.map(({ id }) => id),
  };
}

async function exactCount(client, table, scope, context) {
  let query = client.from(table).select("*", { count: "exact", head: true });
  query = applyScope(query, scope, context);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function auditSource(context) {
  console.log(`\nSource ${sourceRef} (read-only)`);
  let total = 0;
  for (const table of COPY_TABLES) {
    if ((table.scope === "thread" && !context.threadIds.length) || (table.scope === "auth-user" && !context.authUserIds.length)) {
      console.log(`  ${table.name.padEnd(27)} 0`);
      continue;
    }
    const count = await exactCount(source, table.name, table.scope, context);
    total += count;
    console.log(`  ${table.name.padEnd(27)} ${count.toLocaleString()}`);
  }

  const { data: users, error: authError } = await source.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw authError;
  const selected = new Set(context.authUserIds);
  const unrelatedAuth = users.users.filter(({ id }) => !selected.has(id)).length;
  console.log(`  ${"auth.users".padEnd(27)} ${selected.size.toLocaleString()} selected; ${unrelatedAuth} excluded`);

  const { data: buckets, error: bucketError } = await source.storage.listBuckets();
  if (bucketError) throw bucketError;
  console.log(`\n  Selected public rows: ${total.toLocaleString()}`);
  console.log("  Explicitly excluded: discovery_submissions, schema_migrations, every non-repo education table");
  console.log(`  Storage excluded: ${buckets.map(({ name }) => name).join(", ") || "none"}`);
}

async function resolveTarget() {
  const projects = await management("/projects");
  const normalized = targetSelector.trim().toLowerCase();
  const matches = projects.filter(({ id, name }) => id === targetSelector || name.trim().toLowerCase() === normalized);
  if (matches.length !== 1) throw new Error(`Expected one target matching '${targetSelector}'; found ${matches.length}.`);
  const targetProject = matches[0];
  if (targetProject.id === sourceRef) throw new Error("Target resolves to the source project; refusing to continue.");

  const keys = await management(`/projects/${targetProject.id}/api-keys`);
  // Some newly created projects expose an inactive default `secret` key for a
  // short window (the API returns it, but PostgREST rejects it as invalid).
  // The legacy service_role JWT is immediately active and has the same
  // server-only privileges, so prefer it for the migration transport.
  const secret = keys.find(({ name }) => name === "service_role")?.api_key
    ?? keys.find(({ type }) => type === "secret")?.api_key;
  if (!secret) throw new Error("Could not find the target project's secret/service-role key.");

  const url = `https://${targetProject.id}.supabase.co`;
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return { ...targetProject, url, client };
}

async function targetAuthCount(targetRef) {
  const rows = await sql(targetRef, "select count(*)::int as count from auth.users");
  return Number(rows[0]?.count ?? 0);
}

async function applyMigrations(targetRef) {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  for (const filename of files) {
    if (SKIPPED_MIGRATIONS.has(filename)) {
      console.log(`  skip ${filename} (pending by design)`);
      continue;
    }
    const migration = readFileSync(new URL(filename, directory), "utf8");
    process.stdout.write(`  apply ${filename} ... `);
    await sql(targetRef, migration);
    console.log("done");
  }

  for (const filename of files.filter((name) => !SKIPPED_MIGRATIONS.has(name))) {
    const migration = readFileSync(new URL(filename, directory), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    await sql(
      targetRef,
      `insert into public.schema_migrations (filename, checksum, applied_by) values (${quote(filename)}, ${quote(checksum)}, 'port-woofgang-project.mjs') on conflict (filename) do update set checksum = excluded.checksum, applied_at = now(), applied_by = excluded.applied_by`,
    );
  }
}

async function resetTargetPublicData(targetRef) {
  const tables = [...COPY_TABLES].reverse().map(({ name }) => `public.${name}`).join(", ");
  await sql(targetRef, `truncate table ${tables} restart identity cascade`);
}

async function writableColumns(targetRef, table) {
  const rows = await sql(
    targetRef,
    `select column_name from information_schema.columns where table_schema = 'auth' and table_name = ${quote(table)} and is_generated = 'NEVER' and is_identity = 'NO' order by ordinal_position`,
  );
  return rows.map(({ column_name }) => column_name);
}

async function copyAuthUsers(targetRef, context) {
  const ids = context.authUserIds.map(quote).join(", ");
  const tables = [
    { name: "users", where: `id in (${ids})` },
    { name: "identities", where: `user_id in (${ids})` },
  ];

  for (const table of tables) {
    const sourceRows = await sql(sourceRef, `select row_to_json(t)::jsonb as row from auth.${table.name} t where ${table.where}`);
    const records = sourceRows.map(({ row }) => row);
    if (!records.length) {
      console.log(`  auth.${table.name}: 0`);
      continue;
    }
    const columns = await writableColumns(targetRef, table.name);
    const list = columns.map((column) => `"${column}"`).join(", ");
    const json = quote(JSON.stringify(records));
    await sql(
      targetRef,
      `insert into auth.${table.name} (${list}) select ${list} from jsonb_populate_recordset(null::auth.${table.name}, ${json}::jsonb)`,
    );
    console.log(`  auth.${table.name}: ${records.length}`);
  }
}

async function copyTable(target, table, context) {
  if ((table.scope === "thread" && !context.threadIds.length) || (table.scope === "auth-user" && !context.authUserIds.length)) {
    console.log(`  ${table.name}: 0`);
    return;
  }

  let offset = 0;
  let copied = 0;
  const select = table.omit?.length
    ? Object.keys((await source.from(table.name).select("*").limit(1)).data?.[0] ?? {})
        .filter((column) => !table.omit.includes(column))
        .join(",")
    : "*";
  if (!select) throw new Error(`${table.name}: could not resolve columns for generated-column-safe copy.`);
  while (true) {
    let query = source.from(table.name).select(select).range(offset, offset + PAGE_SIZE - 1);
    query = applyScope(query, table.scope, context);
    for (const column of table.primaryKey) query = query.order(column, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(`${table.name} source read failed: ${error.message}`);
    if (!data.length) break;

    const { error: writeError } = await target.client.from(table.name).upsert(data);
    if (writeError) throw new Error(`${table.name} target write failed at offset ${offset}: ${writeError.message}`);
    copied += data.length;
    offset += data.length;
    process.stdout.write(`\r  ${table.name}: ${copied.toLocaleString()}`);
    if (data.length < PAGE_SIZE) break;
  }
  process.stdout.write(`\r  ${table.name}: ${copied.toLocaleString()}\n`);
}

async function verify(target, context) {
  console.log("\nVerification");
  let mismatch = false;
  for (const table of COPY_TABLES) {
    if ((table.scope === "thread" && !context.threadIds.length) || (table.scope === "auth-user" && !context.authUserIds.length)) continue;
    const [sourceCount, targetCount] = await Promise.all([
      exactCount(source, table.name, table.scope, context),
      exactCount(target.client, table.name, table.scope, context),
    ]);
    const ok = sourceCount === targetCount;
    mismatch ||= !ok;
    console.log(`  ${ok ? "✓" : "✖"} ${table.name.padEnd(27)} source ${sourceCount.toLocaleString()} / target ${targetCount.toLocaleString()}`);
  }
  const authCount = await targetAuthCount(target.id);
  const authOk = authCount === context.authUserIds.length;
  mismatch ||= !authOk;
  console.log(`  ${authOk ? "✓" : "✖"} ${"auth.users".padEnd(27)} source ${context.authUserIds.length} / target ${authCount}`);
  if (mismatch) throw new Error("Verification found count mismatches. Run again with --resume after source writes are paused.");
}

const context = await sourceContext();
await auditSource(context);

let target;
try {
  target = await resolveTarget();
} catch (error) {
  if (!execute && !resume) {
    console.log(`\nTarget audit unavailable: ${error instanceof Error ? error.message : String(error)}`);
    console.log("Replace SUPABASE_ACCESS_TOKEN with a valid sbp_... personal access token, then rerun this command.");
    process.exit(0);
  }
  throw error;
}

console.log(`\nTarget ${target.name} (${target.id}, ${target.region}, ${target.status})`);
if (target.region?.includes("west")) {
  console.log("  ⚠ Target is in a western region; Orlando users and an eastern Vercel deployment will have higher database latency.");
}

const authBefore = await targetAuthCount(target.id);
console.log(`  auth users currently: ${authBefore}`);

if (!execute && !resume) {
  console.log("\nAudit complete. Nothing was changed. Use --execute for the initial copy.");
  process.exit(0);
}

if (execute) {
  if (authBefore !== 0) throw new Error(`Initial copy requires an empty target Auth schema; found ${authBefore} users.`);
  console.log("\nApplying Woof Gang schema");
  await applyMigrations(target.id);
  await resetTargetPublicData(target.id);
  console.log("\nCopying Auth users (sessions intentionally excluded)");
  await copyAuthUsers(target.id, context);
} else {
  const targetUserRows = await sql(target.id, "select id::text from auth.users order by id");
  const targetIds = targetUserRows.map(({ id }) => id).sort();
  const sourceIds = [...context.authUserIds].sort();
  if (JSON.stringify(targetIds) !== JSON.stringify(sourceIds)) {
    throw new Error("--resume requires the target Auth user IDs to match the source exactly.");
  }
}

console.log("\nCopying Woof Gang public data");
const copyStart = startAt ? COPY_TABLES.findIndex(({ name }) => name === startAt) : 0;
if (copyStart < 0) throw new Error(`Unknown --start-at table '${startAt}'.`);
for (const table of COPY_TABLES.slice(copyStart)) await copyTable(target, table, context);
await verify(target, context);

console.log("\n✓ Selective Woof Gang copy complete.");
console.log("  Source was not modified. The education tables and figures Storage bucket remain only in the source project.");
console.log("  Next: switch the web/mobile/Vercel Supabase URL + keys, test login and dashboards, then run --resume once more at cutover.");
