// FranPOS 12-month backfill: pulls raw orders, line items, and customer
// identities for all four stores into the Supabase staging tables (migration
// 0006), wipes the FranPOS-sourced SEED data, then runs franpos_rollup() to
// recompute metrics_daily / customers / groomers / product_sales_daily.
//
//   Run:  node scripts/franpos-backfill.mjs
//         node scripts/franpos-backfill.mjs --from 2024-01-01 --to 2025-06-17
//
// --from/--to fetches ONLY that window (no seed wipe, no re-fetch of existing
// staging) — use it to extend history backward; the rollup still recomputes
// from the oldest staged row through today.
//
// Quota: ~110–150 successful calls per store (each store has its own
// 1,000/month pool; failed calls and checkUsageLimit are free). Idempotent —
// re-running upserts the same rows and re-rolls.
//
// Needs in .env.local: SUPABASE_SECRET_KEY (writes bypass RLS) + the four
// FRANPOS_TOKEN_* keys. Field semantics: supabase/FRANPOS_FIELD_MAP.md.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env ──────────────────────────────────────────────────────────────────────
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("✖ Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  console.error("  (secret key: Supabase dashboard → Settings → API keys → secret — server-side only, never NEXT_PUBLIC_)");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } });

const STORES = [
  { id: "wp", loc: 202683, name: "Winter Park",      token: process.env.FRANPOS_TOKEN_WP },
  { id: "wg", loc: 202685, name: "Winter Garden",    token: process.env.FRANPOS_TOKEN_WG },
  { id: "lv", loc: 202686, name: "Lakeside Village", token: process.env.FRANPOS_TOKEN_LV },
  { id: "wm", loc: 202684, name: "Windermere",       token: process.env.FRANPOS_TOKEN_WM },
];
const BASE = "https://publicapi.franpos.com/api";
const PAGE_SIZE = 500;
const MONTHS_BACK = 12;       // orders + items
const CUSTOMER_MONTHS = 24;   // identity feed reaches further back (cheap, ~1 page/window)

const iso = (d) => d.toISOString().slice(0, 10); // date-only — the WAF rejects ':' in paths
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v == null ? 0 : Number(v) || 0);

// 30-day windows from `monthsBack` ago through today (datadump max window = 30d)
function windows(monthsBack) {
  const out = [];
  const today = new Date();
  for (let off = monthsBack * 30; off > 0; off -= 30) {
    const from = new Date(today);
    from.setDate(from.getDate() - off);
    out.push(iso(from));
  }
  return out;
}

// 30-day windows covering an explicit [from, to) range
function windowsBetween(from, to) {
  const out = [];
  for (const d = new Date(`${from}T00:00:00Z`); iso(d) < to; d.setUTCDate(d.getUTCDate() + 30)) out.push(iso(d));
  return out;
}

let callsUsed = 0;
async function fetchJson(u, { tries = 3 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        callsUsed++;
        return body;
      }
      // 4xx don't count against quota; 5xx/timeouts get retried
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`${res.status}: ${JSON.stringify(body)?.slice(0, 200)}`);
      }
      if (i >= tries) throw new Error(`${res.status} after ${tries} tries`);
    } catch (e) {
      if (i >= tries) throw e;
    }
    await sleep(1500 * i);
  }
}

// Page through a datadump endpoint; the response carries a `pages` count.
// Pages are 0-INDEXED (verified live: pages:3 = indexes 0..2; page 0 exists).
async function dumpAll(path, token, fromDate, loc, label) {
  const rows = [];
  let pages = 1;
  for (let page = 0; page < pages; page++) {
    const u = `${BASE}/datadump/${path}/30/${page}/${fromDate}/${loc}?pageSize=${PAGE_SIZE}&Token=${token}`;
    const json = await fetchJson(u);
    if (!json || json.isSuccess === false) throw new Error(`${label} ${fromDate} p${page}: bad response`);
    pages = Math.min(num(json.pages) || 1, 200); // backstop against a runaway pager
    if (Array.isArray(json.data)) rows.push(...json.data);
    if (!Array.isArray(json.data) || json.data.length < PAGE_SIZE) break;
    await sleep(150);
  }
  return rows;
}

