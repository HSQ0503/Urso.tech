-- Migration 0006 — FranPOS staging + rollups (the real-data pipeline).
--
-- Raw FranPOS rows land here ONCE (quota is metered: 1,000 calls/store/month),
-- then SQL rollups recompute metrics_daily / customers / groomers /
-- product_sales_daily from our own rows. When a metric definition changes we
-- re-run the rollup — we never re-fetch. Field semantics are documented in
-- supabase/FRANPOS_FIELD_MAP.md (built from live Windermere payloads).
--
-- Filled by scripts/franpos-backfill.mjs (12-month history) and later the
-- 2×-daily incremental sync. Both write with the service-role key.

-- ── 1. Raw order headers ────────────────────────────────────────────────────
-- One row per FranPOS order. SubTotal is the sales figure (pre-tax, pre-tip).
create table if not exists franpos_orders (
  order_id             bigint primary key,            -- FranPOS OrderId
  client_id            uuid not null references clients(id) on delete cascade,
  store_id             text not null references stores(id)  on delete cascade,
  franpos_location_id  integer not null,              -- 202683..202686
  customer_id          bigint,
  employee_id          bigint,                        -- cashier, not the groomer
  created_on           timestamp not null,            -- store-local clock
  order_date           date generated always as ((created_on)::date) stored,
  sub_total            numeric(12,2) not null default 0,
  discount_total       numeric(12,2) not null default 0,
  tax_total            numeric(12,2) not null default 0,
  tips                 numeric(12,2) not null default 0,
  total                numeric(12,2) not null default 0,
  shipping_option      text,                          -- "In-store" vs pickup/delivery = channel proxy
  receipt_number       text,
  company_order_number integer,
  synced_at            timestamptz not null default now()
);
create index if not exists franpos_orders_store_date_idx on franpos_orders (store_id, order_date);
create index if not exists franpos_orders_customer_idx   on franpos_orders (customer_id);

-- ── 2. Raw order lines ──────────────────────────────────────────────────────
-- One row per line item. Cost is populated for retail (real COGS); SalesPerson
-- is the groomer/cashier who rang the line — groomer attribution lives here.
create table if not exists franpos_order_items (
  order_item_id       bigint primary key,             -- FranPOS OrderItemId
  order_id            bigint not null,                -- no FK: items page can land before its order page
  client_id           uuid not null references clients(id) on delete cascade,
  store_id            text not null references stores(id)  on delete cascade,
  franpos_location_id integer not null,
  customer_id         bigint,
  created_on          timestamp not null,
  item_date           date generated always as ((created_on)::date) stored,
  name                text not null,
  sku                 text,
  price               numeric(12,4) not null default 0,
  quantity            numeric(12,2) not null default 1,
  cost                numeric(12,4) not null default 0,
  discount            numeric(12,4) not null default 0,
  sales_person        text,
  shipping_option     text,
  return_disposition  text,
  return_reason       text,
  synced_at           timestamptz not null default now()
);
create index if not exists franpos_items_store_date_idx on franpos_order_items (store_id, item_date);
create index if not exists franpos_items_order_idx      on franpos_order_items (order_id);
create index if not exists franpos_items_customer_idx   on franpos_order_items (customer_id, item_date);

-- ── 3. Product rollup (the Products page) ───────────────────────────────────
-- Per store/day/SKU: units, revenue, cost. Winners/losers, margin, velocity,
-- dead stock all read from here.
create table if not exists product_sales_daily (
  client_id  uuid not null references clients(id) on delete cascade,
  store_id   text not null references stores(id)  on delete cascade,
  date       date not null,
  sku        text not null,
  name       text not null,
  is_service boolean not null,
  units      numeric(12,2) not null default 0,
  revenue    numeric(12,2) not null default 0,
  cost       numeric(12,2) not null default 0,
  primary key (store_id, date, sku)
);
create index if not exists product_sales_client_date_idx on product_sales_daily (client_id, date);

