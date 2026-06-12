-- Migration 0010 — real customer analytics: walk-in exclusion, ticket mix,
-- new-vs-repeat revenue, groomer revenue by period, cohort retention, and the
-- read RPCs that replace every remaining hardcoded number on the dashboard.
--
-- Audit findings (2026-06-12, validated against a JS replay of all 92k lines):
-- 1. WALK-IN HOUSE ACCOUNTS. Each store has a system "walk-in" customer account
--    (verified ids 413442859/413442868/413442877/413442880 — near-consecutive,
--    created at company setup, excluded by FranPOS's own CustomerAnalysisReport).
--    They ring ~355 visit-days/year and $72k–$132k LTV each (~15% of revenue).
--    Left in, they fabricate a "return" EVERY day at every store (inflating
--    return rate), the 4 top "VIP customers", and most of "repeat revenue".
--    Detection is behavioral so it scales to other clients: visit-days ≥ 80% of
--    the store's trading days in the data window (the next-highest real
--    customer sits at ~65%). Their REVENUE stays (real sales); only
--    customer-level analytics exclude them.
-- 2. metrics_daily gains tickets_total + new_revenue/repeat_revenue so the
--    cross-sell mix (both / grooming-only / retail-only as shares of ALL
--    tickets) and new-vs-repeat revenue come from real rows. "New" = the
--    customer's first visit day anywhere in our history (global, so a
--    cross-store regular — 243 of 6.5k ids shop at 2+ stores — stays "repeat"
--    at their second store). Walk-in revenue = neither (shown as its own slice).
--    Left-censor caveat: history starts 2025-06-16, so "new" means "new within
--    our recorded history".
-- 3. groomer_sales_daily: the Revenue page was showing appts×avg_ticket×12 —
--    appts is already an all-time count, so the ×12 inflated it ~12×. This
--    table holds true per-day groomer service revenue, month-filterable.
-- 4. cohort_monthly: survival retention per store. Entry cohort = customers
--    whose first recorded visit is ≥90 days after history starts (the warm-up
--    keeps pre-existing regulars from polluting "new customer" cohorts).
--    retained at offset k = last visit ≥ k×30 days after the first.

-- ── 1. Walk-in / house account detection (ONE definition) ───────────────────
create or replace function franpos_walkin_accounts()
returns table (store_id text, customer_id bigint)
language sql stable
set search_path = public
as $$
  with days as (
    select i.store_id, count(distinct i.item_date) as trading_days
    from franpos_order_items i group by 1
  ),
  cust as (
    select i.store_id, i.customer_id, count(distinct i.item_date) as visit_days
    from franpos_order_items i
    where i.customer_id is not null
    group by 1, 2
  )
  select c.store_id, c.customer_id
  from cust c
  join days d on d.store_id = c.store_id
  where c.visit_days >= d.trading_days * 0.8
$$;

-- ── 2. New columns + tables ──────────────────────────────────────────────────
alter table metrics_daily add column if not exists tickets_total  integer       not null default 0;
alter table metrics_daily add column if not exists new_revenue    numeric(12,2) not null default 0;
alter table metrics_daily add column if not exists repeat_revenue numeric(12,2) not null default 0;
-- Service tickets rung with a real customer profile (walk-in house tickets are
-- ~10% of bookings and can never register a return, so the honest return-rate
-- denominator is identified visits — bookings stays the true volume count).
alter table metrics_daily add column if not exists identified_bookings integer not null default 0;

-- True groomer revenue per day (service lines only — same definition as
-- groomers.avg_ticket), so the Revenue page can filter by month honestly.
create table if not exists groomer_sales_daily (
  client_id uuid    not null references clients(id) on delete cascade,
  store_id  text    not null references stores(id)  on delete cascade,
  date      date    not null,
  name      text    not null,
  appts     integer not null default 0,
  revenue   numeric(12,2) not null default 0,
  primary key (store_id, date, name)
);

-- Survival cohort snapshot, recomputed in full on every rollup.
create table if not exists cohort_monthly (
  client_id    uuid    not null references clients(id) on delete cascade,
  store_id     text    not null references stores(id)  on delete cascade,
  month_offset integer not null,
  eligible     integer not null default 0,
  retained     integer not null default 0,
  primary key (store_id, month_offset)
);

alter table groomer_sales_daily enable row level security;
alter table cohort_monthly      enable row level security;
drop policy if exists "temp read — replace in auth phase" on groomer_sales_daily;
drop policy if exists "temp read — replace in auth phase" on cohort_monthly;
create policy "temp read — replace in auth phase" on groomer_sales_daily for select using (true);
create policy "temp read — replace in auth phase" on cohort_monthly      for select using (true);

-- ── 3. The rollup (v5) ───────────────────────────────────────────────────────
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
    -- Global per customer (not per store): a cross-store regular is "repeat"
    -- at their second store. Walk-in pairs excluded.
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
  -- Return rate (backward 90d), walk-ins excluded: their daily ring would
  -- otherwise register a fake "return" at every store every day.
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
  -- so pre-existing regulars don't read as "new customers"). `where true`
  -- satisfies Supabase's safe-update guard, which rejects bare DELETEs.
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
  cross join generate_series(0, 11) as k(k)
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

  return query select v_metrics, v_products, v_customers, v_groomers;
