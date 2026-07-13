// Data-layer test for the tour practice sandbox against the REAL Canes DB.
// 1. Snapshot row counts on every table the practice can touch.
// 2. Seed a full synthetic practice graph (superset of what the guided flow
//    creates): lead, message, muzzle tasks, contact+address, estimate+items,
//    job+items+expense, invoice+items, payment, automation tasks.
// 3. Run the cleanup chain (line-for-line port of cleanupPractice).
// 4. Assert: zero practice residue AND post counts == pre counts (no
//    collateral damage to real rows).
// Uses the fictional practice phone; never touches rows it didn't create.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load env from .env.local (names verified earlier; values never printed).
const env = Object.fromEntries(
  readFileSync("/Users/han/Desktop/Urso.tech/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_CANES_SUPABASE_URL, env.CANES_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PHONE = "+15615550188";
const KEY = "tour_practice";
const TABLES = [
  "leads", "contacts", "addresses", "messages", "calls", "events", "tasks",
  "estimates", "estimate_items", "jobs", "job_items", "job_expenses",
  "invoices", "invoice_items", "payments", "settings",
];

const die = (msg) => { console.error("FAIL:", msg); process.exit(1); };
const counts = async () => {
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    if (error) die(`count ${t}: ${error.message}`);
    out[t] = count;
  }
  return out;
};
const ins = async (table, row) => {
  const { data, error } = await db.from(table).insert(row).select("id").single();
  if (error) die(`insert ${table}: ${error.message}`);
  return data.id;
};

console.log("— pre-flight: no practice rows may already exist");
const { data: pre } = await db.from("leads").select("id").eq("phone", PHONE);
if ((pre ?? []).length) die("practice lead already exists — clean up manually first");

const before = await counts();
console.log("— snapshot taken; seeding synthetic graph");

const leadId = await ins("leads", {
  type: "cold", status: "new", name: "Jamie Rivera (Practice)", phone: PHONE,
  address: "482 Practice Palm Ln, West Palm Beach", service: "Driveway + pool deck cleaning",
  source: "other", raw_message: "test", notes: "cleanup test",
});
await ins("messages", { lead_id: leadId, peer_phone: PHONE, direction: "in", body: "hi", automated: false });
await ins("events", { lead_id: leadId, kind: "created", detail: "test" });
for (const [kind, key] of [
  ["cold_escalation", `cold_esc:${leadId}:1`], ["cold_escalation", `cold_esc:${leadId}:2`],
  ["follow_up", `follow_up:${leadId}:d1`], ["follow_up", `follow_up:${leadId}:d3`], ["follow_up", `follow_up:${leadId}:d7`],
]) await ins("tasks", { lead_id: leadId, kind, dedupe_key: key, status: "canceled", payload: { practice: true } });
const future = new Date(Date.now() + 2 * 3600_000).toISOString();
await ins("tasks", { lead_id: leadId, kind: "confirmation", dedupe_key: `confirmation:${leadId}:test`, status: "pending", scheduled_for: future, payload: {} });

const contactId = await ins("contacts", { name: "Jamie Rivera (Practice)", phone: PHONE, source: "other" });
await ins("addresses", { contact_id: contactId, line: "482 Practice Palm Ln, West Palm Beach", is_primary: true });

const estId = await ins("estimates", {
  lead_id: leadId, contact_id: contactId, number: `EST-TEST-${leadId.slice(0, 8)}`,
  status: "approved", estimate_type: "standard", customer_name: "Jamie Rivera (Practice)",
  customer_phone: PHONE, public_token: `test-${leadId}`, subtotal_cents: 45000, total_cents: 45000,
});
await ins("estimate_items", {
  estimate_id: estId, name: "Driveway", quantity: 1, unit_price_cents: 45000, line_total_cents: 45000, position: 0,
});
await ins("tasks", { lead_id: leadId, kind: "estimate_reminder", dedupe_key: `estimate_reminder:${estId}:d2`, status: "pending", scheduled_for: future, payload: { estimate_id: estId } });

const jobId = await ins("jobs", {
  lead_id: leadId, contact_id: contactId, estimate_id: estId, status: "completed",
  customer_name: "Jamie Rivera (Practice)", customer_phone: PHONE, job_name: "Driveway",
  total_cents: 45000, scheduled_at: new Date().toISOString(), duration_minutes: 120,
});
await ins("job_items", { job_id: jobId, name: "Driveway", quantity: 1, line_total_cents: 45000, position: 0 });
await ins("job_expenses", { job_id: jobId, category: "Gas / travel", amount_cents: 3000 });
await ins("tasks", { lead_id: leadId, kind: "job_confirmation", dedupe_key: `job_confirmation:${jobId}:test`, status: "pending", scheduled_for: future, payload: { job_id: jobId } });

const invId = await ins("invoices", {
  lead_id: leadId, contact_id: contactId, estimate_id: estId, job_id: jobId,
  number: `INV-TEST-${leadId.slice(0, 8)}`, status: "paid", customer_name: "Jamie Rivera (Practice)",
  customer_phone: PHONE, public_token: `test-inv-${leadId}`, subtotal_cents: 45000,
  total_cents: 45000, amount_paid_cents: 45000,
});
await ins("invoice_items", { invoice_id: invId, name: "Driveway", quantity: 1, unit_price_cents: 45000, line_total_cents: 45000, position: 0 });
await ins("payments", { invoice_id: invId, job_id: jobId, method: "cash", source: "manual", status: "completed", amount_cents: 45000 });
await ins("tasks", { lead_id: leadId, kind: "invoice_reminder", dedupe_key: `invoice_reminder:${invId}:d3`, status: "pending", scheduled_for: future, payload: { invoice_id: invId } });

await db.from("settings").upsert(
  { key: KEY, value: { lead_id: leadId, phone: PHONE, seeded_at: new Date().toISOString() } },
  { onConflict: "key" },
);
console.log("— seeded:", { leadId, contactId, estId, jobId, invId });

// ── cleanup: line-for-line port of cleanupPractice (practice.ts) ─────────────
console.log("— running cleanup chain");
const ids = (rows) => (rows ?? []).map((r) => r.id);
const errors = [];
const run = async (label, q) => { const { error } = await q; if (error) errors.push(`${label}: ${error.message}`); };

const { data: st } = await db.from("settings").select("value").eq("key", KEY).maybeSingle();
const { data: byPhone } = await db.from("leads").select("id").eq("phone", PHONE).maybeSingle();
const rootLead = st?.value?.lead_id ?? byPhone?.id ?? null;
const { data: cts } = await db.from("contacts").select("id").eq("phone", PHONE);
const contactIds = ids(cts);

const resolve = async (table, conds) => {
  if (conds.length === 0) return [];
  const { data, error } = await db.from(table).select("id").or(conds.join(","));
  if (error) { errors.push(`resolve ${table}: ${error.message}`); return []; }
  return ids(data);
};
const roots = (extra = []) => [
  ...(rootLead ? [`lead_id.eq.${rootLead}`] : []),
  ...(contactIds.length ? [`contact_id.in.(${contactIds.join(",")})`] : []),
  ...extra,
];
const estIds = await resolve("estimates", roots());
const jobIds = await resolve("jobs", roots(estIds.length ? [`estimate_id.in.(${estIds.join(",")})`] : []));
const invIds = await resolve("invoices", roots([
  ...(jobIds.length ? [`job_id.in.(${jobIds.join(",")})`] : []),
  ...(estIds.length ? [`estimate_id.in.(${estIds.join(",")})`] : []),
]));
console.log("— resolved:", { estIds: estIds.length, jobIds: jobIds.length, invIds: invIds.length });

if (invIds.length) await run("payments(inv)", db.from("payments").delete().in("invoice_id", invIds));
if (jobIds.length) await run("payments(job)", db.from("payments").delete().in("job_id", jobIds));
if (invIds.length) await run("invoices", db.from("invoices").delete().in("id", invIds));
if (jobIds.length) await run("jobs", db.from("jobs").delete().in("id", jobIds));
if (estIds.length) await run("estimates", db.from("estimates").delete().in("id", estIds));
if (rootLead) await run("tasks(lead)", db.from("tasks").delete().eq("lead_id", rootLead));
for (const eid of estIds) await run("tasks(est)", db.from("tasks").delete().like("dedupe_key", `estimate_%:${eid}%`));
for (const iid of invIds) await run("tasks(inv)", db.from("tasks").delete().like("dedupe_key", `invoice_%:${iid}%`));
for (const jid of jobIds) await run("tasks(job)", db.from("tasks").delete().like("dedupe_key", `job_confirmation:${jid}%`));
await run("messages", db.from("messages").delete().eq("peer_phone", PHONE));
await run("calls", db.from("calls").delete().eq("peer_phone", PHONE));
if (rootLead) await run("lead", db.from("leads").delete().eq("id", rootLead));
if (contactIds.length) await run("contacts", db.from("contacts").delete().in("id", contactIds));
await run("state", db.from("settings").delete().eq("key", KEY));

if (errors.length) die(`cleanup errors: ${errors.join("; ")}`);

// ── assertions ────────────────────────────────────────────────────────────────
console.log("— asserting zero residue + zero collateral");
const after = await counts();
const diff = Object.fromEntries(TABLES.map((t) => [t, after[t] - before[t]]).filter(([, d]) => d !== 0));
if (Object.keys(diff).length) die(`row-count drift vs snapshot: ${JSON.stringify(diff)}`);

for (const [t, col, val] of [
  ["leads", "phone", PHONE], ["contacts", "phone", PHONE], ["messages", "peer_phone", PHONE],
]) {
  const { data } = await db.from(t).select("id").eq(col, val);
  if ((data ?? []).length) die(`residue in ${t}`);
}
const { data: leftTasks } = await db.from("tasks").select("id").eq("lead_id", leadId);
if ((leftTasks ?? []).length) die("residue tasks");
const { data: leftState } = await db.from("settings").select("key").eq("key", KEY).maybeSingle();
if (leftState) die("residue state row");

console.log("PASS — full graph seeded and removed; every table count identical to pre-test snapshot");