-- ── 4. Service-vs-retail heuristic (ONE definition — the iron rule) ─────────
-- FranPOS's catalog `type` field isn't reachable yet (endpoint 405s), so v1
-- classifies from the line itself: retail items carry a 6+ digit barcode SKU
-- or a real unit cost; services ("Nail Grind", "Full Groom") have text SKUs and
-- Cost = 0. Refine HERE when catalog access lands, then re-run franpos_rollup —
-- every metric picks up the new definition.
create or replace function franpos_item_is_service(p_sku text, p_cost numeric)
returns boolean language sql immutable as $$
  select not (coalesce(p_sku, '') ~ '^[0-9]{6,}$' or coalesce(p_cost, 0) > 0)
$$;

-- ── 5. The rollup ───────────────────────────────────────────────────────────
-- Recomputes everything FranPOS-sourced for [p_start, p_end] from staging:
--   metrics_daily  — revenue (= grooming + retail line revenue, post line
--                    discount), bookings (orders with ≥1 service line),
--                    retail_attached (service orders that also bought retail),
--                    rebooks (service orders whose customer returned for
--                    another service within 90 days — a RETURN measure; the
--                    most recent ~90 days under-report by construction)
--   product_sales_daily — per-SKU rollup
--   customers      — visits/ltv/first/last/segment (identity name/pet is
--                    upserted separately by the sync from the customers feed)
--   groomers       — appts/avg_ticket/attach/rebook from service lines
--                    (rev_per_hr + util stay 0 until the timeclocks feed)
-- Touches ONLY FranPOS columns of metrics_daily — Twilio/GA4 columns are
-- preserved on conflict.
create or replace function franpos_rollup(p_start date, p_end date)
returns table (metrics_rows integer, product_rows integer, customer_rows integer, groomer_rows integer)
language plpgsql as $$
declare
  v_metrics integer; v_products integer; v_customers integer; v_groomers integer;
