// Schema-drift health check: verifies every RPC the dashboard + AI depend on
// exists in the live database and reports which are missing (i.e. a migration
// was written but never applied — the store_day_lineitems incident). Read-only,
// no secrets in the response.
//
// Existence comes from the PostgREST OpenAPI root, NOT from probing calls: a
// missing function and an existing function invoked without its required args
// both return PGRST202, so probe-by-call can't tell them apart (and calling an
// unknown function list blind could execute something). The OpenAPI doc lists
// every exposed /rpc/* path, including service-role-only ones, when read with
// the service key. Same approach as scripts/check-drift.mjs (the full gate:
// ledger cross-check + revenue reconciliation).

import { NextResponse } from "next/server";

// Every RPC the app calls at runtime, oldest first. A new migration that adds
// an RPC adds a line here — check-drift.mjs derives its list from the
// migration files, so the two views stay honest against each other.
const EXPECTED_RPCS = [
  "metrics_by_store",
  "metrics_monthly",
  "metrics_series",
  "product_revenue_by_name",
  "groomer_revenue",
  "customer_segment_counts",
  "product_catalog",
  "store_day_lineitems",
  "customer_groomer_affinity",
  "find_customer",
  "customer_profile",
  "groomer_retention",
  "demand_heatmap",
  "discount_analysis",
  "groomer_monthly_revenue",
];

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "supabase env missing" }, { status: 503 });
  }

  let paths: Record<string, unknown>;
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OpenAPI root returned ${res.status}`);
    paths = ((await res.json()) as { paths?: Record<string, unknown> }).paths ?? {};
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `schema listing unreachable: ${e instanceof Error ? e.message : e}` },
      { status: 503 },
    );
  }

  const missing = EXPECTED_RPCS.filter((fn) => !(`/rpc/${fn}` in paths));
  const ok = missing.length === 0;
  if (!ok) console.error(`[drift] /api/health: missing RPCs — ${missing.join(", ")}`);
  return NextResponse.json({ ok, missing, checked: EXPECTED_RPCS.length }, { status: ok ? 200 : 503 });
}
