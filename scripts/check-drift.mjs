// Drift gate: does each Supabase project actually contain what its migration
// files on disk say it should? READ-ONLY — probes REST with the service key,
// never runs DDL, never invokes a mutating RPC.
//
//   Run:  node scripts/check-drift.mjs
//
// Per project (Woof Gang always; Canes/Urso only when their env keys exist):
//   1. Artifact probe — every `create table if not exists` / `create function`
//      in the project's migration dir must exist live.
//   2. Ledger cross-check — schema_migrations (written by apply-migration.mjs)
//      vs the files on disk, both directions, plus checksum drift.
//   3. Revenue reconciliation (WG only) — store_day_lineitems line revenue must
//      match metrics_by_store headline revenue for a closed day within 0.5%.
//      The standing iron-rule assertion: ONE revenue definition everywhere.
//
// Exit 0 = clean; non-zero = something is missing, unrecorded, or off.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

// Load .env.local (then .env) with no dependency, like the other scripts.
for (const file of ["../.env.local", "../.env"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

// Migrations that are DELIBERATELY not applied yet — the gate reports them as
// "pending by design" instead of failing, so the green/red signal stays
// meaningful. Remove an entry the day its feature goes live.
//   0005: Twilio missed-call capture — blocked on the Twilio account + A2P.
const PENDING_BY_DESIGN = new Map([
  ["supabase/migrations", new Set(["0005_twilio_missed_calls.sql"])],
]);

const PROJECTS = [
  // WG is the production dashboard — its env is required; the gate fails
  // loudly if it's absent. The other two skip with a notice.
  { name: "Woof Gang", dir: "supabase/migrations", url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, required: true, reconcile: true },
  { name: "Canes", dir: "supabase/canes", url: process.env.NEXT_PUBLIC_CANES_SUPABASE_URL, key: process.env.CANES_SUPABASE_SECRET_KEY },
  { name: "Urso HQ", dir: "supabase/urso", url: process.env.NEXT_PUBLIC_URSO_SUPABASE_URL, key: process.env.URSO_SUPABASE_SECRET_KEY },
];

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const shiftDay = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Parse a migration dir into per-file created artifacts. Trigger functions are
// skipped: PostgREST never exposes `returns trigger` functions over /rpc, so
// probing them would always read as "missing" even when applied.
function parseDir(dir) {
  const base = new URL(`../${dir}/`, import.meta.url);
  return readdirSync(base)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const sql = readFileSync(new URL(f, base), "utf8");
      const tables = [...sql.matchAll(/create table if not exists ([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase());
      const functions = [];
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)) {
        const bodyStart = sql.indexOf("$$", m.index);
        const head = sql.slice(m.index, bodyStart === -1 ? m.index + 1500 : bodyStart);
        if (/returns\s+trigger/i.test(head)) continue;
        functions.push(m[1].toLowerCase());
      }
      return { file: f, checksum: sha256(sql), tables: [...new Set(tables)], functions: [...new Set(functions)] };
    });
}

// Every probe uses the SERVICE key, uniformly — functions that are deliberately
// revoked from anon/authenticated (customer_groomer_affinity, find_customer,
// customer_profile, franpos_rollup, …) keep service_role execute, so with this
// key they still show up instead of reading as missing.
function rest(p, path, init = {}) {
  return fetch(`${p.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: p.key, Authorization: `Bearer ${p.key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

// Live function names come from the PostgREST OpenAPI root, NOT from calling
// each function, for two verified reasons (probed live 2026-07-30):
//   - POST /rpc/fn with {} cannot tell "missing" from "exists with required
//     args" — both answer 404 PGRST202 with a null hint.
//   - Actually invoking functions is unsafe for a read-only gate: a mutating
//     function with zero/defaulted args would EXECUTE. So when the OpenAPI doc
//     is unreachable we report "unknown" and fail, rather than probe-by-call.
async function liveFunctions(p) {
  const res = await rest(p, "");
  if (!res.ok) return null;
  const doc = await res.json().catch(() => null);
  if (!doc?.paths) return null;
  return new Set(Object.keys(doc.paths).filter((k) => k.startsWith("/rpc/")).map((k) => k.slice(5)));
}

// Name the ledger migration for the hint without hardcoding numbers — the
// canes dir has already moved past the number originally planned for it.
function ledgerHint(dir) {
  try {
    const base = new URL(`../${dir}/`, import.meta.url);
    const f = readdirSync(base)
      .filter((n) => n.endsWith(".sql"))
      .find((n) => readFileSync(new URL(n, base), "utf8").includes("create table if not exists schema_migrations"));
    if (f) return `${dir}/${f}`;
  } catch {}
  return `the ${dir} schema_migrations ledger migration (not in the repo yet)`;
}

// WG iron rule: the itemized read and the headline rollup must agree, because
// both are defined on the same staging rows with the same passthrough filter.
async function reconcileRevenue(p) {
  const dayRes = await rest(p, "metrics_daily?select=date&store_id=eq.wp&revenue=gt.0&order=date.desc&limit=1");
  const rows = dayRes.ok ? await dayRes.json() : [];
  if (!rows.length) return { skip: "no wp revenue rows in metrics_daily" };
  // The newest day is usually mid-sync/open — step back one to a closed day.
  const day = shiftDay(rows[0].date, -1);
  let lineSum = 0;
  for (let offset = 0; ; offset += 1000) {
    // limit/offset paging: Supabase caps any response at 1,000 rows.
    const res = await rest(p, `rpc/store_day_lineitems?limit=1000&offset=${offset}`, {
      method: "POST",
      body: JSON.stringify({ p_store_ids: ["wp"], p_start: day, p_end: day }), // p_end is inclusive
    });
    if (!res.ok) return { fail: `store_day_lineitems call failed (${res.status})` };
    const batch = await res.json();
    for (const r of batch) if (!r.is_passthrough) lineSum += Number(r.line_revenue);
    if (batch.length < 1000) break;
  }
  const aggRes = await rest(p, "rpc/metrics_by_store", {
    method: "POST",
    body: JSON.stringify({ p_start: day, p_end: shiftDay(day, 1) }), // [start, end)
  });
  if (!aggRes.ok) return { fail: `metrics_by_store call failed (${aggRes.status})` };
  const wp = (await aggRes.json()).find((r) => r.store_id === "wp");
  const headline = Number(wp?.revenue ?? 0);
  const pct = headline ? Math.abs(lineSum - headline) / headline : lineSum ? 1 : 0;
  const detail = `wp ${day}: lineitems $${lineSum.toFixed(2)} vs metrics_by_store $${headline.toFixed(2)} (Δ ${(pct * 100).toFixed(3)}%)`;
  return pct <= 0.005 ? { ok: detail } : { fail: `iron-rule reconciliation off — ${detail}` };
}

let anyFail = false;

for (const p of PROJECTS) {
  if (!p.url || !p.key) {
    if (p.required) {
      console.error(`\n✖ ${p.name}: missing Supabase env in .env.local — cannot run the gate.`);
      anyFail = true;
    } else {
      console.log(`\n○ ${p.name}: env not configured on this machine — skipped.`);
    }
    continue;
  }

  const files = parseDir(p.dir);
  const definedIn = new Map(); // artifact → first defining file, for messages
  const allTables = new Set();
  const allFns = new Set();
  for (const f of files) {
    for (const t of f.tables) { allTables.add(t); if (!definedIn.has(t)) definedIn.set(t, f.file); }
    for (const fn of f.functions) { allFns.add(fn); if (!definedIn.has(fn)) definedIn.set(fn, f.file); }
  }

  console.log(`\n── ${p.name} (${p.dir}, ${files.length} files) ${"─".repeat(Math.max(1, 40 - p.name.length))}`);
  const problems = [];

  const tableState = new Map();
  await Promise.all(
    [...allTables].map(async (t) => {
      const res = await rest(p, `${t}?limit=1`);
      await res.arrayBuffer().catch(() => {});
      tableState.set(t, res.status === 200 || res.status === 206 ? "ok" : res.status === 404 ? "missing" : `error ${res.status}`);
    }),
  );
  const pending = PENDING_BY_DESIGN.get(p.dir) ?? new Set();
  const isPending = (artifact) => pending.has(definedIn.get(artifact));
  const notes = [];
  for (const [t, state] of [...tableState].sort()) {
    if (state === "missing" && isPending(t)) notes.push(`pending by design: table ${t} (${definedIn.get(t)})`);
    else if (state === "missing") problems.push(`missing table  ${t}  (${definedIn.get(t)})`);
    else if (state !== "ok") problems.push(`table probe ${state}  ${t}  (${definedIn.get(t)})`);
  }

  const fns = await liveFunctions(p);
  if (fns === null) {
    problems.push("could not fetch the PostgREST OpenAPI root — function existence unknown");
  } else {
    for (const fn of [...allFns].sort()) {
      if (fns.has(fn)) continue;
      if (isPending(fn)) notes.push(`pending by design: fn ${fn} (${definedIn.get(fn)})`);
      else problems.push(`missing fn     ${fn}  (${definedIn.get(fn)})`);
    }
  }

  const okTables = [...tableState.values()].filter((s) => s === "ok").length;
  const okFns = fns ? [...allFns].filter((f) => fns.has(f)).length : 0;
  console.log(`  tables    ${okTables}/${allTables.size} live`);
  console.log(`  functions ${fns ? okFns : "?"}/${allFns.size} live`);
  for (const n of notes) console.log(`  ○ ${n}`);

  // Ledger cross-check ────────────────────────────────────────────────────────
  const lres = await rest(p, "schema_migrations?select=filename,checksum&order=filename&limit=1000");
  if (lres.status === 404) {
    await lres.arrayBuffer().catch(() => {});
    problems.push(`ledger: schema_migrations table missing — apply ${ledgerHint(p.dir)}`);
  } else if (!lres.ok) {
    problems.push(`ledger: schema_migrations read failed (${lres.status})`);
  } else {
    const ledger = new Map((await lres.json()).map((r) => [r.filename, r.checksum]));
    for (const f of files) {
      if (ledger.has(f.file)) {
        // Backfilled rows carry a null checksum (the file ran before hashing
        // existed) — only a recorded hash that differs is drift.
        const recorded = ledger.get(f.file);
        if (recorded != null && recorded !== f.checksum) problems.push(`ledger: checksum drift  ${f.file} (file changed since it was applied)`);
        continue;
      }
      const artifacts = [...f.tables, ...f.functions];
      const missing = artifacts.filter((a) => (f.tables.includes(a) ? tableState.get(a) !== "ok" : fns ? !fns.has(a) : true));
      if (pending.has(f.file) && missing.length) { notes.push(`pending by design: ${f.file} not applied`); continue; }
      if (artifacts.length && missing.length) problems.push(`ledger: NOT APPLIED  ${f.file} (missing: ${missing.join(", ")})`);
      else if (artifacts.length) problems.push(`ledger: applied but unrecorded  ${f.file} (re-run apply-migration.mjs to record it)`);
      else problems.push(`ledger: unrecorded  ${f.file} (no created artifacts to probe — cannot verify)`);
    }
    const onDisk = new Set(files.map((f) => f.file));
    for (const name of ledger.keys()) {
      if (!onDisk.has(name)) problems.push(`ledger: recorded but no file on disk  ${name}`);
    }
    if (![...ledger.keys()].length && !problems.some((x) => x.startsWith("ledger"))) console.log("  ledger    empty");
  }

  // Revenue reconciliation (WG only) ─────────────────────────────────────────
  if (p.reconcile) {
    if (fns?.has("store_day_lineitems")) {
      const r = await reconcileRevenue(p);
      if (r.ok) console.log(`  ✓ revenue reconciles — ${r.ok}`);
      else if (r.skip) console.log(`  ○ reconciliation skipped — ${r.skip}`);
      else problems.push(r.fail);
    } else {
      console.log("  ○ reconciliation skipped — store_day_lineitems not deployed");
    }
  }

  if (problems.length) {
    anyFail = true;
    for (const msg of problems) console.log(`  ✖ ${msg}`);
  } else {
    console.log("  ✓ no drift");
  }
}

console.log(anyFail ? "\n✖ Drift gate FAILED.\n" : "\n✓ Drift gate passed.\n");
process.exit(anyFail ? 1 : 0);
