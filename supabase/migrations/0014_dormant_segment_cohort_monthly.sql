-- Migration 0014 — three fixes surfaced by the 2024 deep backfill:
--
-- 1. DORMANT segment (last visit > 365 days). With 29.5 months of history,
--    "Lapsed" (>120d) had absorbed two-year-old churn — 6,721 customers, 62%
--    of the base — drowning the actionable win-back pool. Now:
--      Dormant >365d · Lapsed 120–365d · At risk 60–120d · then VIP/Loyal.
--    Win-back targets At risk + Lapsed only, so the list is callable again.
-- 2. Cohort depth follows the data. 0010 hardcoded generate_series(0, 11)
--    when 12 months was all the history that existed; the series now extends
--    to the months actually on record (capped at 35 as a chart-width bound).
-- 3. metrics_monthly RPC — monthly per-store aggregates for trend lines
--    (first user: the Customers page return-rate trend). Same shape idea as
--    metrics_by_store, plus a month column; aggregates in the DB so a year of
--    trend never hits PostgREST's row cap.
--
-- Convention: carries the COMPLETE franpos_rollup (v7 = v6 from 0012 + the
-- segment CASE and cohort series changes), so editing "the rollup" always
-- means replacing one self-contained definition.

-- ── 1. Segment domain gains 'Dormant' ────────────────────────────────────────
alter table customers drop constraint if exists customers_segment_check;
alter table customers add constraint customers_segment_check
  check (segment in ('VIP', 'Loyal', 'At risk', 'Lapsed', 'Dormant'));

-- ── 2. metrics_monthly ───────────────────────────────────────────────────────
create or replace function metrics_monthly(p_start date default null, p_end date default null)
returns table (
  store_id text, month date, revenue numeric, grooming_revenue numeric,
  retail_revenue numeric, booking_revenue numeric, bookings bigint,
  identified_bookings bigint, rebooks bigint, tickets_total bigint, retail_attached bigint
)
language sql stable security invoker set search_path = public as $$
  select m.store_id, date_trunc('month', m.date)::date,
         sum(m.revenue), sum(m.grooming_revenue), sum(m.retail_revenue),
         sum(m.booking_revenue), sum(m.bookings), sum(m.identified_bookings),
         sum(m.rebooks), sum(m.tickets_total), sum(m.retail_attached)
  from metrics_daily m
  where (p_start is null or m.date >= p_start)
    and (p_end   is null or m.date <  p_end)
  group by 1, 2
  order by 1, 2
$$;
grant execute on function metrics_monthly(date, date) to anon, authenticated;

-- ── 3. The rollup (v7) ───────────────────────────────────────────────────────
create or replace function franpos_rollup(p_start date, p_end date)
returns table (metrics_rows integer, product_rows integer, customer_rows integer, groomer_rows integer)
language plpgsql as $$
declare
  v_metrics integer; v_products integer; v_customers integer; v_groomers integer;
