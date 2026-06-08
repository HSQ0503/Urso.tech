// Quick sanity check: connect to Supabase with the project's env keys and read
// the seeded metrics_daily rows. Proves the data pipe end-to-end (keys →
// connection → RLS read → data) without the Next app.
//   Run:  node scripts/check-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Load .env.local with no dependency, so this works on any Node version.
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);
const NAMES = { wp: "Winter Park", wg: "Winter Garden", lv: "Lakeside Village", wm: "Windermere" };

const { data, error } = await supabase.from("metrics_daily").select("store_id, revenue, bookings");
if (error) {
  console.error("✖ Query failed:", error.message);
  process.exit(1);
}
if (!data.length) {
  console.log("\n⚠ Connected fine, but metrics_daily is EMPTY — run supabase/seed_metrics_sample.sql first.\n");
  process.exit(0);
}

const agg = {};
for (const r of data) {
  (agg[r.store_id] ??= { days: 0, revenue: 0, bookings: 0 });
  agg[r.store_id].days += 1;
  agg[r.store_id].revenue += Number(r.revenue);
  agg[r.store_id].bookings += r.bookings;
}

console.log(`\n✓ Connected to Supabase — read ${data.length} rows from metrics_daily\n`);
for (const id of ["wp", "wg", "lv", "wm"]) {
  const a = agg[id];
  if (!a) {
    console.log(`  ${NAMES[id]}: no rows`);
    continue;
  }
  console.log(
    `  ${NAMES[id].padEnd(18)} ${String(a.days).padStart(3)} days   ` +
      `$${Math.round(a.revenue).toLocaleString().padStart(9)} revenue   ` +
      `${a.bookings.toLocaleString().padStart(6)} bookings`,
  );
}
// Entity tables (seeded by seed_entities.sql)
console.log("");
for (const t of ["groomers", "customers", "store_listings", "agent_actions"]) {
  const { count, error: e } = await supabase.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t.padEnd(16)} ${e ? "✖ " + e.message : (count ?? 0) + " rows"}`);
}
console.log("");