begin
  -- metrics_daily ------------------------------------------------------------
  with items as (
    select i.*, franpos_item_is_service(i.sku, i.cost) as is_service
    from franpos_order_items i
    where i.item_date between p_start and p_end
  ),
  line_rev as (
    select client_id, store_id, item_date as d,
           sum(case when is_service     then price * quantity - discount else 0 end) as grooming_rev,
           sum(case when not is_service then price * quantity - discount else 0 end) as retail_rev
    from items group by 1, 2, 3
  ),
  order_flags as (
    select client_id, store_id, item_date as d, order_id, max(customer_id) as customer_id,
           bool_or(is_service) as has_service, bool_or(not is_service) as has_product
    from items group by 1, 2, 3, 4
  ),
  order_agg as (
    select o.client_id, o.store_id, o.d,
           count(*) filter (where o.has_service) as bookings,
           count(*) filter (where o.has_service and o.has_product) as retail_attached,
           count(*) filter (where o.has_service and exists (
             select 1 from franpos_order_items n
             where n.customer_id = o.customer_id and n.store_id = o.store_id
               and n.item_date > o.d and n.item_date <= o.d + 90
               and franpos_item_is_service(n.sku, n.cost)
           )) as rebooks
    from order_flags o group by 1, 2, 3
  ),
  merged as (
    select coalesce(l.client_id, a.client_id) as client_id,
           coalesce(l.store_id, a.store_id)   as store_id,
           coalesce(l.d, a.d)                 as d,
           coalesce(l.grooming_rev, 0) as grooming_rev,
           coalesce(l.retail_rev, 0)   as retail_rev,
           coalesce(a.bookings, 0) as bookings,
           coalesce(a.retail_attached, 0) as retail_attached,
           coalesce(a.rebooks, 0) as rebooks
    from line_rev l full outer join order_agg a
      on a.client_id = l.client_id and a.store_id = l.store_id and a.d = l.d
  )
  insert into metrics_daily (client_id, store_id, date, revenue, grooming_revenue,
                             retail_revenue, bookings, rebooks, retail_attached, synced_at)
  select client_id, store_id, d, grooming_rev + retail_rev, grooming_rev, retail_rev,
         bookings, rebooks, retail_attached, now()
  from merged
  on conflict (store_id, date) do update set
    revenue          = excluded.revenue,
    grooming_revenue = excluded.grooming_revenue,
    retail_revenue   = excluded.retail_revenue,
    bookings         = excluded.bookings,
    rebooks          = excluded.rebooks,
    retail_attached  = excluded.retail_attached,
    synced_at        = now();
  get diagnostics v_metrics = row_count;

  -- product_sales_daily -------------------------------------------------------
  delete from product_sales_daily where date between p_start and p_end;
  insert into product_sales_daily (client_id, store_id, date, sku, name, is_service, units, revenue, cost)
  select client_id, store_id, item_date, coalesce(nullif(sku, ''), name), max(name),
         bool_or(franpos_item_is_service(sku, cost)),
         sum(quantity), sum(price * quantity - discount), sum(cost * quantity)
  from franpos_order_items
  where item_date between p_start and p_end
  group by client_id, store_id, item_date, coalesce(nullif(sku, ''), name);
  get diagnostics v_products = row_count;

  -- customers (stats only — identity name/pet comes from the customers feed) --
  -- Segments (v1, defined once): Lapsed >120d since last visit · At risk
  -- 60–120d · VIP = ltv ≥ $1,200 or 12+ visits · else Loyal.
  insert into customers (id, client_id, store_id, name, visits, ltv, first_visit_at, last_visit_at, segment, synced_at)
  select o.customer_id::text, o.client_id, max(o.store_id), '—',
         count(distinct o.order_date),
         sum(o.sub_total),
         min(o.order_date), max(o.order_date),
         case
           when max(o.order_date) < current_date - 120 then 'Lapsed'
           when max(o.order_date) < current_date - 60  then 'At risk'
           when sum(o.sub_total) >= 1200 or count(distinct o.order_date) >= 12 then 'VIP'
           else 'Loyal'
         end,
         now()
  from franpos_orders o
  where o.customer_id is not null
  group by o.customer_id, o.client_id
  on conflict (id) do update set
    visits = excluded.visits, ltv = excluded.ltv,
    first_visit_at = excluded.first_visit_at, last_visit_at = excluded.last_visit_at,
    segment = excluded.segment, synced_at = now();
  get diagnostics v_customers = row_count;

  -- groomers (from service lines; id = store:name since the API gives the name)
  with svc as (
    select i.*, franpos_item_is_service(i.sku, i.cost) as is_service
    from franpos_order_items i
    where nullif(trim(i.sales_person), '') is not null
  ),
  flags as (
    select store_id, order_id, bool_or(not is_service) as has_product
    from svc group by 1, 2
  ),
  per as (
    select s.client_id, s.store_id, trim(s.sales_person) as name,
           count(distinct s.order_id) as appts,
           sum(s.price * s.quantity - s.discount) as rev,
           count(distinct s.order_id) filter (where f.has_product) as attached,
           count(distinct s.customer_id) as custs,
           count(distinct s.customer_id) filter (where exists (
             select 1 from franpos_orders o2
             where o2.customer_id = s.customer_id
             group by o2.customer_id having count(distinct o2.order_date) >= 2
           )) as returning_custs
    from svc s join flags f on f.store_id = s.store_id and f.order_id = s.order_id
    where s.is_service
    group by 1, 2, 3
  )
  insert into groomers (id, client_id, store_id, name, appts, avg_ticket, attach, rebook, rev_per_hr, util, synced_at)
  select store_id || ':' || lower(replace(name, ' ', '-')), client_id, store_id, name,
         appts, round(rev / nullif(appts, 0), 2),
         round(attached::numeric / nullif(appts, 0), 3),
         round(returning_custs::numeric / nullif(custs, 0), 3),
         0, 0, now()
  from per
  where appts >= 5  -- skip one-off cashiers who rang a single service
  on conflict (id) do update set
    name = excluded.name, appts = excluded.appts, avg_ticket = excluded.avg_ticket,
    attach = excluded.attach, rebook = excluded.rebook, synced_at = now();
  get diagnostics v_groomers = row_count;

  return query select v_metrics, v_products, v_customers, v_groomers;
end $$;

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Staging tables: RLS on, NO read policies — only the service-role sync touches
-- them. product_sales_daily gets the same temp public read as the other
-- dashboard tables (replaced in the auth phase).
alter table franpos_orders      enable row level security;
alter table franpos_order_items enable row level security;
alter table product_sales_daily enable row level security;

create policy "temp read — replace in auth phase" on product_sales_daily for select using (true);

-- Rollup writes data — keep it away from anon/browser callers.
revoke execute on function franpos_rollup(date, date) from anon, authenticated;
