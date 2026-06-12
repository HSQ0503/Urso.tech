// Independent validation of the rollup metrics: replays every metric definition
// in JS straight from the raw staging rows (franpos_order_items) and compares
// against what the SQL rollup + RPCs produce. Two independent implementations
// must agree — run before AND after a rollup/migration change.
//   Run:  node scripts/validate-rollup.mjs
// Definitions mirrored here (keep in sync with migration 0010):
//   passthrough, service heuristic, walk-in house accounts (visit-days ≥ 80% of
//   the store's trading days), global first-visit for new/repeat, backward-90d
//   returns excluding walk-ins, survival cohort with a 90-day warm-up.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY; // staging tables are service-role only
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key);
const num = (v) => (v == null ? 0 : Number(v) || 0);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
let totalFails = 0;
const check = (label, ok, detail = "") => {
  if (!ok) totalFails++;
  console.log(`  ${ok ? "✓" : "✖"} ${label}${detail ? `  ${detail}` : ""}`);
};

// ── Definition replicas (MUST mirror the SQL exactly) ───────────────────────
const isPassthrough = (name) => {
  const n = (name ?? "").toLowerCase();
  return /deposit/.test(n) || /^\s*gift\s?card/.test(n);
};
const isService = (sku, cost) => !(/^[0-9]{6,}$/.test(sku ?? "") || num(cost) > 0);

