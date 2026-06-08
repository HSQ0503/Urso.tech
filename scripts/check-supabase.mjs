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

const { count } = await supabase.from("metrics_daily").select("*", { count: "exact", head: true });
// Aggregate in the DB (avoids the 1,000-row response cap on raw selects).
const { data, error } = await supabase.rpc("metrics_by_store");
if (error) {
  console.error("✖ metrics_by_store failed:", error.message, "\n  (run supabase/migrations/0003_aggregate_functions.sql)");
  process.exit(1);
}
if (!data || !data.length) {
  console.log("\n⚠ Connected fine, but metrics_daily is EMPTY — run supabase/seed_metrics_sample.sql first.\n");
  process.exit(0);
}

const byId = Object.fromEntries(data.map((r) => [r.store_id, r]));
console.log(`\n✓ Connected to Supabase — metrics_daily has ${count} rows (aggregated in-DB)\n`);
for (const id of ["wp", "wg", "lv", "wm"]) {
  const r = byId[id];
  if (!r) {
    console.log(`  ${NAMES[id]}: no rows`);
    continue;
  }
  console.log(
    `  ${NAMES[id].padEnd(18)} ` +
      `$${Math.round(Number(r.revenue)).toLocaleString().padStart(9)} revenue   ` +
      `${Number(r.bookings).toLocaleString().padStart(6)} bookings`,
  );
}
// Entity tables (seeded by seed_entities.sql)
console.log("");
for (const t of ["groomers", "customers", "store_listings", "agent_actions", "reviews"]) {
  const { count, error: e } = await supabase.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t.padEnd(16)} ${e ? "✖ " + e.message : (count ?? 0) + " rows"}`);
}
console.log("");
