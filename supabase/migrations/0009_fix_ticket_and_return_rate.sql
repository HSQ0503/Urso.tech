-- Migration 0009 — honest avg ticket + uncensored return rate.
--
-- Audit findings (2026-06-12, real data):
-- 1. "Avg ticket" divided ALL revenue (incl. retail-only treat tickets) by
--    grooming bookings only → $134 shown vs $95 true visit value (+41%).
--    Fix: new metrics_daily.booking_revenue = revenue on tickets containing a
--    grooming service; avg ticket = booking_revenue / bookings.
-- 2. "Rebooks" looked FORWARD 90 days, so recent periods read low purely
--    because the window hasn't elapsed (Dec 75% → May 26% → Jun 12% on
--    identical behavior). Fix: count a visit as a RETURN if the customer's
--    PREVIOUS service visit was within the 90 days BEFORE it — stable for any
--    period including the current month. UI relabels "Rebook rate" → "Return
--    rate"; true checkout-rebook lands with the booking feed later.

alter table metrics_daily add column if not exists booking_revenue numeric(12,2) not null default 0;

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
      and not franpos_item_is_passthrough(i.name)
  ),
  line_rev as (
    select client_id, store_id, d,
           sum(line_rev) filter (where is_service)     as grooming_rev,
           sum(line_rev) filter (where not is_service) as retail_rev
    from items group by 1, 2, 3
  ),
  order_flags as (
    select client_id, store_id, d, order_id, sum(line_rev) as order_rev,
           bool_or(is_service) as has_service, bool_or(not is_service) as has_product
    from items group by 1, 2, 3, 4
  ),
  order_agg as (
    select client_id, store_id, d,
           count(*) filter (where has_service) as bookings,
           count(*) filter (where has_service and has_product) as retail_attached,
           sum(order_rev) filter (where has_service) as booking_rev
    from order_flags group by 1, 2, 3
  ),
  svc_orders as (
    select distinct i.client_id, i.store_id, i.customer_id, i.order_id, i.item_date as d
    from franpos_order_items i
    where i.customer_id is not null
      and franpos_item_is_service(i.sku, i.cost)
      and not franpos_item_is_passthrough(i.name)
  ),
  svc_prev as (
    select client_id, store_id, d,
           lag(d) over (partition by store_id, customer_id order by d, order_id) as prev_d
    from svc_orders
  ),
  return_by_day as (
    select client_id, store_id, d, count(*) filter (where prev_d >= d - 90) as rebooks
    from svc_prev
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
           coalesce(a.booking_rev, 0)     as booking_rev,
           coalesce(r.rebooks, 0)         as rebooks
    from line_rev l
    full outer join order_agg a on a.client_id = l.client_id and a.store_id = l.store_id and a.d = l.d
    left join return_by_day r on r.client_id = coalesce(l.client_id, a.client_id)
                             and r.store_id = coalesce(l.store_id, a.store_id)
                             and r.d = coalesce(l.d, a.d)
  )
  insert into metrics_daily (client_id, store_id, date, revenue, grooming_revenue,
                             retail_revenue, booking_revenue, bookings, rebooks, retail_attached, synced_at)
  select client_id, store_id, d, grooming_rev + retail_rev, grooming_rev, retail_rev,
         booking_rev, bookings, rebooks, retail_attached, now()
  from merged
  on conflict (store_id, date) do update set
    revenue          = excluded.revenue,
    grooming_revenue = excluded.grooming_revenue,
    retail_revenue   = excluded.retail_revenue,
    booking_revenue  = excluded.booking_revenue,
    bookings         = excluded.bookings,
    rebooks          = excluded.rebooks,
    retail_attached  = excluded.retail_attached,
    synced_at        = now();
  get diagnostics v_metrics = row_count;

  -- product_sales_daily -------------------------------------------------------
  delete from product_sales_daily where date between p_start and p_end;
  insert into product_sales_daily (client_id, store_id, date, sku, name, is_service, is_passthrough, units, revenue, cost)
  select client_id, store_id, item_date, coalesce(nullif(sku, ''), name), max(name),
         bool_or(franpos_item_is_service(sku, cost)),
         bool_or(franpos_item_is_passthrough(name)),
         sum(quantity), sum(price * quantity - discount), sum(cost * quantity)
  from franpos_order_items
  where item_date between p_start and p_end
  group by client_id, store_id, item_date, coalesce(nullif(sku, ''), name);
  get diagnostics v_products = row_count;

  -- customers ------------------------------------------------------------------
  with spend as (
    select i.customer_id, i.client_id, max(i.store_id) as store_id,
           count(distinct i.item_date) as visits,
           sum(i.price * i.quantity - i.discount) as ltv,
           min(i.item_date) as first_visit,
           max(i.item_date) as last_visit
    from franpos_order_items i
    where i.customer_id is not null
      and not franpos_item_is_passthrough(i.name)
    group by i.customer_id, i.client_id
  )
  insert into customers (id, client_id, store_id, name, visits, ltv, first_visit_at, last_visit_at, segment, synced_at)
  select customer_id::text, client_id, store_id, '—', visits, ltv, first_visit, last_visit,
         case
           when last_visit < current_date - 120 then 'Lapsed'
           when last_visit < current_date - 60  then 'At risk'
           when ltv >= 1200 or visits >= 12 then 'VIP'
           else 'Loyal'
         end,
         now()
  from spend
  on conflict (id) do update set
    visits = excluded.visits, ltv = excluded.ltv,
    first_visit_at = excluded.first_visit_at, last_visit_at = excluded.last_visit_at,
    segment = excluded.segment, synced_at = now();
  get diagnostics v_customers = row_count;

  -- groomers --------------------------------------------------------------------
  with svc as (
    select i.client_id, i.store_id, trim(i.sales_person) as name, i.order_id, i.customer_id,
           i.price * i.quantity - i.discount as line_rev,
           franpos_item_is_service(i.sku, i.cost) as is_service
    from franpos_order_items i
    where nullif(trim(i.sales_person), '') is not null
      and not franpos_item_is_passthrough(i.name)
  ),
  flags as (
    select store_id, order_id, bool_or(not is_service) as has_product
    from svc group by 1, 2
  ),
  cust_visits as (
    select customer_id, count(distinct item_date) as visits
    from franpos_order_items
    where customer_id is not null and not franpos_item_is_passthrough(name)
    group by 1
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

-- metrics_by_store gains booking_revenue (return type changes → drop first).
drop function if exists metrics_by_store(date, date);
create function metrics_by_store(p_start date default null, p_end date default null)
returns table (
  store_id text, revenue numeric, grooming_revenue numeric, retail_revenue numeric, booking_revenue numeric,
  bookings bigint, no_shows bigint, rebooks bigint, retail_attached bigint,
  calls_total bigint, calls_missed bigint, web_visits bigint, web_form_starts bigint,
  web_form_completes bigint, web_booked bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.store_id,
    sum(m.revenue), sum(m.grooming_revenue), sum(m.retail_revenue), sum(m.booking_revenue),
    sum(m.bookings), sum(m.no_shows), sum(m.rebooks), sum(m.retail_attached),
    sum(m.calls_total), sum(m.calls_missed), sum(m.web_visits), sum(m.web_form_starts),
    sum(m.web_form_completes), sum(m.web_booked)
  from metrics_daily m
  where (p_start is null or m.date >= p_start)
    and (p_end   is null or m.date <  p_end)
  group by m.store_id;
$$;

grant execute on function metrics_by_store(date, date) to anon, authenticated;
