-- Migration 0007 — franpos_rollup v2 (performance rewrite).
--
-- v1 timed out on real volume (~46k orders / 92k lines): rebooks and groomer
-- return-rates used correlated EXISTS subqueries (one probe per order /
-- customer). v2 computes both set-based with window functions / pre-aggregated
-- joins. Same signature, same definitions, same outputs — only faster.
--
-- Also bumps the service-role statement timeout: the role only runs our own
-- ingestion (never browser traffic), and 8s is tight for full-year rollups.
alter role service_role set statement_timeout = '120s';

create or replace function franpos_rollup(p_start date, p_end date)
returns table (metrics_rows integer, product_rows integer, customer_rows integer, groomer_rows integer)
language plpgsql as $$
declare
  v_metrics integer; v_products integer; v_customers integer; v_groomers integer;
begin
  -- metrics_daily ------------------------------------------------------------
  with items as (
    select i.client_id, i.store_id, i.item_date as d, i.order_id, i.customer_id,
           i.price * i.quantity - i.discount as line_rev,
           franpos_item_is_service(i.sku, i.cost) as is_service
    from franpos_order_items i
    where i.item_date between p_start and p_end
  ),
  line_rev as (
    select client_id, store_id, d,
           sum(line_rev) filter (where is_service)     as grooming_rev,
           sum(line_rev) filter (where not is_service) as retail_rev
    from items group by 1, 2, 3
  ),
  order_flags as (
    select client_id, store_id, d, order_id,
           bool_or(is_service) as has_service, bool_or(not is_service) as has_product
    from items group by 1, 2, 3, 4
  ),
  order_agg as (
    select client_id, store_id, d,
           count(*) filter (where has_service) as bookings,
           count(*) filter (where has_service and has_product) as retail_attached
    from order_flags group by 1, 2, 3
  ),
  -- Rebooks (return-within-90d), set-based: one row per service order across
  -- ALL staging (not just the range, so chunked calls stay correct), LEAD()
  -- gives each customer's next service visit; count the ones within 90 days.
  svc_orders as (
    select distinct i.client_id, i.store_id, i.customer_id, i.order_id, i.item_date as d
    from franpos_order_items i
    where i.customer_id is not null and franpos_item_is_service(i.sku, i.cost)
  ),
  svc_next as (
    select client_id, store_id, d,
           lead(d) over (partition by store_id, customer_id order by d, order_id) as next_d
    from svc_orders
  ),
  rebook_by_day as (
    select client_id, store_id, d, count(*) filter (where next_d <= d + 90) as rebooks
    from svc_next
    where d between p_start and p_end
    group by 1, 2, 3
  ),
  merged as (
    select coalesce(l.client_id, a.client_id) as client_id,
           coalesce(l.store_id, a.store_id)   as store_id,
           coalesce(l.d, a.d)                 as d,
           coalesce(l.grooming_rev, 0) as grooming_rev,
           coalesce(l.retail_rev, 0)   as retail_rev,
           coalesce(a.bookings, 0)        as bookings,
           coalesce(a.retail_attached, 0) as retail_attached,
           coalesce(r.rebooks, 0)         as rebooks
    from line_rev l
    full outer join order_agg a on a.client_id = l.client_id and a.store_id = l.store_id and a.d = l.d
    left join rebook_by_day r on r.client_id = coalesce(l.client_id, a.client_id)
                             and r.store_id = coalesce(l.store_id, a.store_id)
                             and r.d = coalesce(l.d, a.d)
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

  -- groomers: customer visit counts pre-aggregated once, joined (no EXISTS) ---
  with svc as (
    select i.client_id, i.store_id, trim(i.sales_person) as name, i.order_id, i.customer_id,
           i.price * i.quantity - i.discount as line_rev,
           franpos_item_is_service(i.sku, i.cost) as is_service
    from franpos_order_items i
    where nullif(trim(i.sales_person), '') is not null
  ),
  flags as (
    select store_id, order_id, bool_or(not is_service) as has_product
    from svc group by 1, 2
  ),
  cust_visits as (
    select customer_id, count(distinct order_date) as visits
    from franpos_orders where customer_id is not null group by 1
  ),
  per as (
    select s.client_id, s.store_id, s.name,
           count(distinct s.order_id) as appts,
           sum(s.line_rev) as rev,
           count(distinct s.order_id) filter (where f.has_product) as attached,
           count(distinct s.customer_id) as custs,
           count(distinct s.customer_id) filter (where cv.visits >= 2) as returning_custs
    from svc s
    join flags f on f.store_id = s.store_id and f.order_id = s.order_id
    left join cust_visits cv on cv.customer_id = s.customer_id
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
  where appts >= 5
  on conflict (id) do update set
    name = excluded.name, appts = excluded.appts, avg_ticket = excluded.avg_ticket,
    attach = excluded.attach, rebook = excluded.rebook, synced_at = now();
  get diagnostics v_groomers = row_count;

  return query select v_metrics, v_products, v_customers, v_groomers;
end $$;

revoke execute on function franpos_rollup(date, date) from anon, authenticated;