async function upsertChunks(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const { data: clientRow, error: clientErr } = await db.from("clients").select("id").eq("slug", "woof-gang").single();
if (clientErr || !clientRow) {
  console.error("✖ Could not load the woof-gang client row:", clientErr?.message);
  process.exit(1);
}
const CLIENT_ID = clientRow.id;
const ROLLUP_ONLY = process.argv.includes("--rollup-only"); // staging already filled — just recompute
const argVal = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const FROM = argVal("--from"); // range mode: extend staging without wiping
const TO = argVal("--to") ?? iso(new Date());
const IDENTITIES_FROM = argVal("--identities-only"); // names/pets only — no orders, no wipe, no rollup
const STORES_FILTER = argVal("--stores")?.split(","); // e.g. --stores wp,wm — limit identity passes to truncated stores
// 18 consecutive empty 30-day windows (~1.5y) before concluding we're past the
// oldest record. 4 proved too eager: the COVID-2020 registration drought hit 4+
// empty windows mid-history and silently cut off everything older (WP kept 45%
// unnamed until the old side was re-walked).
const EMPTY_STOP = 18;

console.log(`\n━━ FranPOS backfill ${IDENTITIES_FROM ? `(identities ${IDENTITIES_FROM} → ${TO})` : FROM ? `(range ${FROM} → ${TO})` : "(last 12 months)"} ━━━━━━━━━━━━━━━━━━━━`);

// ── identities-only mode ─────────────────────────────────────────────────────
// The v1/customers feed appears keyed on registration date, so regulars who
// signed up BEFORE the order-history window have no identity row — the rollup
// shows them as "—" (58% of customers after the 2024 deep backfill). This mode
// re-walks ONLY the identity feed, newest window first, and stops after 4
// consecutive empty windows (past the oldest record). The upsert carries just
// id/name/pet/store/client, so computed stats are untouched and no rollup runs.
if (IDENTITIES_FROM) {
  for (const store of STORES.filter((s) => !STORES_FILTER || STORES_FILTER.includes(s.id))) {
    if (!store.token) {
      console.log(`⚠ ${store.name}: no FRANPOS_TOKEN_${store.id.toUpperCase()} in .env.local — SKIPPED`);
      continue;
    }
    const t0 = Date.now();
    const identities = new Map();
    let empty = 0;
    for (const from of windowsBetween(IDENTITIES_FROM, TO).reverse()) {
      let rows = [];
      try {
        rows = await dumpAll("v1/customers", store.token, from, store.loc, "customers");
      } catch (e) {
        console.log(`  ⚠ customers window ${from} failed (${String(e.message).slice(0, 80)}) — identities may be partial`);
        continue;
      }
      if (rows.length === 0) {
        if (++empty >= EMPTY_STOP) break;
        continue;
      }
      empty = 0;
      for (const c of rows) {
        if (c.CustomerId == null || identities.has(String(c.CustomerId))) continue; // newest window wins
        const owner = (c.LastName ?? "").trim();
        const pet = (c.FirstName ?? "").trim();
        identities.set(String(c.CustomerId), {
          id: String(c.CustomerId),
          client_id: CLIENT_ID,
          store_id: store.id,
          name: owner || pet || "—",
          pet: pet || null,
        });
      }
    }
    await upsertChunks("customers", [...identities.values()], "id");
    console.log(`✓ ${store.name.padEnd(18)} ${String(identities.size).padStart(5)} identities  (${Math.round((Date.now() - t0) / 1000)}s)`);
    const quota = await fetch(`${BASE}/checkUsageLimit?Token=${store.token}`).then((r) => r.json()).catch(() => null);
    if (quota?.result?.[0]) console.log(`  quota: ${quota.result[0]}`);
  }
  console.log(`\n✓ identities done — ${callsUsed} successful API calls. Names land in place; no rollup needed.`);
  process.exit(0);
}

if (!ROLLUP_ONLY && !FROM) {
  console.log("⚠ Wiping FranPOS-sourced SEED data (metrics_daily, customers, groomers).");
  console.log("  Real rows replace them; calls/web columns go to 0 until Twilio/GA4 land.\n");
  for (const table of ["metrics_daily", "customers", "groomers"]) {
    const { error } = await db.from(table).delete().eq("client_id", CLIENT_ID);
    if (error) {
      console.error(`✖ wipe ${table}: ${error.message}`);
      process.exit(1);
    }
  }
}

const orderWindows = FROM ? windowsBetween(FROM, TO) : windows(MONTHS_BACK);
const customerWindows = FROM ? orderWindows : windows(CUSTOMER_MONTHS);

for (const store of ROLLUP_ONLY ? [] : STORES) {
  if (!store.token) {
    console.log(`⚠ ${store.name}: no FRANPOS_TOKEN_${store.id.toUpperCase()} in .env.local — SKIPPED`);
    continue;
  }
  const t0 = Date.now();
  const base = { client_id: CLIENT_ID, store_id: store.id, franpos_location_id: store.loc };
  const orders = new Map();
  const items = new Map();
  const identities = new Map();

  for (const from of orderWindows) {
    for (const o of await dumpAll("v1/orders", store.token, from, store.loc, "orders")) {
      if (o.OrderId == null) continue;
      orders.set(o.OrderId, {
        ...base,
        order_id: o.OrderId,
        customer_id: o.CustomerId ?? null,
        employee_id: o.EmployeeId ?? null,
        created_on: o.CreatedOn,
        sub_total: num(o.SubTotal),
        discount_total: num(o.DiscountTotal),
        tax_total: num(o.TaxTotal),
        tips: num(o.Tips),
        total: num(o.Total),
        shipping_option: o.ShippingOption ?? null,
        receipt_number: o.CustomReceiptNumber ?? null,
        company_order_number: o.CompanyOrderNumber ?? null,
      });
    }
    for (const i of await dumpAll("v2/orderitems", store.token, from, store.loc, "orderitems")) {
      if (i.OrderItemId == null) continue;
      items.set(i.OrderItemId, {
        ...base,
        order_item_id: i.OrderItemId,
        order_id: i.OrderId,
        customer_id: i.CustomerId ?? null,
        created_on: i.CreatedOn,
        name: i.Name ?? "(unnamed)",
        sku: i.Sku ?? null,
        price: num(i.Price),
        quantity: num(i.Quantity) || 1,
        cost: num(i.Cost),
        discount: num(i.Discount),
        sales_person: i.SalesPerson ?? null,
        shipping_option: i.ShippingOption ?? null,
        return_disposition: i.ReturnDisposition ?? null,
        return_reason: i.ReturnReason ?? null,
      });
    }
  }

  // Customer identities (pet = FirstName, owner = LastName). The feed also
  // includes employees — rows without a CustomerId are skipped.
  for (const from of customerWindows) {
    let rows = [];
    try {
      rows = await dumpAll("v1/customers", store.token, from, store.loc, "customers");
    } catch (e) {
      console.log(`  ⚠ customers window ${from} failed (${String(e.message).slice(0, 80)}) — identities may be partial`);
      continue;
    }
    for (const c of rows) {
      if (c.CustomerId == null) continue;
      const owner = (c.LastName ?? "").trim();
      const pet = (c.FirstName ?? "").trim();
      identities.set(String(c.CustomerId), {
        id: String(c.CustomerId),
        client_id: CLIENT_ID,
        store_id: store.id,
        name: owner || pet || "—",
        pet: pet || null,
      });
    }
  }

  await upsertChunks("franpos_orders", [...orders.values()], "order_id");
  await upsertChunks("franpos_order_items", [...items.values()], "order_item_id");
  await upsertChunks("customers", [...identities.values()], "id");

  console.log(
    `✓ ${store.name.padEnd(18)} ${String(orders.size).padStart(6)} orders  ` +
      `${String(items.size).padStart(6)} lines  ${String(identities.size).padStart(5)} customers  ` +
      `(${Math.round((Date.now() - t0) / 1000)}s)`,
  );

  const quota = await fetch(`${BASE}/checkUsageLimit?Token=${store.token}`).then((r) => r.json()).catch(() => null);
  if (quota?.result?.[0]) console.log(`  quota: ${quota.result[0]}`);
}

// ── rollup ───────────────────────────────────────────────────────────────────
// Re-roll from the OLDEST staged row, not today−360: staged items can predate
// the first fetch window by a day or two, and a day the rollup never revisits
// keeps whatever definitions were live when it was last written (this exact
// gap left 2025-06-16 stale on pre-0009 numbers).
let start = orderWindows[0];
{
  const { data: oldest } = await db.from("franpos_order_items").select("item_date").order("item_date").limit(1);
  if (oldest?.[0]?.item_date && oldest[0].item_date < start) start = oldest[0].item_date;
}
const end = iso(new Date());
console.log(`\n⟳ franpos_rollup('${start}', '${end}') …`);
let { data: roll, error: rollErr } = await db.rpc("franpos_rollup", { p_start: start, p_end: end });
if (rollErr && /timeout/i.test(rollErr.message)) {
  // Fall back to monthly chunks (rebooks stay correct — the function computes
  // them against ALL staging, not just the chunk).
  console.log("  full-range rollup timed out — chunking by month…");
  rollErr = null;
  roll = [{ metrics_rows: 0, product_rows: 0, customer_rows: 0, groomer_rows: 0 }];
  for (let d = new Date(start); iso(d) < end; d.setDate(d.getDate() + 30)) {
    const cEnd = new Date(d);
    cEnd.setDate(cEnd.getDate() + 29);
    const { data: c, error: e } = await db.rpc("franpos_rollup", { p_start: iso(d), p_end: iso(cEnd) });
    if (e) { rollErr = e; break; }
    const cr = Array.isArray(c) ? c[0] : c;
    for (const k of Object.keys(roll[0])) roll[0][k] += cr?.[k] ?? 0;
    process.stdout.write(`  ✓ ${iso(d)}…\r`);
  }
}
if (rollErr) {
  console.error("✖ rollup failed:", rollErr.message, "\n  (did you run migrations 0006 + 0007?)");
  process.exit(1);
}
const r = Array.isArray(roll) ? roll[0] : roll;
console.log(`✓ rollup: ${r?.metrics_rows ?? "?"} metric-days, ${r?.product_rows ?? "?"} product-days, ${r?.customer_rows ?? "?"} customers, ${r?.groomer_rows ?? "?"} groomers`);

// ── validation: reproduce the May 2026 Windermere FranPOS report ─────────────
// The portal showed Full Groom: 471 sold / $44,417.50 for 05/01–05/31. The
// same numbers must come out of OUR rows — the iron-rule credibility check.
const { data: fg } = await db
  .from("product_sales_daily")
  .select("units, revenue")
  .eq("store_id", "wm")
  .eq("name", "Full Groom")
  .gte("date", "2026-05-01")
  .lte("date", "2026-05-31");
if (fg?.length) {
  const units = fg.reduce((s, x) => s + num(x.units), 0);
  const rev = fg.reduce((s, x) => s + num(x.revenue), 0);
  console.log("\n━━ Validation vs FranPOS portal (Windermere, May 2026) ━━━━━");
  console.log(`  Full Groom units:   ${units}  (portal: 471)`);
  console.log(`  Full Groom revenue: $${rev.toFixed(2)}  (portal: $44,417.50)`);
  // ±2%: the portal attributes by appointment date, we attribute by checkout
  // date (documented in FRANPOS_FIELD_MAP.md) — a few boundary grooms differ.
  console.log(
    Math.abs(units - 471) / 471 <= 0.02
      ? "  ✓ MATCH within attribution tolerance — pipeline verified"
      : "  ⚠ MISMATCH beyond tolerance — check field map / service heuristic before shipping",
  );
} else {
  console.log("\n⚠ No 'Full Groom' rows found for Windermere May — check the sync output above.");
}

console.log(`\nDone. ~${callsUsed} successful API calls used. Next: node scripts/check-supabase.mjs\n`);