end $$;

revoke execute on function franpos_rollup(date, date) from anon, authenticated;
revoke execute on function franpos_walkin_accounts() from anon, authenticated;

-- ── 4. metrics_by_store gains the new columns (return type changes → drop) ──
drop function if exists metrics_by_store(date, date);
create function metrics_by_store(p_start date default null, p_end date default null)
returns table (
  store_id text, revenue numeric, grooming_revenue numeric, retail_revenue numeric, booking_revenue numeric,
  new_revenue numeric, repeat_revenue numeric, tickets_total bigint, identified_bookings bigint,
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
    sum(m.new_revenue), sum(m.repeat_revenue), sum(m.tickets_total), sum(m.identified_bookings),
    sum(m.bookings), sum(m.no_shows), sum(m.rebooks), sum(m.retail_attached),
    sum(m.calls_total), sum(m.calls_missed), sum(m.web_visits), sum(m.web_form_starts),
    sum(m.web_form_completes), sum(m.web_booked)
  from metrics_daily m
  where (p_start is null or m.date >= p_start)
    and (p_end   is null or m.date <  p_end)
  group by m.store_id;
$$;
grant execute on function metrics_by_store(date, date) to anon, authenticated;

-- ── 5. Read RPCs (aggregate in the DB — PostgREST caps raw reads at 1,000) ──

-- Revenue by real item name. Case/spacing variants merge (38 names differ only
-- by case); classification = where the majority of the name's revenue sits.
-- Pass-through rows excluded so the figures reconcile with headline revenue.
-- ORDER BY + LIMIT live in the function: PostgREST truncates set-returning
-- results at 1,000 rows in ARBITRARY order, which silently dropped the top
-- sellers — capping at the top 500 by revenue keeps the result deterministic.
create or replace function product_revenue_by_name(
  p_store_ids text[], p_start date default null, p_end date default null
)
returns table (name text, is_service boolean, revenue numeric, units numeric)
language sql stable security invoker set search_path = public as $$
  select max(p.name),
         coalesce(sum(p.revenue) filter (where p.is_service), 0) >=
         coalesce(sum(p.revenue) filter (where not p.is_service), 0),
         sum(p.revenue), sum(p.units)
  from product_sales_daily p
  where p.store_id = any(p_store_ids)
    and not p.is_passthrough
    and (p_start is null or p.date >= p_start)
    and (p_end   is null or p.date <  p_end)
  group by lower(trim(p.name))
  order by sum(p.revenue) desc
  limit 500
$$;
grant execute on function product_revenue_by_name(text[], date, date) to anon, authenticated;

-- Groomer service revenue over a period (replaces appts×avg_ticket×months).
create or replace function groomer_revenue(
  p_store_ids text[], p_start date default null, p_end date default null
)
returns table (store_id text, name text, revenue numeric, appts bigint)
language sql stable security invoker set search_path = public as $$
  select g.store_id, g.name, sum(g.revenue), sum(g.appts)
  from groomer_sales_daily g
  where g.store_id = any(p_store_ids)
    and (p_start is null or g.date >= p_start)
    and (p_end   is null or g.date <  p_end)
  group by 1, 2
$$;
grant execute on function groomer_revenue(text[], date, date) to anon, authenticated;

-- Segment counts + LTV, computed in the DB. visits >= 1 keeps identity-only
-- rows (synced from the customer feed but with no orders in our history) out.
create or replace function customer_segment_counts(p_store_ids text[])
returns table (segment text, customers bigint, ltv_sum numeric)
language sql stable security invoker set search_path = public as $$
  select c.segment, count(*), sum(c.ltv)
  from customers c
  where c.store_id = any(p_store_ids) and c.visits >= 1 and c.segment is not null
  group by 1
$$;
grant execute on function customer_segment_counts(text[]) to anon, authenticated;

-- Retention aggregates. The 90-day guards keep censoring honest: a customer
-- only counts as returning/one-and-done once they have had 90 days to return.
create or replace function retention_summary(p_store_ids text[])
returns table (
  total_customers bigint, eligible90 bigint, returning90 bigint,
  one_and_done90 bigint, avg_cadence_days numeric
)
language sql stable security invoker set search_path = public as $$
  select count(*),
         count(*) filter (where c.first_visit_at <= current_date - 90),
         count(*) filter (where c.first_visit_at <= current_date - 90 and c.visits >= 2),
         count(*) filter (where c.visits = 1 and c.last_visit_at <= current_date - 90),
         avg((c.last_visit_at - c.first_visit_at)::numeric / nullif(c.visits - 1, 0))
           filter (where c.visits >= 2)
  from customers c
  where c.store_id = any(p_store_ids) and c.visits >= 1
$$;
grant execute on function retention_summary(text[]) to anon, authenticated;