// ── Load every order line (paged — PostgREST caps at 1,000 rows) ────────────
console.log("Loading franpos_order_items …");
const items = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("franpos_order_items")
    .select("store_id,item_date,order_id,customer_id,name,sku,price,quantity,cost,discount,sales_person")
    .order("order_item_id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  items.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${items.length.toLocaleString()} lines`);

for (const i of items) {
  i.rev = num(i.price) * num(i.quantity) - num(i.discount);
  i.pass = isPassthrough(i.name);
  i.svc = isService(i.sku, i.cost);
}
const live = items.filter((i) => !i.pass);
const dates = items.map((i) => i.item_date).sort();
const MIN_DATE = dates[0];
const MAX_DATE = dates[dates.length - 1];
console.log(`Data window: ${MIN_DATE} → ${MAX_DATE}\n`);

// ── Walk-in house accounts: visit-days ≥ 80% of the store's trading days ────
const tradingDays = new Map(); // store -> Set(dates)
const pairDays = new Map(); // store|cust -> Set(dates)
for (const i of items) {
  let t = tradingDays.get(i.store_id);
  if (!t) tradingDays.set(i.store_id, (t = new Set()));
  t.add(i.item_date);
  if (i.customer_id == null) continue;
  const k = `${i.store_id}|${i.customer_id}`;
  let p = pairDays.get(k);
  if (!p) pairDays.set(k, (p = new Set()));
  p.add(i.item_date);
}
const walkins = new Set(
  [...pairDays.entries()]
    .filter(([k, days]) => days.size >= tradingDays.get(k.split("|")[0]).size * 0.8)
    .map(([k]) => k),
);
console.log(`Walk-in house accounts detected: ${walkins.size} → ${[...walkins].join(", ")}`);
const isWalkin = (store, cust) => walkins.has(`${store}|${cust}`);

// ── Global first visit (walk-in pairs excluded — mirrors first_visit CTE) ───
const firstVisit = new Map(); // customer_id -> min date
for (const i of live) {
  if (i.customer_id == null || isWalkin(i.store_id, i.customer_id)) continue;
  const cur = firstVisit.get(i.customer_id);
  if (!cur || i.item_date < cur) firstVisit.set(i.customer_id, i.item_date);
}

// ── Per-window aggregates in JS ──────────────────────────────────────────────
function windowStats(start, end) {
  const inWin = (d) => (!start || d >= start) && (!end || d < end);
  const byStore = {};
  const tickets = new Map(); // store|order -> ticket
  for (const i of live) {
    if (!inWin(i.item_date)) continue;
    const s = (byStore[i.store_id] ??= { grooming: 0, retail: 0 });
    if (i.svc) s.grooming += i.rev;
    else s.retail += i.rev;
    const k = `${i.store_id}|${i.order_id}`;
    const t = tickets.get(k) ?? { svc: false, prod: false, rev: 0, cust: null, store: i.store_id, d: i.item_date };
    t.svc ||= i.svc;
    t.prod ||= !i.svc;
    t.rev += i.rev;
    t.cust ??= i.customer_id;
    tickets.set(k, t);
  }
  for (const t of tickets.values()) {
    const s = byStore[t.store];
    s.tickets = (s.tickets ?? 0) + 1;
    const identified = t.cust != null && firstVisit.has(t.cust); // mirrors the fv left join
    if (t.svc) {
      s.bookings = (s.bookings ?? 0) + 1;
      s.bookingRev = (s.bookingRev ?? 0) + t.rev;
      if (identified) s.identified = (s.identified ?? 0) + 1;
      if (t.prod) s.attached = (s.attached ?? 0) + 1;
    }
    if (identified) {
      const fd = firstVisit.get(t.cust);
      if (t.d === fd) s.newRev = (s.newRev ?? 0) + t.rev;
      else if (t.d > fd) s.repeatRev = (s.repeatRev ?? 0) + t.rev;
    }
  }
  return byStore;
}

// Returns (backward 90d), walk-ins excluded — mirrors svc_orders/svc_prev.
function returnsByWindow(start, end) {
  const perCust = new Map();
  for (const i of live) {
    if (!i.svc || i.customer_id == null || isWalkin(i.store_id, i.customer_id)) continue;
    const k = `${i.store_id}|${i.customer_id}`;
    let m = perCust.get(k);
    if (!m) perCust.set(k, (m = new Map()));
    m.set(`${i.item_date}|${i.order_id}`, { d: i.item_date, o: i.order_id, store: i.store_id });
  }
  const out = {};
  for (const m of perCust.values()) {
    const orders = [...m.values()].sort((a, b) => (a.d === b.d ? a.o - b.o : a.d < b.d ? -1 : 1));
    for (let j = 0; j < orders.length; j++) {
      const { d, store } = orders[j];
      if (start && d < start) continue;
      if (end && d >= end) continue;
      const prev = j > 0 ? orders[j - 1].d : null;
      if (prev && daysBetween(prev, d) <= 90) out[store] = (out[store] ?? 0) + 1;
    }
  }
  return out;
}

// ── Compare a JS window against metrics_by_store ─────────────────────────────
async function compare(label, start, end) {
  const js = windowStats(start, end);
  const jsReturns = returnsByWindow(start, end);
  const { data, error } = await db.rpc("metrics_by_store", { p_start: start, p_end: end });
  if (error) throw new Error(error.message);
  console.log(`\n── ${label} — JS replica vs metrics_by_store ──`);
  const hasNew = data.length && "new_revenue" in data[0];
  if (!hasNew) console.log("  ⚠ migration 0010 not applied yet (no new_revenue column) — skipping new checks");
  for (const r of data.sort((a, b) => a.store_id.localeCompare(b.store_id))) {
    const j = js[r.store_id] ?? {};
    const checks = [
      ["revenue", (j.grooming ?? 0) + (j.retail ?? 0), num(r.revenue), 1],
      ["grooming", j.grooming ?? 0, num(r.grooming_revenue), 1],
      ["retail", j.retail ?? 0, num(r.retail_revenue), 1],
      ["bookingRev", j.bookingRev ?? 0, num(r.booking_revenue), 1],
      ["bookings", j.bookings ?? 0, num(r.bookings), 0],
      ["attached", j.attached ?? 0, num(r.retail_attached), 0],
      ["returns", jsReturns[r.store_id] ?? 0, num(r.rebooks), 0],
    ];
    if (hasNew) {
      checks.push(["tickets", j.tickets ?? 0, num(r.tickets_total), 0]);
      checks.push(["identified", j.identified ?? 0, num(r.identified_bookings), 0]);
      checks.push(["newRev", j.newRev ?? 0, num(r.new_revenue), 1]);
      checks.push(["repeatRev", j.repeatRev ?? 0, num(r.repeat_revenue), 1]);
    }
    for (const [name, a, b, tol] of checks) {
      check(
        `${r.store_id} ${name.padEnd(10)}`,
        Math.abs(a - b) <= tol,
        `js=${a.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(12)}  db=${b.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(12)}`,
      );
    }
  }
}

await compare("May 2026", "2026-05-01", "2026-06-01");
await compare("Full window", null, null);

// ── product_revenue_by_name: reconciles to headline revenue + name grouping ──
{
  console.log("\n── product_revenue_by_name (full window, all stores) ──");
  const { data, error } = await db.rpc("product_revenue_by_name", {
    p_store_ids: ["wp", "wg", "lv", "wm"], p_start: null, p_end: null,
  });
  if (error) {
    console.log(`  ⚠ RPC missing (${error.message}) — apply migration 0010`);
    totalFails++;
  } else {
    const byName = new Map();
    for (const i of live) {
      const k = (i.name ?? "").trim().toLowerCase();
      const e = byName.get(k) ?? { rev: 0, svcRev: 0 };
      e.rev += i.rev;
      if (i.svc) e.svcRev += i.rev;
      byName.set(k, e);
    }
    // The RPC returns the top 500 names by revenue (deterministic — PostgREST
    // would otherwise truncate at 1,000 in arbitrary order). The db rows must
    // therefore equal the JS top-|rows| by revenue.
    const jsSorted = [...byName.values()].sort((a, b) => b.rev - a.rev);
    const jsTopSum = jsSorted.slice(0, data.length).reduce((a, e) => a + e.rev, 0);
    const dbTotal = data.reduce((a, r) => a + num(r.revenue), 0);
    check(`db rows = js top ${data.length} by revenue`, Math.abs(jsTopSum - dbTotal) <= 1, `js=${jsTopSum.toFixed(2)} db=${dbTotal.toFixed(2)}`);
    check("ordered desc (top seller first)", num(data[0]?.revenue) >= num(data[1]?.revenue) && Math.abs(num(data[0]?.revenue) - jsSorted[0].rev) <= 1, `db#1=${data[0]?.name} $${Math.round(num(data[0]?.revenue)).toLocaleString()}`);
    for (const r of data.slice(0, 8)) {
      const e = byName.get((r.name ?? "").trim().toLowerCase());
      const okRev = e && Math.abs(e.rev - num(r.revenue)) <= 1;
      const okSvc = e && (e.svcRev >= e.rev - e.svcRev) === r.is_service;
      check(`${r.name}`, !!(okRev && okSvc), `$${Math.round(num(r.revenue)).toLocaleString()} ${r.is_service ? "service" : "retail"}`);
    }
  }
}

// ── groomer_revenue vs JS service-line sums ──────────────────────────────────
{
  console.log("\n── groomer_revenue (full window) ──");
  const { data, error } = await db.rpc("groomer_revenue", {
    p_store_ids: ["wp", "wg", "lv", "wm"], p_start: null, p_end: null,
  });
  if (error) {
    console.log(`  ⚠ RPC missing (${error.message}) — apply migration 0010`);
    totalFails++;
  } else {
    const js = new Map(); // store|name -> rev
    for (const i of live) {
      const sp = (i.sales_person ?? "").trim();
      if (!sp || !i.svc) continue;
      const k = `${i.store_id}|${sp}`;
      js.set(k, (js.get(k) ?? 0) + i.rev);
    }
    const top = [...data].sort((a, b) => num(b.revenue) - num(a.revenue)).slice(0, 6);
    for (const r of top) {
      const jsRev = js.get(`${r.store_id}|${r.name}`) ?? 0;
      check(`${r.store_id} ${r.name}`, Math.abs(jsRev - num(r.revenue)) <= 1, `js=$${Math.round(jsRev).toLocaleString()} db=$${Math.round(num(r.revenue)).toLocaleString()}`);
    }
    const jsTotal = [...js.values()].reduce((a, b) => a + b, 0);
    const dbTotal = data.reduce((a, r) => a + num(r.revenue), 0);
    check("total groomer revenue", Math.abs(jsTotal - dbTotal) <= 1, `js=${jsTotal.toFixed(2)} db=${dbTotal.toFixed(2)}`);
  }
}

// ── customer spans (global per id, walk-in pairs + passthrough excluded) ─────
const span = new Map(); // customer_id -> {first,last,days:Set}
for (const i of live) {
  if (i.customer_id == null || isWalkin(i.store_id, i.customer_id)) continue;
  const e = span.get(i.customer_id) ?? { first: i.item_date, last: i.item_date, days: new Set() };
  if (i.item_date < e.first) e.first = i.item_date;
  if (i.item_date > e.last) e.last = i.item_date;
  e.days.add(i.item_date);
  span.set(i.customer_id, e);
}

// ── retention_summary vs JS (customers-table grain, all stores) ─────────────
{
  console.log("\n── retention_summary (all stores) ──");
  const { data, error } = await db.rpc("retention_summary", { p_store_ids: ["wp", "wg", "lv", "wm"] });
  if (error) {
    console.log(`  ⚠ RPC missing (${error.message}) — apply migration 0010`);
    totalFails++;
  } else {
    const today = new Date().toISOString().slice(0, 10);
    let total = 0, eligible90 = 0, returning90 = 0, oneDone = 0, cadSum = 0, cadN = 0;
    for (const e of span.values()) {
      const v = e.days.size;
      total++;
      if (daysBetween(e.first, today) >= 90) {
        eligible90++;
        if (v >= 2) returning90++;
      }
      if (v === 1 && daysBetween(e.last, today) >= 90) oneDone++;
      if (v >= 2) { cadSum += daysBetween(e.first, e.last) / (v - 1); cadN++; }
    }
    const s = data[0];
    check("total customers", num(s.total_customers) === total, `js=${total} db=${s.total_customers}`);
    check("eligible (90d+)", num(s.eligible90) === eligible90, `js=${eligible90} db=${s.eligible90}`);
    check("returning", num(s.returning90) === returning90, `js=${returning90} db=${s.returning90}`);
    check("one-and-done", num(s.one_and_done90) === oneDone, `js=${oneDone} db=${s.one_and_done90}`);
    check("avg cadence", Math.abs(num(s.avg_cadence_days) - cadSum / cadN) < 0.5, `js=${(cadSum / cadN).toFixed(1)}d db=${num(s.avg_cadence_days).toFixed(1)}d`);
    console.log(`  → returning share ${(returning90 / eligible90 * 100).toFixed(1)}% · cadence ${(cadSum / cadN).toFixed(1)}d · one-and-done ${oneDone.toLocaleString()}`);
  }
}

// ── cohort_monthly vs JS (per store+customer pairs, 90-day warm-up) ─────────
{
  console.log("\n── cohort_monthly ──");
  const { data, error } = await db.from("cohort_monthly").select("store_id, month_offset, eligible, retained");
  if (error || !data?.length) {
    console.log(`  ⚠ table missing/empty (${error?.message ?? "no rows"}) — apply migration 0010 + re-roll`);
    totalFails++;
  } else {
    const entryStart = new Date(Date.parse(`${MIN_DATE}T00:00:00Z`) + 90 * 86400000).toISOString().slice(0, 10);
    const pairSpan = new Map(); // store|cust -> {first,last}
    for (const i of live) {
      if (i.customer_id == null || isWalkin(i.store_id, i.customer_id)) continue;
      const k = `${i.store_id}|${i.customer_id}`;
      const e = pairSpan.get(k) ?? { first: i.item_date, last: i.item_date };
      if (i.item_date < e.first) e.first = i.item_date;
      if (i.item_date > e.last) e.last = i.item_date;
      pairSpan.set(k, e);
    }
    const today = new Date().toISOString().slice(0, 10);
    const agg = new Map();
    for (const r of data) {
      const o = agg.get(r.month_offset) ?? { e: 0, r: 0 };
      o.e += num(r.eligible);
      o.r += num(r.retained);
      agg.set(r.month_offset, o);
    }
    for (const k of [0, 1, 3, 6]) {
      let eligible = 0, retained = 0;
      for (const e of pairSpan.values()) {
        if (e.first < entryStart) continue;
        if (daysBetween(e.first, today) >= k * 30) {
          eligible++;
          if (daysBetween(e.first, e.last) >= k * 30) retained++;
        }
      }
      const d = agg.get(k) ?? { e: -1, r: -1 };
      check(`offset ${k}`, d.e === eligible && d.r === retained, `js=${retained}/${eligible} db=${d.r}/${d.e} (${d.e > 0 ? ((d.r / d.e) * 100).toFixed(0) : "?"}%)`);
    }
  }
}

// ── customers table hygiene ──────────────────────────────────────────────────
{
  console.log("\n── customers table ──");
  const { count: giants } = await db.from("customers").select("*", { count: "exact", head: true }).gte("visits", 300);
  check("walk-in accounts swept", (giants ?? 0) === 0, `${giants} rows with 300+ visits remain`);
  const { count: active } = await db.from("customers").select("*", { count: "exact", head: true }).gte("visits", 1);
  console.log(`  active customers (visits ≥ 1): ${active?.toLocaleString()}`);
}

console.log(`\n${totalFails ? `✖ ${totalFails} comparison failures` : "✓ all checks pass — JS replica matches the database"}`);
process.exit(totalFails ? 1 : 0);
