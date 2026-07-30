-- Migration 0027 — customer↔groomer affinity + customer lookup/profile RPCs.
--
-- The AI tools can rank groomers and rank customers, but cannot answer "who is
-- Bella's groomer" or "show me Alyssa's client book" — the raw lines that hold
-- the answer are RLS-locked to the service role (0006). These three SECURITY
-- DEFINER functions expose scoped reads over them, reusing the SAME iron-rule
-- helpers as the rollups so every number reconciles with headline revenue:
--   franpos_item_is_service / franpos_item_is_passthrough / franpos_walkin_accounts
--   staff + staff_name_key (0016) — role filter with the same "unseen names
--   default to groomer" convention as groomer_revenue, so new hires appear
--   without a deploy and 'Dental Cleaner' / 'Wgb Winter Park' never do.
--
-- PII posture — deliberately TIGHTER than 0025: these return customer names,
-- so execute is revoked from anon/authenticated and granted to service_role
-- only. The app's server-side tool layer (lib/ai/tools.ts) binds the session's
-- allowed stores and calls with the service key; nothing here is reachable
-- from a browser session.

-- ── 1. customer_groomer_affinity ────────────────────────────────────────────
-- Which groomer each customer actually belongs to. p_end is INCLUSIVE (a
-- single day is p_start = p_end).
--
-- A visit is count(distinct order_id): one groom rings as several service
-- lines on one ticket (bath + nails + de-shed) and must count once; order_id
-- is the ticket grain every rollup already uses. total_visits sums the
-- customer's groomer rows, so shares always sum to 1 even on the rare ticket
-- split across two groomers. is_primary = the customer's most-visited groomer
-- (recency breaks ties).
--
-- Two modes:
--   p_groomer null — top p_limit customers by LTV, ALL their groomer rows
--                    (the "who does this customer see" split).
--   p_groomer set  — that groomer's client book, filtered AFTER affinity is
--                    computed so share/is_primary stay honest (a customer who
--                    mostly sees someone else still shows their true split).
-- Rows with name '—' (identity feed hasn't caught up) are NOT dropped here:
-- the RPC is a data surface; presentation filtering is app policy.
create or replace function customer_groomer_affinity(
  p_store_ids text[],
  p_start date,
  p_end date,
  p_groomer text default null,
  p_limit int default 25
)
returns table (
  customer_id text,
  customer_name text,
  pet text,
  segment text,
  ltv numeric,
  store_id text,
  groomer text,
  visits bigint,
  total_visits bigint,
  share numeric,
  is_primary boolean,
  last_visit date
)
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select i.customer_id, i.store_id, i.order_id, i.item_date,
           -- Display-name grouping (not name_key) so FranPOS spelling variants
           -- unified in staff ("Cristina Cortez"→"Cristina Cortes") are one
           -- groomer; the regexp mirrors 0016's display normalization.
           coalesce(s.display_name, regexp_replace(trim(i.sales_person), '\s+', ' ', 'g')) as groomer_name
    from franpos_order_items i
    left join franpos_walkin_accounts() w
      on w.store_id = i.store_id and w.customer_id = i.customer_id
    left join staff s
      on s.client_id = i.client_id and s.name_key = staff_name_key(i.sales_person)
    where i.store_id = any(p_store_ids)
      and i.item_date >= p_start
      and i.item_date <= p_end
      and i.customer_id is not null
      and w.customer_id is null
      and nullif(trim(i.sales_person), '') is not null
      and franpos_item_is_service(i.sku, i.cost)
      and not franpos_item_is_passthrough(i.name)
      and coalesce(s.role, 'groomer') = 'groomer'
  ),
  pairs as (
    -- max(store_id): groomers effectively work one store; when a pair spans
    -- stores the pick is arbitrary but deterministic.
    select l.customer_id,
           l.groomer_name,
           max(l.store_id) as store_id,
           count(distinct l.order_id) as visits,
           max(l.item_date) as last_visit
    from lines l
    group by l.customer_id, l.groomer_name
  ),
  scored as (
    select p.*,
           sum(p.visits) over (partition by p.customer_id)::bigint as total_visits,
           (row_number() over (
              partition by p.customer_id
              order by p.visits desc, p.last_visit desc, p.groomer_name
            )) = 1 as is_primary
    from pairs p
  ),
  scoped_spend as (
    -- All-time spend at the CALLER'S stores only. The rollup's customers.ltv
    -- is company-wide (max(store_id) attribution, 0010), and a store-scoped
    -- caller must not see — or have "top customers" RANKED by — other-store
    -- spend, mirroring customer_profile's posture below. Restricted to the
    -- customers already in `pairs` so the scan stays proportional to output.
    select i.customer_id, round(sum(i.price * i.quantity - i.discount), 2) as scoped_ltv
    from franpos_order_items i
    left join franpos_walkin_accounts() w
      on w.store_id = i.store_id and w.customer_id = i.customer_id
    where i.store_id = any(p_store_ids)
      and w.customer_id is null
      and not franpos_item_is_passthrough(i.name)
      and i.customer_id in (select distinct p2.customer_id from pairs p2)
    group by i.customer_id
  ),
  enriched as (
    -- Left join on the rollup for IDENTITY only (name/pet/segment — segment is
    -- behavioral, per customer_profile's precedent); money comes from
    -- scoped_spend. A customer whose rollup row lags the lines still surfaces.
    select sc.customer_id, coalesce(c.name, '—') as customer_name, c.pet, c.segment,
           coalesce(ss.scoped_ltv, 0) as ltv,
           sc.store_id, sc.groomer_name, sc.visits, sc.total_visits,
           round(sc.visits::numeric / nullif(sc.total_visits, 0), 3) as share,
           sc.is_primary, sc.last_visit
    from scored sc
    left join customers c on c.id = sc.customer_id::text
    left join scoped_spend ss on ss.customer_id = sc.customer_id
  ),
  ranked as (
    -- dense_rank over (ltv, customer_id): all of one customer's rows share a
    -- rank, so the mode-A cap limits CUSTOMERS, not rows.
    select e.*,
           dense_rank() over (order by e.ltv desc nulls last, e.customer_id) as cust_rank
    from enriched e
  )
  select r.customer_id::text, r.customer_name, r.pet, r.segment, r.ltv,
         r.store_id, r.groomer_name, r.visits, r.total_visits, r.share,
         r.is_primary, r.last_visit
  from ranked r
  where (p_groomer is null
         and r.cust_rank <= least(greatest(coalesce(p_limit, 25), 1), 100))
     or (p_groomer is not null
         and staff_name_key(r.groomer_name) = staff_name_key(p_groomer))
  order by case when p_groomer is null then r.cust_rank end,
           r.visits desc, r.last_visit desc
  -- Mode B caps rows; mode A already capped customers above (limit null = all).
  limit (case when p_groomer is null then null
              else least(greatest(coalesce(p_limit, 25), 1), 100) end)
$$;

revoke all on function customer_groomer_affinity(text[], date, date, text, int)
  from public, anon, authenticated;
grant execute on function customer_groomer_affinity(text[], date, date, text, int)
  to service_role;

-- ── 2. find_customer ────────────────────────────────────────────────────────
-- Name/pet lookup for "pull up Bella". Matches customers.pet as well as name
-- because FranPOS stores the PET in FirstName — the pet is usually what the
-- front desk (and the owner) actually remembers. The < 3 char guard keeps a
-- one-letter query from becoming a scored dump of the customer base.
--
-- Known blind spot: customers.store_id is max(store_id) from the rollup, so a
-- multi-store customer may sit filed under a store OUTSIDE p_store_ids and not
-- match here even though they have visits in scope.
create or replace function find_customer(
  p_store_ids text[],
  p_query text,
  p_limit int default 5
)
returns table (
  customer_id text,
  name text,
  pet text,
  store_id text,
  visits int,
  ltv numeric,
  segment text,
  first_visit_at date,
  last_visit_at date,
  grooming_cycle_days int
)
language sql
stable
security definer
set search_path = public
as $$
  -- visits/ltv are computed from SCOPED lines (not the company-wide rollup
  -- columns): a store-locked caller must not see or rank by other-store
  -- spend. For an all-stores caller the numbers match the rollup.
  select c.id,
         c.name,
         c.pet,
         c.store_id,
         coalesce(sp.scoped_visits, 0)::int,
         coalesce(sp.scoped_ltv, 0),
         c.segment,
         c.first_visit_at,
         c.last_visit_at,
         c.grooming_cycle_days
  from customers c
  left join lateral (
    select count(distinct i.item_date)::int as scoped_visits,
           round(sum(i.price * i.quantity - i.discount), 2) as scoped_ltv
    from franpos_order_items i
    where i.customer_id::text = c.id
      and i.store_id = any(p_store_ids)
      and not franpos_item_is_passthrough(i.name)
  ) sp on true
  where length(trim(coalesce(p_query, ''))) >= 3
    and c.store_id = any(p_store_ids)
    and (c.name ilike '%' || trim(p_query) || '%'
         or c.pet ilike '%' || trim(p_query) || '%')
  order by coalesce(sp.scoped_ltv, 0) desc
  limit least(greatest(coalesce(p_limit, 5), 1), 10)
$$;

revoke all on function find_customer(text[], text, int)
  from public, anon, authenticated;
grant execute on function find_customer(text[], text, int)
  to service_role;

-- ── 3. customer_profile ─────────────────────────────────────────────────────
-- One jsonb envelope instead of a row set: the visit history alone can exceed
-- PostgREST's 1,000-row transport cap, and the tool layer wants one object
-- anyway. Header identity (name/pet/segment/cycle) comes from the customers
-- rollup; every MONEY figure and the visit/groomer/product arrays are computed
-- FROM SCOPED LINES ONLY (i.store_id = any(p_store_ids)) — a store manager
-- must never see another store's spend, so out-of-scope lines simply do not
-- exist for this function.
create or replace function customer_profile(
  p_store_ids text[],
  p_customer_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
begin
  -- House accounts ring hundreds of anonymous tickets a year; a "profile" of
  -- one is a nonsense answer, so refuse rather than mislead.
  if exists (
    select 1 from franpos_walkin_accounts() w
    where w.customer_id = p_customer_id and w.store_id = any(p_store_ids)
  ) then
    return jsonb_build_object('error', 'walk-in account — not an identifiable customer');
  end if;

  if not exists (
    select 1 from franpos_order_items i
    where i.customer_id = p_customer_id
      and i.store_id = any(p_store_ids)
      and not franpos_item_is_passthrough(i.name)
  ) then
    return jsonb_build_object('error', 'no visits for this customer in your stores');
  end if;

  with lines as (
    select i.client_id, i.store_id, i.order_id, i.item_date, i.name,
           i.price, i.quantity, i.discount, i.sales_person,
           franpos_item_is_service(i.sku, i.cost) as is_service
    from franpos_order_items i
    where i.customer_id = p_customer_id
      and i.store_id = any(p_store_ids)
      and not franpos_item_is_passthrough(i.name)
  ),
  day_rows as (
    -- 60 most recent visit-days keeps the envelope bounded (~1.5 years for a
    -- 4-week regular). max(store_id): a two-store day is vanishingly rare.
    select l.item_date,
           max(l.store_id) as store_id,
           round(coalesce(sum(l.price * l.quantity - l.discount) filter (where l.is_service), 0), 2) as grooming,
           round(coalesce(sum(l.price * l.quantity - l.discount) filter (where not l.is_service), 0), 2) as retail
    from lines l
    group by l.item_date
    order by l.item_date desc
    limit 60
  ),
  day_groomers as (
    -- Groomer-role filtered like everywhere else, so a visit row never lists
    -- 'Dental Cleaner' as the person who groomed the dog.
    select l.item_date,
           jsonb_agg(distinct coalesce(s.display_name, regexp_replace(trim(l.sales_person), '\s+', ' ', 'g'))) as groomers
    from lines l
    left join staff s
      on s.client_id = l.client_id and s.name_key = staff_name_key(l.sales_person)
    where l.is_service
      and nullif(trim(l.sales_person), '') is not null
      and coalesce(s.role, 'groomer') = 'groomer'
    group by l.item_date
  ),
  groomer_rows as (
    -- Distinct tickets, same visit definition as customer_groomer_affinity.
    select coalesce(s.display_name, regexp_replace(trim(l.sales_person), '\s+', ' ', 'g')) as groomer,
           count(distinct l.order_id) as visits
    from lines l
    left join staff s
      on s.client_id = l.client_id and s.name_key = staff_name_key(l.sales_person)
    where l.is_service
      and nullif(trim(l.sales_person), '') is not null
      and coalesce(s.role, 'groomer') = 'groomer'
    group by 1
  ),
  product_rows as (
    -- Case/spacing variants merge like product_revenue_by_name; at the
    -- per-customer scale bool_or is an adequate service/retail call.
    select max(l.name) as name,
           case when bool_or(l.is_service) then 'service' else 'retail' end as line,
           round(sum(l.price * l.quantity - l.discount), 2) as revenue,
           sum(l.quantity) as units
    from lines l
    group by lower(trim(l.name))
    order by 3 desc
    limit 10
  )
  select jsonb_build_object(
    'header', coalesce(
      (select jsonb_build_object(
         'customerId', c.id,
         'name', c.name,
         'pet', c.pet,
         'segment', c.segment,
         -- Deliberately NO rollup ltv/visits here: those are company-wide, and
         -- a store-scoped caller (a manager) must not see other-store spend
         -- even in aggregate. Scoped money lives in `totals`; scoped visit
         -- count in `visits` below.
         'scopedVisitDays', (select count(distinct l.item_date) from lines l),
         'firstVisit', c.first_visit_at,
         'lastVisit', c.last_visit_at,
         'cycleDays', c.grooming_cycle_days)
       from customers c
       where c.id = p_customer_id::text),
      -- Lines can precede the rollup's customer row by up to a sync cycle.
      jsonb_build_object('customerId', p_customer_id::text)),
    'totals', (
      select jsonb_build_object(
        'grooming', round(coalesce(sum(l.price * l.quantity - l.discount) filter (where l.is_service), 0), 2),
        'retail',   round(coalesce(sum(l.price * l.quantity - l.discount) filter (where not l.is_service), 0), 2),
        'revenue',  round(coalesce(sum(l.price * l.quantity - l.discount), 0), 2))
      from lines l),
    'visits', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.item_date,
               'store', d.store_id,
               'grooming', d.grooming,
               'retail', d.retail,
               'groomers', coalesce(g.groomers, '[]'::jsonb))
             order by d.item_date desc), '[]'::jsonb)
      from day_rows d
      left join day_groomers g on g.item_date = d.item_date),
    'groomers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'groomer', gr.groomer,
               'visits', gr.visits)
             order by gr.visits desc), '[]'::jsonb)
      from groomer_rows gr),
    'topProducts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', pr.name,
               'line', pr.line,
               'revenue', pr.revenue,
               'units', pr.units)
             order by pr.revenue desc), '[]'::jsonb)
      from product_rows pr)
  )
  into v_profile;

  return v_profile;
end $$;

revoke all on function customer_profile(text[], bigint)
  from public, anon, authenticated;
grant execute on function customer_profile(text[], bigint)
  to service_role;

-- Self-record so ANY apply path (psql, dashboard paste, future apply script)
-- leaves a ledger trace, even before ledger-aware applies ship.
insert into schema_migrations (filename, checksum, applied_by)
values ('0027_customer_groomer.sql', null, 'self')
on conflict (filename) do nothing;
