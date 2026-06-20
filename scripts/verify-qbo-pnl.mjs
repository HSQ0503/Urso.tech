// QuickBooks sandbox verification — step 1 of the QBO go-live checklist.
// Proves the OAuth → sync → storage path end-to-end WITHOUT trusting the UI:
//   1. confirms a quickbooks_connections row exists (the owner/dev has connected
//      a sandbox company via /api/quickbooks/connect),
//   2. (optional, --sync) calls the REAL /api/quickbooks/sync route on the
//      running dev server, so the actual shipped lib/quickbooks.ts code runs,
//   3. reads quickbooks_pnl back and reconciles a net-income figure computed
//      from the STORED rows against the net income the route reported from
//      QuickBooks — if those match, the matrix parse + upsert are faithful.
//
//   Run (verify what's already stored):
//     node scripts/verify-qbo-pnl.mjs
//
//   Run (trigger the sync first, then verify — needs `npm run dev` running):
//     node scripts/verify-qbo-pnl.mjs --sync
//
//   Flags: --client=woof-gang  --sync  --port=3000  --months=3  --method=Accrual
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (bypasses
// RLS — quickbooks_pnl/_connections are server-only). --sync also needs
// CRON_SECRET (the sync route's bearer/secret).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env (no dependency, matches scripts/check-supabase.mjs) ──────────────────
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

// ── args ─────────────────────────────────────────────────────────────────────
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
const DO_SYNC = !!arg("sync", false);
const PORT = arg("port", "3000");
const MONTHS = arg("months", "3");
const METHOD = arg("method", "Accrual") === "Cash" ? "Cash" : "Accrual";
const DEBUG = !!arg("debug", false);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("✖ Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } });

const usd = (n) => `$${Math.round(Number(n)).toLocaleString()}`;
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

// ── 1. connection check (non-secret columns only) ────────────────────────────
console.log(`\nQuickBooks verification — client '${CLIENT}'`);
console.log(`Configured environment: ${process.env.QBO_ENVIRONMENT ?? "(unset)"}`);

const { data: conn, error: connErr } = await db
  .from("quickbooks_connections")
  .select("realm_id, environment, token_expires_at, refresh_token_expires_at, updated_at")
  .eq("client_id", CLIENT)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (connErr) fail(`Reading quickbooks_connections failed: ${connErr.message}\n  (is migration 0004 applied?)`);
if (!conn) {
  fail(
    `No connection row for '${CLIENT}'. Connect a sandbox company first:\n` +
      `    1) npm run dev\n` +
      `    2) open http://localhost:${PORT}/api/quickbooks/connect\n` +
      `    3) sign in with your Intuit *sandbox* company and approve\n` +
      `  then re-run this script.`,
  );
}

const rtExp = conn.refresh_token_expires_at ? new Date(conn.refresh_token_expires_at) : null;
console.log(`\n✓ Connection found`);
console.log(`    realm_id ............ ${conn.realm_id}`);
console.log(`    environment ......... ${conn.environment}`);
console.log(`    access token exp .... ${conn.token_expires_at ?? "—"}`);
console.log(`    refresh token exp ... ${conn.refresh_token_expires_at ?? "—"}`);
console.log(`    last updated ........ ${conn.updated_at}`);
if (conn.environment !== "sandbox")
  console.log(`    ⚠ environment is '${conn.environment}', not 'sandbox' — make sure that's intended.`);
if (rtExp && rtExp.getTime() < Date.now())
  console.log(`    ⚠ refresh token EXPIRED — owner must reconnect via /api/quickbooks/connect.`);

// ── 2. optional: run the real sync route ─────────────────────────────────────
let routeTotals = null; // [{month,label,amount}] — QBO's own summary rows
let syncMonths = null; // months the route reported syncing
if (DO_SYNC) {
  const cron = process.env.CRON_SECRET;
  if (!cron) fail("--sync needs CRON_SECRET in .env.local (the sync route's secret).");
  const syncUrl = `http://localhost:${PORT}/api/quickbooks/sync?secret=${encodeURIComponent(
    cron,
  )}&client=${encodeURIComponent(CLIENT)}&months=${encodeURIComponent(MONTHS)}&method=${METHOD}`;
  console.log(`\n→ Calling the real sync route on localhost:${PORT} (months=${MONTHS}, method=${METHOD}) …`);
  let res, body;
  try {
    res = await fetch(syncUrl);
    body = await res.json();
  } catch (e) {
    fail(`Could not reach the sync route — is \`npm run dev\` running on port ${PORT}?\n  ${e.message}`);
  }
  if (!res.ok) fail(`Sync route returned ${res.status}: ${JSON.stringify(body)}`);
  // syncQuickbooks now returns { ..., writes: [{ writeClientId, totals, months, ... }] }
  // (a multi-store company writes per-store class splits + the company total).
  // Reconcile against the write whose id matches CLIENT — for wm-lv that's the
  // unfiltered company total, which is what client_id=wm-lv stores in the DB.
  const mine = (body.writes || []).find((w) => w.writeClientId === CLIENT) || (body.writes || [])[0] || body;
  console.log(`✓ Sync ok — env=${body.environment}, realm=${body.realm_id}, months=${(mine.months || []).join(", ")}, accounts=${mine.accounts}, ${mine.ms}ms`);
  routeTotals = mine.totals || [];
  syncMonths = mine.months || [];
}

// ── 3. read stored rows + reconcile ──────────────────────────────────────────
const { data: rows, error: pnlErr } = await db
  .from("quickbooks_pnl")
  .select("month, section, account, amount, accounting_method")
  .eq("client_id", CLIENT)
  .order("month", { ascending: true });

if (pnlErr) fail(`Reading quickbooks_pnl failed: ${pnlErr.message}\n  (is migration 0015 applied?)`);
if (!rows || !rows.length)
  fail(
    `quickbooks_pnl is EMPTY for '${CLIENT}'. Run the sync first:\n` +
      `    node scripts/verify-qbo-pnl.mjs --sync\n` +
      `  (or hit /api/quickbooks/sync?secret=…&method=${METHOD} with the dev server running).`,
  );

// Sum the stored detail leaves per month. We deliberately do NOT try to bucket
// them into Income/COGS/Expense here: QBO nests accounts under parent groups
// (e.g. "Landscaping Services") and the stored `section` is that nested parent
// name, not the top-level bucket — so a text test on `section` mis-buckets the
// nested ones. Instead we reconcile against QBO's OWN summary rows (below).
const leafByMonth = new Map();
for (const r of rows) {
  const m = leafByMonth.get(r.month) ?? { sum: 0, count: 0, sections: new Set() };
  m.sum += Number(r.amount);
  m.count += 1;
  m.sections.add(r.section);
  leafByMonth.set(r.month, m);
}

// QBO's authoritative subtotals, matched on EXACT summary labels so nested
// "Total <parent>" rows can't pollute the top-level components.
const exact = (re) => {
  const map = {};
  for (const t of routeTotals ?? []) if (re.test(String(t.label).trim().toLowerCase())) map[t.month] = Number(t.amount);
  return map;
};
const incQBO = exact(/^total income$/);
const cogsQBO = exact(/^total cost of goods sold$/);
const expQBO = exact(/^total expenses?$/);
const netQBO = exact(/^net income$/);
// The component subtotals whose leaves we store — their sum must equal the sum
// of stored leaves for that month (classification-free integrity check).
const COMPONENTS = new Set([
  "total income",
  "total cost of goods sold",
  "total expenses",
  "total other income",
  "total other expenses",
]);
const componentSum = {};
for (const t of routeTotals ?? []) {
  const l = String(t.label).trim().toLowerCase();
  if (COMPONENTS.has(l)) componentSum[t.month] = (componentSum[t.month] ?? 0) + Number(t.amount);
}

if (DEBUG) {
  const allMonths = [...new Set([...(syncMonths ?? []), ...leafByMonth.keys()])].sort();
  for (const month of allMonths) {
    console.log(`\n──────── DEBUG ${month} ────────`);
    console.log(`  QBO summary rows (label : amount):`);
    const ts = (routeTotals ?? []).filter((t) => t.month === month).sort((a, b) => String(a.label).localeCompare(String(b.label)));
    if (!ts.length) console.log(`    (none — run with --sync)`);
    for (const t of ts) console.log(`    ${String(t.label).padEnd(34)} ${usd(t.amount).padStart(12)}`);
    console.log(`  Stored leaves by section (section : Σ amount : #rows):`);
    const bySec = new Map();
    for (const r of rows.filter((r) => r.month === month)) {
      const s = bySec.get(r.section) ?? { sum: 0, n: 0 };
      s.sum += Number(r.amount);
      s.n += 1;
      bySec.set(r.section, s);
    }
    for (const [sec, s] of [...bySec.entries()].sort())
      console.log(`    ${(sec || "(blank)").padEnd(34)} ${usd(s.sum).padStart(12)}  ${s.n}r`);
    console.log(`    ${"— Σ stored leaves —".padEnd(34)} ${usd([...bySec.values()].reduce((a, s) => a + s.sum, 0)).padStart(12)}`);
  }
  console.log("");
}

// ── the authoritative, dashboard-facing numbers (quickbooks_pnl_totals) ──────
const { data: totalRows, error: totErr } = await db
  .from("quickbooks_pnl_totals")
  .select("month, label, amount, accounting_method")
  .eq("client_id", CLIENT)
  .order("month", { ascending: true });
if (totErr)
  fail(
    `Reading quickbooks_pnl_totals failed: ${totErr.message}\n` +
      `  Apply the migration, then re-sync:\n` +
      `    (run supabase/migrations/0021_quickbooks_pnl_totals.sql against your DB)\n` +
      `    node scripts/verify-qbo-pnl.mjs --sync`,
  );

const tExact = (re) => {
  const map = {};
  for (const t of totalRows ?? []) if (re.test(String(t.label).trim().toLowerCase())) map[t.month] = Number(t.amount);
  return map;
};
const incT = tExact(/^total income$/);
const cogsT = tExact(/^total cost of goods sold$/);
const expT = tExact(/^total expenses?$/);
const netT = tExact(/^net income$/);
const totalsMonths = [...new Set((totalRows ?? []).map((t) => t.month))];

console.log(
  `\n✓ quickbooks_pnl has ${rows.length} leaf rows; quickbooks_pnl_totals has ${(totalRows ?? []).length} summary rows across ${totalsMonths.length} month(s)`,
);

const months = [...new Set([...(syncMonths ?? []), ...totalsMonths])].sort();
console.log(
  `\n    ${"Month".padEnd(12)}${"Income".padStart(12)}${"COGS".padStart(11)}${"Expenses".padStart(11)}${"Net Income".padStart(13)}${routeTotals ? "   vs live QBO" : ""}`,
);
let allOk = true;
for (const month of months) {
  const net = netT[month];
  let tail = "";
  if (routeTotals) {
    const live = netQBO[month];
    if (live == null && net == null) tail = "   —";
    else {
      const ok = net != null && live != null && Math.abs(net - live) < 0.5;
      if (!ok) allOk = false;
      tail = ok ? "   ✓ matches" : `   ✖ table ${net == null ? "—" : usd(net)} vs live ${live == null ? "—" : usd(live)}`;
    }
  } else if (net == null) {
    allOk = false;
  }
  console.log(
    `    ${month.padEnd(12)}${usd(incT[month] ?? 0).padStart(12)}${usd(cogsT[month] ?? 0).padStart(11)}` +
      `${usd(expT[month] ?? 0).padStart(11)}${(net == null ? "—" : usd(net)).padStart(13)}${tail}`,
  );
}
console.log(`\n    These are QuickBooks' own P&L summary lines from quickbooks_pnl_totals —`);
console.log(`    the authoritative, complete numbers the dashboard Money panel should read.`);

// Informational only: the per-account leaf detail is known-incomplete + unused.
const leafShort = months.some((m) => Math.abs((leafByMonth.get(m)?.sum ?? 0) - (componentSum[m] ?? 0)) >= 0.5);
if (leafShort)
  console.log(
    `\n    ℹ The per-account leaf rows in quickbooks_pnl don't fully reconcile to these subtotals\n` +
      `      (nested-account flattening — known + unused by the dashboard). The totals above are what count.`,
  );

if (routeTotals) {
  const everyMonthHasNet = (syncMonths ?? []).every((m) => netT[m] != null);
  if (allOk && everyMonthHasNet) {
    console.log(`\n✓ PASS — sync ran against the real route and QuickBooks' authoritative P&L totals are`);
    console.log(`  persisted and match live QuickBooks for every month. Step 1 verified.\n`);
    process.exit(0);
  }
  console.log(
    `\n✖ Needs a look — ${
      !everyMonthHasNet
        ? "a synced month has no persisted Net Income — did migration 0020 apply and the re-sync run?"
        : "persisted totals don't match live QuickBooks"
    }.\n`,
  );
  process.exit(1);
} else if ((totalRows ?? []).length && allOk) {
  console.log(`\n✓ Persisted QBO totals look good. Run with --sync to cross-check against live QuickBooks.\n`);
  process.exit(0);
} else {
  console.log(`\n✖ quickbooks_pnl_totals is empty — apply migration 0020, then run with --sync.\n`);
  process.exit(1);
}
