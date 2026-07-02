-- Migration 0025 — store_day_lineitems: ticket / line-item read for the AI.
--
-- The aggregated tools (monthly product rankings, per-day store totals) can't
-- answer "what actually sold at Windermere yesterday" — an itemized list of the
-- day's tickets and the lines on them. That detail lives in the raw staging
-- table franpos_order_items, which is RLS-locked to the service role (migration
-- 0006), so a normal session client reads zero rows from it. This SECURITY
-- DEFINER function exposes a SCOPED, read-only slice (one row per sale line for
-- the given stores + date window), reusing the EXACT iron-rule helpers the
-- rollups use so the numbers reconcile with headline revenue:
--   franpos_item_is_passthrough(name) — exclude deposits / gift-card sales
--   franpos_item_is_service(sku, cost) — service vs retail tag
--   franpos_walkin_accounts()          — TAG (not drop) anonymous house tickets
--
-- Scope is still enforced in application code (lib/ai/tools.ts binds the
-- session's allowed stores; the model never supplies an arbitrary store list).
-- p_end is INCLUSIVE, so a single day is p_start = p_end.

create or replace function store_day_lineitems(
  p_store_ids text[],
  p_start date,
  p_end date,
  p_include_passthrough boolean default false
)
returns table (
  store_id text,
  item_date date,
  created_on timestamp,
  order_id bigint,
  customer_id bigint,
  is_walkin boolean,
  name text,
  sku text,
  quantity numeric,
  line_revenue numeric,
  cost numeric,
  is_service boolean,
  is_passthrough boolean,
  sales_person text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.store_id,
    i.item_date,
    i.created_on,
    i.order_id,
    i.customer_id,
    (w.customer_id is not null) as is_walkin,
    i.name,
    i.sku,
    i.quantity,
    i.price * i.quantity - i.discount as line_revenue,
    i.cost * i.quantity as cost,
    franpos_item_is_service(i.sku, i.cost) as is_service,
    franpos_item_is_passthrough(i.name) as is_passthrough,
    i.sales_person
  from franpos_order_items i
  left join franpos_walkin_accounts() w
    on w.store_id = i.store_id and w.customer_id = i.customer_id
  where i.store_id = any(p_store_ids)
    and i.item_date >= p_start
    and i.item_date <= p_end
    and (p_include_passthrough or not franpos_item_is_passthrough(i.name))
  order by i.store_id, i.item_date, i.order_id, i.order_item_id
$$;

-- Read-only and scoped by the caller (app code binds the allowed stores), so it
-- is safe to expose to the session roles — same access model as the other read
-- RPCs. SECURITY DEFINER lets it (and its nested franpos_walkin_accounts call)
-- read the RLS-locked staging tables the rollups own.
grant execute on function store_day_lineitems(text[], date, date, boolean) to anon, authenticated;
