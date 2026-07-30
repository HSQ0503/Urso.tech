-- Migration 0028 — data-science core: retention, demand, discounts, groomer
-- trend. Four SECURITY DEFINER reads over the RLS-locked staging tables, same
-- access model as store_day_lineitems (0025): scoped by the caller (the app's
-- tool layer binds the session's allowed stores), read-only, and reusing the
-- iron-rule helpers so results reconcile with headline revenue. None of these
-- return customer PII — groomer names are staff, not customers — so grants
-- follow the 0025 session-role pattern, not 0027's service-role lockdown.
-- p_end is INCLUSIVE everywhere (a single day is p_start = p_end).

-- ── 1. groomer_retention ────────────────────────────────────────────────────
-- Does this groomer's work bring the dog back? For each identified, non-walk-in
-- service VISIT (distinct customer×day with a groomer-role sales_person) in
-- [p_start, p_end], p_end INCLUSIVE:
--   returned            — the customer's next service visit (ANY store, LEAD
--                         over the customer's FULL visit history, not just the
--                         window — a January visit's return can land in April,
--                         and a store-switcher is still retained) exists within
--                         90 days
--   same_groomer_*      — that next visit's primary groomer is this groomer
-- A visit is attributed to its PRIMARY groomer that day: most service lines,
-- ties broken by revenue. Rates are per eligible visit ("X% of her visits come
-- back / come back to her").
--
-- RIGHT-CENSORING: a visit only becomes observable 90 days after it happens,
-- so eligibility requires item_date <= current_date - 90. When the requested
-- window reaches past that horizon the rates are still computed over the
-- eligible visits, and censored = (p_end > current_date - 90) tells the caller
-- the window was truncated — the simplest honest contract.
create or replace function groomer_retention(
  p_store_ids text[],
  p_start date,
  p_end date
)
returns table (
  groomer text,
  store_id text,
  eligible_visits bigint,
  returned bigint,
  return_rate numeric,
  same_groomer_returns bigint,
  same_groomer_rate numeric,
  censored boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with svc as (
    -- FULL history, all stores: the visit sequence must see returns that fall
    -- outside the window and at other stores. Attribution is scoped later.
    select i.customer_id, i.store_id, i.item_date, i.sales_person,
           i.price * i.quantity - i.discount as line_rev,
           s.role as staff_role,
           coalesce(s.display_name, regexp_replace(trim(i.sales_person), '\s+', ' ', 'g')) as groomer_name
    from franpos_order_items i
    left join franpos_walkin_accounts() w
      on w.store_id = i.store_id and w.customer_id = i.customer_id
    left join staff s
      on s.client_id = i.client_id and s.name_key = staff_name_key(i.sales_person)
    where i.customer_id is not null
      and w.customer_id is null
      and franpos_item_is_service(i.sku, i.cost)
      and not franpos_item_is_passthrough(i.name)
  ),
  primaries as (
    select v.customer_id, v.item_date, v.store_id, v.groomer_name,
           row_number() over (
             partition by v.customer_id, v.item_date
             order by count(*) desc, sum(v.line_rev) desc, v.groomer_name
           ) as rn
    from svc v
    where nullif(trim(v.sales_person), '') is not null
      and coalesce(v.staff_role, 'groomer') = 'groomer'
    group by v.customer_id, v.item_date, v.store_id, v.groomer_name
  ),
  day_primary as (
    select p.customer_id, p.item_date, p.store_id, p.groomer_name
    from primaries p
    where p.rn = 1
  ),
  seq as (
    -- Any service day counts as the return — even one rung by front desk or a
    -- vendor: the store kept the customer, whoever rang the line.
    select d.customer_id, d.item_date,
           lead(d.item_date) over (partition by d.customer_id order by d.item_date) as next_date
    from (select distinct v.customer_id, v.item_date from svc v) d
  ),
  visits as (
    select dp.customer_id, dp.item_date, dp.store_id, dp.groomer_name,
           sq.next_date, np.groomer_name as next_groomer
    from day_primary dp
    join seq sq
      on sq.customer_id = dp.customer_id and sq.item_date = dp.item_date
    left join day_primary np
      on np.customer_id = dp.customer_id and np.item_date = sq.next_date
    where dp.item_date >= p_start
      and dp.item_date <= p_end
      and dp.store_id = any(p_store_ids)
      and dp.item_date <= current_date - 90
  ),
  flagged as (
    select v.groomer_name, v.store_id,
           (v.next_date is not null and v.next_date - v.item_date <= 90) as did_return,
           (v.next_date is not null and v.next_date - v.item_date <= 90
            and v.next_groomer is not null
            and staff_name_key(v.next_groomer) = staff_name_key(v.groomer_name)) as same_groomer
    from visits v
  )
  select f.groomer_name, f.store_id,
         count(*),
         count(*) filter (where f.did_return),
         round(count(*) filter (where f.did_return)::numeric / count(*), 3),
         count(*) filter (where f.same_groomer),
         round(count(*) filter (where f.same_groomer)::numeric / count(*), 3),
         (p_end > current_date - 90)
  from flagged f
  group by f.groomer_name, f.store_id
  order by count(*) desc
$$;

-- Locked to the service role like 0027: scope comes from the app's session
-- resolution, and a public grant would let the anon key query any store's
-- groomer revenue directly over REST.
revoke all on function groomer_retention(text[], date, date)
  from public, anon, authenticated;
grant execute on function groomer_retention(text[], date, date) to service_role;

-- ── 2. demand_heatmap ───────────────────────────────────────────────────────
-- When the store is actually busy: tickets by day-of-week × hour. Grouped per
-- ORDER first so a multi-line ticket counts once; pass-through lines dropped
-- so revenue reconciles. p_end is INCLUSIVE.
--
-- created_on is the store-LOCAL naive clock (0006) — no timezone math needed,
-- dow/hour are already the store's own trading hours. Caveat that stays
-- app-side: this is CHECKOUT time; a groom rings at pickup, ~2–4h after the
-- appointment started, so morning demand reads shifted toward midday.
create or replace function demand_heatmap(
  p_store_ids text[],
  p_start date,
  p_end date
)
returns table (
  store_id text,
  dow int,
  hour int,
  tickets bigint,
  service_tickets bigint,
  revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with orders as (
    -- min(created_on): a ticket's lines share one timestamp; min guards the
    -- odd straggler line without moving the ticket.
    select i.store_id, i.order_id,
           min(i.created_on) as created_on,
           sum(i.price * i.quantity - i.discount) as order_rev,
           bool_or(franpos_item_is_service(i.sku, i.cost)) as has_service
    from franpos_order_items i
    where i.store_id = any(p_store_ids)
      and i.item_date >= p_start
      and i.item_date <= p_end
      and not franpos_item_is_passthrough(i.name)
    group by i.store_id, i.order_id
  )
  select o.store_id,
         extract(dow from o.created_on)::int,
         extract(hour from o.created_on)::int,
         count(*),
         count(*) filter (where o.has_service),
         round(sum(o.order_rev), 2)
  from orders o
  group by 1, 2, 3
  order by 1, 2, 3
$$;

revoke all on function demand_heatmap(text[], date, date)
  from public, anon, authenticated;
grant execute on function demand_heatmap(text[], date, date) to service_role;

-- ── 3. discount_analysis ────────────────────────────────────────────────────
-- Where the discounting actually happens. Only lines with discount > 0,
-- non-passthrough, p_end INCLUSIVE. gross = sum(price × quantity) over the
-- SAME discounted lines — the pct answers "how deep do we cut when we cut",
-- not "what share of all revenue is discounted".
--
-- Axes: store · groomer (role-filtered display names, same convention as
-- everywhere) · product · month · customer_type. customer_type buckets:
--   'new'     — the line's date IS the customer's first-ever recorded visit
--               (left-censored like 0010: history starts 2025-06-16)
--   'repeat'  — identified customer past their first day
--   'walk-in' — house accounts AND lines with no customer at all: neither is
--               an identifiable person, and that is the analytical point.
-- Capped at 40 rows in-function — PostgREST would truncate an unbounded
-- product axis at 1,000 rows in arbitrary order.
create or replace function discount_analysis(
  p_store_ids text[],
  p_start date,
  p_end date,
  p_group_by text
)
returns table (
  bucket text,
  discounted_lines bigint,
  discount_total numeric,
  gross numeric,
  discount_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Validate here, not in the tool schema: a hallucinated axis should fail
  -- loudly, not silently bucket everything as customer_type.
  if p_group_by not in ('store', 'groomer', 'product', 'month', 'customer_type') then
    raise exception 'discount_analysis: p_group_by must be store, groomer, product, month, or customer_type (got %)', p_group_by;
  end if;

  return query
  with lines as (
    select i.client_id, i.store_id, i.customer_id, i.item_date, i.name,
           i.sales_person, i.discount,
           i.price * i.quantity as gross_rev
    from franpos_order_items i
    where i.store_id = any(p_store_ids)
      and i.item_date >= p_start
      and i.item_date <= p_end
      and i.discount > 0
      and not franpos_item_is_passthrough(i.name)
  ),
  first_visit as (
    -- First-ever visit across recorded history, global per customer like the
    -- rollup's new/repeat split (0010).
    select i.customer_id, min(i.item_date) as first_d
    from franpos_order_items i
    where i.customer_id is not null
      and not franpos_item_is_passthrough(i.name)
    group by i.customer_id
  ),
  bucketed as (
    select
      case p_group_by
        when 'store'   then l.store_id
        when 'month'   then to_char(l.item_date, 'YYYY-MM')
        when 'product' then lower(trim(l.name))
        when 'groomer' then coalesce(s.display_name, regexp_replace(trim(l.sales_person), '\s+', ' ', 'g'))
        else case
          when w.customer_id is not null or l.customer_id is null then 'walk-in'
          when fv.first_d = l.item_date then 'new'
          else 'repeat'
        end
      end as grp,
      l.name as line_name,
      l.discount,
      l.gross_rev
    from lines l
    left join staff s
      on s.client_id = l.client_id and s.name_key = staff_name_key(l.sales_person)
    left join franpos_walkin_accounts() w
      on w.store_id = l.store_id and w.customer_id = l.customer_id
    left join first_visit fv
      on fv.customer_id = l.customer_id
    where p_group_by <> 'groomer'
       or (nullif(trim(l.sales_person), '') is not null
           and coalesce(s.role, 'groomer') = 'groomer')
  )
  -- Product groups on the case/space-merged key; display the real casing.
  select case when p_group_by = 'product' then max(b.line_name) else b.grp end,
         count(*),
         round(sum(b.discount), 2),
         round(sum(b.gross_rev), 2),
         round(sum(b.discount) / nullif(sum(b.gross_rev), 0), 3)
  from bucketed b
  group by b.grp
  order by sum(b.discount) desc
  limit 40;
end $$;

revoke all on function discount_analysis(text[], date, date, text)
  from public, anon, authenticated;
grant execute on function discount_analysis(text[], date, date, text) to service_role;

-- ── 4. groomer_monthly_revenue ──────────────────────────────────────────────
-- Groomer revenue as a monthly SERIES — groomer_revenue (0016) collapses the
-- whole window to one row per groomer, which cannot show a trend. Straight
-- rollup of groomer_sales_daily, groomers-only via staff with the same
-- unseen-defaults-to-groomer convention, display names unified. p_end is
-- INCLUSIVE.
create or replace function groomer_monthly_revenue(
  p_store_ids text[],
  p_start date,
  p_end date
)
returns table (
  month text,
  groomer text,
  store_id text,
  revenue numeric,
  appts bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(g.date, 'YYYY-MM'),
         coalesce(s.display_name, min(g.name)),
         g.store_id,
         sum(g.revenue),
         sum(g.appts)
  from groomer_sales_daily g
  left join staff s
    on s.client_id = g.client_id and s.name_key = staff_name_key(g.name)
  where g.store_id = any(p_store_ids)
    and g.date >= p_start
    and g.date <= p_end
    and coalesce(s.role, 'groomer') = 'groomer'
  group by to_char(g.date, 'YYYY-MM'), g.store_id, staff_name_key(g.name), s.display_name
  order by 1, 4 desc
$$;

revoke all on function groomer_monthly_revenue(text[], date, date)
  from public, anon, authenticated;
grant execute on function groomer_monthly_revenue(text[], date, date) to service_role;

-- Self-record so ANY apply path leaves a ledger trace (see 0026/0027).
insert into schema_migrations (filename, checksum, applied_by)
values ('0028_ds_core.sql', null, 'self')
on conflict (filename) do nothing;