begin
  -- metrics_daily ------------------------------------------------------------
  with walkins as (
    select * from franpos_walkin_accounts()
  ),
  first_visit as (
    select i.customer_id, min(i.item_date) as first_d
    from franpos_order_items i
    left join walkins w on w.store_id = i.store_id and w.customer_id = i.customer_id
    where i.customer_id is not null
      and not franpos_item_is_passthrough(i.name)
      and w.customer_id is null
    group by 1
  ),
  items as (
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
           max(customer_id) as customer_id,
           bool_or(is_service) as has_service, bool_or(not is_service) as has_product
    from items group by 1, 2, 3, 4
  ),
  order_agg as (
    select o.client_id, o.store_id, o.d,
           count(*) as tickets_total,
           count(*) filter (where o.has_service) as bookings,
           count(*) filter (where o.has_service and fv.customer_id is not null) as identified_bookings,
           count(*) filter (where o.has_service and o.has_product) as retail_attached,
           sum(o.order_rev) filter (where o.has_service) as booking_rev,
           sum(o.order_rev) filter (where fv.customer_id is not null and o.d =  fv.first_d) as new_rev,
           sum(o.order_rev) filter (where fv.customer_id is not null and o.d >  fv.first_d) as repeat_rev
    from order_flags o
    left join first_visit fv on fv.customer_id = o.customer_id
    group by 1, 2, 3
  ),
  svc_orders as (
    select distinct i.client_id, i.store_id, i.customer_id, i.order_id, i.item_date as d
    from franpos_order_items i
    left join walkins w on w.store_id = i.store_id and w.customer_id = i.customer_id
    where i.customer_id is not null
      and w.customer_id is null
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
           coalesce(a.tickets_total, 0)       as tickets_total,
           coalesce(a.bookings, 0)            as bookings,
           coalesce(a.identified_bookings, 0) as identified_bookings,
           coalesce(a.retail_attached, 0)     as retail_attached,
           coalesce(a.booking_rev, 0)     as booking_rev,
           coalesce(a.new_rev, 0)         as new_rev,
           coalesce(a.repeat_rev, 0)      as repeat_rev,
           coalesce(r.rebooks, 0)         as rebooks
    from line_rev l
    full outer join order_agg a on a.client_id = l.client_id and a.store_id = l.store_id and a.d = l.d
    left join return_by_day r on r.client_id = coalesce(l.client_id, a.client_id)
                             and r.store_id = coalesce(l.store_id, a.store_id)
                             and r.d = coalesce(l.d, a.d)
  )
  insert into metrics_daily (client_id, store_id, date, revenue, grooming_revenue,
                             retail_revenue, booking_revenue, tickets_total, new_revenue,
                             repeat_revenue, bookings, identified_bookings, rebooks, retail_attached, synced_at)
  select client_id, store_id, d, grooming_rev + retail_rev, grooming_rev, retail_rev,
         booking_rev, tickets_total, new_rev, repeat_rev, bookings, identified_bookings, rebooks, retail_attached, now()
  from merged
  on conflict (store_id, date) do update set
    revenue             = excluded.revenue,
    grooming_revenue    = excluded.grooming_revenue,
    retail_revenue      = excluded.retail_revenue,
    booking_revenue     = excluded.booking_revenue,
    tickets_total       = excluded.tickets_total,
    new_revenue         = excluded.new_revenue,
    repeat_revenue      = excluded.repeat_revenue,
    bookings            = excluded.bookings,
    identified_bookings = excluded.identified_bookings,
    rebooks             = excluded.rebooks,
    retail_attached     = excluded.retail_attached,
    synced_at           = now();
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

  -- groomer_sales_daily (service lines only, same def as groomers.avg_ticket) -
  delete from groomer_sales_daily where date between p_start and p_end;
  insert into groomer_sales_daily (client_id, store_id, date, name, appts, revenue)
  select client_id, store_id, item_date, trim(sales_person),
         count(distinct order_id), sum(price * quantity - discount)
  from franpos_order_items
  where item_date between p_start and p_end
    and nullif(trim(sales_person), '') is not null
    and franpos_item_is_service(sku, cost)
    and not franpos_item_is_passthrough(name)
  group by 1, 2, 3, 4;

  -- customers (walk-in house accounts excluded AND swept if previously written)
  delete from customers c
  using franpos_walkin_accounts() w
  where c.id = w.customer_id::text;

  with walkins as (
    select * from franpos_walkin_accounts()
  ),
  spend as (
    select i.customer_id, i.client_id, max(i.store_id) as store_id,
           count(distinct i.item_date) as visits,
           sum(i.price * i.quantity - i.discount) as ltv,
           min(i.item_date) as first_visit,
           max(i.item_date) as last_visit
    from franpos_order_items i
    left join walkins w on w.store_id = i.store_id and w.customer_id = i.customer_id
    where i.customer_id is not null
      and w.customer_id is null
      and not franpos_item_is_passthrough(i.name)
    group by i.customer_id, i.client_id
  )
  insert into customers (id, client_id, store_id, name, visits, ltv, first_visit_at, last_visit_at, segment, synced_at)
  select customer_id::text, client_id, store_id, '—', visits, ltv, first_visit, last_visit,
         case
           when last_visit < current_date - 365 then 'Dormant'
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

  -- Sweep zombie stat rows written under older definitions (e.g. deposit-only
  -- customers from the pre-0008 rollup, which counted pass-through lines as
  -- visits). Any row claiming visits but with no real item history gets its
  -- stats zeroed — identity (name/pet) is kept, and visits >= 1 filters keep
  -- it out of every analytic until real spend appears.
  update customers c
  set visits = 0, ltv = 0, first_visit_at = null, last_visit_at = null,
      segment = null, synced_at = now()
  where c.visits > 0
    and c.id ~ '^[0-9]+$'
    and not exists (
      select 1 from franpos_order_items i
      where i.customer_id = c.id::bigint
        and not franpos_item_is_passthrough(i.name)
    );

  -- cohort_monthly (full snapshot — entry cohort starts after a 90-day warm-up
  -- so pre-existing regulars don't read as "new customers"). Series depth
  -- follows the recorded history, capped at 35 offsets. `where true` satisfies
  -- Supabase's safe-update guard, which rejects bare DELETEs.
  delete from cohort_monthly where true;
  insert into cohort_monthly (client_id, store_id, month_offset, eligible, retained)
  with entry as (
    select min(item_date) + 90 as entry_start from franpos_order_items
  ),
  spans as (
    select i.client_id, i.store_id, i.customer_id,
           min(i.item_date) as first_v, max(i.item_date) as last_v
    from franpos_order_items i
    left join franpos_walkin_accounts() w on w.store_id = i.store_id and w.customer_id = i.customer_id
    where i.customer_id is not null
      and w.customer_id is null
      and not franpos_item_is_passthrough(i.name)
    group by 1, 2, 3
  )
  select s.client_id, s.store_id, k.k,
         count(*) filter (where current_date - s.first_v >= k.k * 30),
         count(*) filter (where current_date - s.first_v >= k.k * 30 and s.last_v - s.first_v >= k.k * 30)
  from spans s
  cross join entry e
  cross join generate_series(0, least(35, ((current_date - e.entry_start) / 30)::int)) as k(k)
  where s.first_v >= e.entry_start
  group by 1, 2, 3;

  -- groomers (walk-ins excluded from the customer-based return share) ---------
  with walkins as (
    select * from franpos_walkin_accounts()
  ),
  svc as (
    select i.client_id, i.store_id, trim(i.sales_person) as name, i.order_id, i.customer_id,
           i.price * i.quantity - i.discount as line_rev,
           franpos_item_is_service(i.sku, i.cost) as is_service,
           (w.customer_id is not null) as is_walkin
    from franpos_order_items i
    left join walkins w on w.store_id = i.store_id and w.customer_id = i.customer_id
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
           count(distinct s.customer_id) filter (where not s.is_walkin) as custs,
           count(distinct s.customer_id) filter (where not s.is_walkin and cv.visits >= 2) as returning_custs
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

  -- grooming cycle snapshot (gap buckets + per-customer medians) --------------
  perform franpos_refresh_grooming_cycles();

  return query select v_metrics, v_products, v_customers, v_groomers;
end $$;

revoke execute on function franpos_rollup(date, date) from anon, authenticated;

-- ── 4. Apply now (no need to wait for the next rollup) ───────────────────────
-- Re-segment in place with the new CASE…
update customers
set segment = case
  when last_visit_at < current_date - 365 then 'Dormant'
  when last_visit_at < current_date - 120 then 'Lapsed'
  when last_visit_at < current_date - 60  then 'At risk'
  when ltv >= 1200 or visits >= 12 then 'VIP'
  else 'Loyal'
end
where visits >= 1;

-- …and rebuild the cohort snapshot at the new depth.
delete from cohort_monthly where true;
insert into cohort_monthly (client_id, store_id, month_offset, eligible, retained)
with entry as (
  select min(item_date) + 90 as entry_start from franpos_order_items
),
spans as (
  select i.client_id, i.store_id, i.customer_id,
         min(i.item_date) as first_v, max(i.item_date) as last_v
  from franpos_order_items i
  left join franpos_walkin_accounts() w on w.store_id = i.store_id and w.customer_id = i.customer_id
  where i.customer_id is not null
    and w.customer_id is null
    and not franpos_item_is_passthrough(i.name)
  group by 1, 2, 3
)
select s.client_id, s.store_id, k.k,
       count(*) filter (where current_date - s.first_v >= k.k * 30),
       count(*) filter (where current_date - s.first_v >= k.k * 30 and s.last_v - s.first_v >= k.k * 30)
from spans s
cross join entry e
cross join generate_series(0, least(35, ((current_date - e.entry_start) / 30)::int)) as k(k)
where s.first_v >= e.entry_start
group by 1, 2, 3;
