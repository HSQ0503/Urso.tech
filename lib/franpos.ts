import { createAdminClient } from "@/lib/supabase/admin";

// FranPOS incremental sync — the recurring half of the pipeline. The one-time
// history load is scripts/franpos-backfill.mjs; this pulls just the last few
// days per store (≈3–5 calls each), upserts into the same staging tables, and
// re-runs franpos_rollup() so the dashboard tables stay current.
//
// Field semantics + gotchas (0-indexed pages, no colons in URL paths, quota):
// supabase/FRANPOS_FIELD_MAP.md. Quota: 1,000 successful calls/store/month —
// two runs a day costs ~200–300/store/month.

const BASE = "https://publicapi.franpos.com/api";
const PAGE_SIZE = 500;
const PULL_DAYS = 3; // re-pull a small overlap so missed runs self-heal
const ROLLUP_DAYS = 100; // re-roll further back: new visits change rebooks/segments retroactively

const STORES = [
  { id: "wp", loc: 202683, tokenEnv: "FRANPOS_TOKEN_WP" },
  { id: "wg", loc: 202685, tokenEnv: "FRANPOS_TOKEN_WG" },
  { id: "lv", loc: 202686, tokenEnv: "FRANPOS_TOKEN_LV" },
  { id: "wm", loc: 202684, tokenEnv: "FRANPOS_TOKEN_WM" },
] as const;

type StoreSync = { id: string; orders: number; items: number; customers: number; skipped?: string };
export type SyncSummary = {
  stores: StoreSync[];
  rollup: { metrics_rows: number; product_rows: number; customer_rows: number; groomer_rows: number } | null;
  calls: number;
  ms: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10); // date-only — FranPOS WAF rejects ':' in paths
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

async function fetchJson(u: string, calls: { n: number }): Promise<Record<string, unknown>> {
  const ATTEMPTS = 4;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(40_000) });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && body) {
        calls.n++;
        return body;
      }
      lastErr = new Error(`franpos ${res.status}: ${JSON.stringify(body)?.slice(0, 150)}`);
    } catch (e) {
      // A network drop or the request timeout ("operation was aborted due to
      // timeout") THROWS here — it must be caught so it's retried like an HTTP
      // error, not bubbled straight up and failing the whole sync on one blip.
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw lastErr ?? new Error("franpos fetch failed (unknown)");
}

// Page through a datadump endpoint. Pages are 0-INDEXED (pages:3 = 0..2).
async function dumpAll(path: string, token: string, fromDate: string, loc: number, calls: { n: number }) {
  const rows: Record<string, unknown>[] = [];
  let pages = 1;
  for (let page = 0; page < pages; page++) {
    const json = await fetchJson(
      `${BASE}/datadump/${path}/30/${page}/${fromDate}/${loc}?pageSize=${PAGE_SIZE}&Token=${token}`,
      calls,
    );
    pages = Math.min(num(json.pages) || 1, 50);
    const data = json.data;
    if (Array.isArray(data)) rows.push(...data);
    if (!Array.isArray(data) || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function syncFranpos(): Promise<SyncSummary> {
  const t0 = Date.now();
  const calls = { n: 0 };
  const db = createAdminClient();

  const { data: clientRow, error: clientErr } = await db.from("clients").select("id").eq("slug", "woof-gang").single();
  if (clientErr || !clientRow) throw new Error(`client lookup failed: ${clientErr?.message}`);
  const clientId = clientRow.id as string;
  const fromDate = iso(daysAgo(PULL_DAYS));

  const stores: StoreSync[] = [];
  for (const store of STORES) {
    const token = process.env[store.tokenEnv];
    if (!token) {
      stores.push({ id: store.id, orders: 0, items: 0, customers: 0, skipped: `missing ${store.tokenEnv}` });
      continue;
    }
    const base = { client_id: clientId, store_id: store.id, franpos_location_id: store.loc };

    const orders = (await dumpAll("v1/orders", token, fromDate, store.loc, calls))
      .filter((o) => o.OrderId != null)
      .map((o) => ({
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
      }));

    const items = (await dumpAll("v2/orderitems", token, fromDate, store.loc, calls))
      .filter((i) => i.OrderItemId != null)
      .map((i) => ({
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
      }));

    // New/changed customer identities (pet = FirstName, owner = LastName);
    // the feed includes employees — rows without CustomerId are skipped.
    const identities = (await dumpAll("v1/customers", token, fromDate, store.loc, calls))
      .filter((c) => c.CustomerId != null)
      .map((c) => {
        const owner = String(c.LastName ?? "").trim();
        const pet = String(c.FirstName ?? "").trim();
        return {
          id: String(c.CustomerId),
          client_id: clientId,
          store_id: store.id,
          name: owner || pet || "—",
          pet: pet || null,
        };
      });

    for (const [table, rows, key] of [
      ["franpos_orders", orders, "order_id"],
      ["franpos_order_items", items, "order_item_id"],
      ["customers", identities, "id"],
    ] as const) {
      // Dedupe within the batch — PostgREST rejects double-hits on one key.
      const unique = [...new Map(rows.map((r) => [r[key as keyof typeof r], r])).values()];
      for (let i = 0; i < unique.length; i += 500) {
        const { error } = await db.from(table).upsert(unique.slice(i, i + 500), { onConflict: key });
        if (error) throw new Error(`${table} upsert (${store.id}): ${error.message}`);
      }
    }
    stores.push({ id: store.id, orders: orders.length, items: items.length, customers: identities.length });
  }

  const { data: roll, error: rollErr } = await db.rpc("franpos_rollup", {
    p_start: iso(daysAgo(ROLLUP_DAYS)),
    p_end: iso(new Date()),
  });
  if (rollErr) throw new Error(`rollup failed: ${rollErr.message}`);

  return {
    stores,
    rollup: (Array.isArray(roll) ? roll[0] : roll) ?? null,
    calls: calls.n,
    ms: Date.now() - t0,
  };
}
