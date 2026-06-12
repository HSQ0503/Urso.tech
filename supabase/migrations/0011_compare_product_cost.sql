-- Migration 0011 — expose cost in product_revenue_by_name (for the Compare
-- page's margin comparisons; product_sales_daily already stores summed cost).
-- Return type changes, so the old signature must be dropped first.

drop function if exists product_revenue_by_name(text[], date, date);
create function product_revenue_by_name(
  p_store_ids text[], p_start date default null, p_end date default null
)
returns table (name text, is_service boolean, revenue numeric, units numeric, cost numeric)
language sql stable security invoker set search_path = public as $$
  select max(p.name),
         coalesce(sum(p.revenue) filter (where p.is_service), 0) >=
         coalesce(sum(p.revenue) filter (where not p.is_service), 0),
         sum(p.revenue), sum(p.units), sum(p.cost)
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
