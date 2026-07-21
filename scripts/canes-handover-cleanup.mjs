// One-time handover cleanup for the live Canes DB (2026-07-20).
// Wipes all test transactional data before handing the platform to Sebastian,
// after writing a full JSON backup of every row it deletes.
//
//   node scripts/canes-handover-cleanup.mjs            → dry run (prints plan)
//   node scripts/canes-handover-cleanup.mjs --execute  → backup, delete, verify
//
// KEEPS: settings (all keys), crews, team_members Sebastian + Brother,
// service_catalog, storage bucket (already empty).
// DELETES: leads/contacts/addresses, estimates/jobs/invoices (+items),
// payments, messages/calls/tasks/events, square_webhook_events,
// job_* residue, invoice_rewards, calendar_events, business_expenses,
// and Han's crew-pilot rig (team member, crew account, auth user).
// RESETS: estimate/invoice number counters to 1.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const EXECUTE = process.argv.includes("--execute");
const env = Object.fromEntries(
  readFileSync("/Users/han/Desktop/Urso.tech/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_CANES_SUPABASE_URL, env.CANES_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// Han's crew-pilot test rig (verified via inventory 2026-07-20)
const PILOT_TEAM_MEMBER = "bf9b4540-c355-4491-b95b-b3f420fd3ea5";
const PILOT_AUTH_USER = "79c2a2b0";

// FK-safe order: children before parents (mirrors tour cleanup chain).
const WIPE_ORDER = [
  "payments",
  "invoice_rewards",
  "invoice_items",
  "invoices",
  "job_media",
  "job_time_entries",
  "job_activity_events",
  "job_expenses",
  "job_items",
  "jobs",
  "estimate_items",
  "estimates",
  "tasks",
  "events",
  "messages",
  "calls",
  "addresses",
  "contacts",
  "leads",
  "square_webhook_events",
  "calendar_events",
  "business_expenses",
];
const KEEP = ["settings", "crews", "team_members", "service_catalog", "crew_accounts", "crew_account_access", "estimate_counters"];

const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const count = async (t) => {
  const { count: c, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) die(`count ${t}: ${error.message}`);
  return c;
};

console.log(EXECUTE ? "== EXECUTE ==" : "== DRY RUN (pass --execute to run) ==");
const before = {};
for (const t of [...WIPE_ORDER, ...KEEP]) before[t] = await count(t);
console.log("row counts:", JSON.stringify(before));

if (!EXECUTE) {
  console.log("\nWould wipe:", WIPE_ORDER.filter((t) => before[t] > 0).join(", "));
  console.log("Would keep:", KEEP.join(", "), "(minus Han's pilot crew rig)");
  process.exit(0);
}

// ── 1. Full backup of everything we are about to delete ─────────────────────
const backup = { taken_at: new Date().toISOString(), tables: {} };
for (const t of WIPE_ORDER) {
  if (before[t] === 0) continue;
  const { data, error } = await db.from(t).select("*");
  if (error) die(`backup ${t}: ${error.message}`);
  backup.tables[t] = data;
}
for (const t of ["crew_accounts", "crew_account_access"]) {
  const { data } = await db.from(t).select("*");
  backup.tables[t] = data;
}
const { data: pilotMember } = await db.from("team_members").select("*").eq("id", PILOT_TEAM_MEMBER);
backup.tables.team_members_pilot = pilotMember;
const backupJson = JSON.stringify(backup, null, 2);
const backupPath = "/Users/han/Research Vault/Projects/Urso/06 - Canes Pressure Washing/Handover DB backup 2026-07-20.json";
if (existsSync(backupPath)) {
  // Never clobber the pre-wipe snapshot on a re-run against a now-empty DB.
  console.log(`backup already exists, keeping it: ${backupPath}`);
} else {
  writeFileSync(backupPath, backupJson);
  console.log(`backup written: ${backupPath} (${(backupJson.length / 1024).toFixed(1)} KB)`);
}

// ── 2. Wipe transactional tables ─────────────────────────────────────────────
// PostgREST requires a filter on delete; every table keys on `id` except
// square_webhook_events (event_id).
const KEY_COL = { square_webhook_events: "event_id" };
for (const t of WIPE_ORDER) {
  if (before[t] === 0) continue;
  const { error } = await db.from(t).delete().not(KEY_COL[t] ?? "id", "is", null);
  if (error) die(`wipe ${t}: ${error.message}`);
  console.log(`wiped ${t} (${before[t]})`);
}

// ── 3. Remove Han's crew-pilot rig ───────────────────────────────────────────
// crew_account_access cascades from crew_accounts, so one delete covers both.
{
  const { error } = await db.from("crew_accounts").delete().eq("team_member_id", PILOT_TEAM_MEMBER);
  if (error) die(`crew_accounts: ${error.message}`);
}
{
  const { error } = await db.from("team_members").delete().eq("id", PILOT_TEAM_MEMBER);
  if (error) die(`team_members: ${error.message}`);
}
const { data: users } = await db.auth.admin.listUsers({ perPage: 100 });
for (const u of users?.users ?? []) {
  if (u.id.startsWith(PILOT_AUTH_USER)) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) die(`auth delete: ${error.message}`);
    console.log(`deleted auth user ${u.email}`);
  }
}

// ── 4. Reset document number counters ────────────────────────────────────────
for (const id of ["estimate", "invoice"]) {
  const { error } = await db.from("estimate_counters").update({ next_value: 1 }).eq("id", id);
  if (error) die(`counter ${id}: ${error.message}`);
}
console.log("counters reset to 1");

// ── 5. Verify ────────────────────────────────────────────────────────────────
console.log("\n== verification ==");
let ok = true;
for (const t of WIPE_ORDER) {
  const c = await count(t);
  if (c !== 0) { ok = false; console.log(`RESIDUE ${t}: ${c}`); }
}
const keepCounts = {};
for (const t of KEEP) keepCounts[t] = await count(t);
console.log("kept:", JSON.stringify(keepCounts));
const { data: settingsKeys } = await db.from("settings").select("key");
console.log("settings keys:", settingsKeys.length);
const { data: members } = await db.from("team_members").select("name, active");
console.log("team_members:", JSON.stringify(members));
const { data: counters } = await db.from("estimate_counters").select("*");
console.log("counters:", JSON.stringify(counters));
const { data: postUsers } = await db.auth.admin.listUsers({ perPage: 100 });
console.log("auth users left:", (postUsers?.users ?? []).length);
console.log(ok ? "\nPASS — transactional tables empty, config intact" : "\nFAIL — residue found");
process.exit(ok ? 0 : 1);
