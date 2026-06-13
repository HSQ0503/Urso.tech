-- Migration 0018 — product identity. The same physical product rings under
-- many register spellings ("cheese chicken chips (4 oz)" / "cheesy chicken
-- chips (4oz)" / "chicken chips cheese 4 oz (4oz)*" are one barcode), so
-- name-grouped product numbers split real products into fragments: 15.5k
-- distinct names vs ~10.6k SKUs, 2,857 SKUs carrying >1 spelling.
--
-- Identity model, two levels:
--   1. Barcode SKUs (8–14 digits — real UPCs, shared across stores) collapse
--      to ONE canonical display name: the spelling on their highest-revenue
--      day, picked over ALL history so the name is stable across periods.
--   2. Everything then groups by product_name_key(canonical name), which also
--      merges re-barcoded duplicates and non-barcode items (services, text
--      codes) whose names normalize equal.
-- Non-barcode SKUs never merge by SKU — FranPOS per-store service codes can
-- collide across stores ("10" = Full Groom here, Bath there).
--
-- Also fixes the old LIMIT 500 in product_revenue_by_name: a full month sells
-- ~1,850 distinct names, so items falling outside one period's top-500 read
-- as "sold nothing" and produced phantom winners/new-item insights. Cap is
-- now 2500 and callers are expected to surface when it is hit.

-- Normalizer: lowercase, punctuation → space, units unified (lbs/pound → lb,
-- ounce → oz, "4 oz" → "4oz"), plural s dropped from words of 4+ letters
-- ("chips" = "chip"). Keys are internal — consistency matters, beauty doesn't.
create or replace function product_name_key(p_name text)
returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(p_name),
    '[^a-z0-9]+', ' ', 'g'),
    '(\d+) *(lbs|lb|pounds|pound)\M', '\1lb', 'g'),
    '(\d+) *(oz|ounces|ounce)\M', '\1oz', 'g'),
    '([a-z]{3,})s\M', '\1', 'g'),
    ' +', ' ', 'g'))
$$;

-- Canonical spelling per barcode SKU, over all history (period-independent so
-- Compare merges the same name on both sides). Non-barcodes pass through null.
create or replace function product_sku_canon()
returns table (sku text, cname text)
language sql stable set search_path = public as $$
  select sku,
         case when sku ~ '^\d{8,14}$'
              then (array_agg(name order by revenue desc))[1] end
  from product_sales_daily
  group by sku
$$;
grant execute on function product_sku_canon() to anon, authenticated;
grant execute on function product_name_key(text) to anon, authenticated;

-- v3: canonical identity grouping, cap 2500 (was 500). Returns the normalized
-- key so callers can merge across periods even when the display spelling
-- differs between two queries (the name is picked per period, the key never).
drop function if exists product_revenue_by_name(text[], date, date);
create function product_revenue_by_name(
  p_store_ids text[], p_start date default null, p_end date default null
)
returns table (key text, name text, is_service boolean, revenue numeric, units numeric, cost numeric)
language sql stable security invoker set search_path = public as $$
  with lines as (
    select product_name_key(coalesce(c.cname, p.name)) as k,
           coalesce(c.cname, p.name) as cname,
           p.is_service, p.revenue, p.units, p.cost
    from product_sales_daily p
    left join product_sku_canon() c on c.sku = p.sku
    where p.store_id = any(p_store_ids)
      and not p.is_passthrough
      and (p_start is null or p.date >= p_start)
      and (p_end   is null or p.date <  p_end)
  )
  select k,
         (array_agg(cname order by revenue desc))[1],
         coalesce(sum(revenue) filter (where is_service), 0) >=
         coalesce(sum(revenue) filter (where not is_service), 0),
         sum(revenue), sum(units), sum(cost)
  from lines
  group by k
  order by sum(revenue) desc
  limit 2500
$$;
grant execute on function product_revenue_by_name(text[], date, date) to anon, authenticated;

-- Full catalog for the Products page: every item that sold in the period,
-- searchable, sortable, paginated. total_count rides on every row so one call
-- serves both the page and the pager.
create or replace function product_catalog(
  p_store_ids text[],
  p_start date default null, p_end date default null,
  p_search text default null,
  p_sort text default 'revenue', p_dir text default 'desc',
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  key text, name text, is_service boolean, revenue numeric, units numeric, cost numeric,
  stores integer, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with lines as (
    select product_name_key(coalesce(c.cname, p.name)) as k,
           coalesce(c.cname, p.name) as cname,
           p.store_id, p.is_service, p.revenue, p.units, p.cost
    from product_sales_daily p
    left join product_sku_canon() c on c.sku = p.sku
    where p.store_id = any(p_store_ids)
      and not p.is_passthrough
      and (p_start is null or p.date >= p_start)
      and (p_end   is null or p.date <  p_end)
  ),
  agg as (
    select k,
           (array_agg(cname order by revenue desc))[1] as name,
           coalesce(sum(revenue) filter (where is_service), 0) >=
           coalesce(sum(revenue) filter (where not is_service), 0) as is_service,
           sum(revenue) as revenue, sum(units) as units, sum(cost) as cost,
           count(distinct store_id)::integer as stores
    from lines
    group by k
  ),
  hit as (
    select * from agg
    where p_search is null or name ilike '%' || p_search || '%' or k ilike '%' || product_name_key(p_search) || '%'
  )
  select k, name, is_service, revenue, units, cost, stores, count(*) over ()
  from hit
  order by
    case when p_sort = 'name'  and p_dir = 'asc'  then lower(name) end asc,
    case when p_sort = 'name'  and p_dir = 'desc' then lower(name) end desc,
    case when p_sort = 'units' and p_dir = 'asc'  then units end asc,
    case when p_sort = 'units' and p_dir = 'desc' then units end desc,
    case when p_sort = 'margin' and p_dir = 'asc'
         then case when revenue > 0 and cost > 0 then (revenue - cost) / revenue end end asc nulls last,
    case when p_sort = 'margin' and p_dir = 'desc'
         then case when revenue > 0 and cost > 0 then (revenue - cost) / revenue end end desc nulls last,
    case when p_sort = 'revenue' and p_dir = 'asc' then revenue end asc,
    revenue desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset)
$$;
grant execute on function product_catalog(text[], date, date, text, text, text, integer, integer) to anon, authenticated;
