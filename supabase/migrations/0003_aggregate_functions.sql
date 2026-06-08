-- Migration 0003 — aggregation RPCs.
--
-- Aggregate inside Postgres and return a handful of summary rows, instead of
-- pulling every daily row into the app and summing in JS. This is both faster
-- (transfer ~4 rows, not ~1,500) and avoids PostgREST's 1,000-row response cap,
-- which would otherwise silently truncate the 12-month "all" view.
--
-- security invoker → the caller's RLS still applies (the temp read policies on
-- metrics_daily allow it today; real per-tenant policies later).

-- Per-store totals over an optional [p_start, p_end) date range.
create or replace function metrics_by_store(p_start date default null, p_end date default null)
returns table (
  store_id text, revenue numeric, grooming_revenue numeric, retail_revenue numeric,
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
    sum(m.revenue), sum(m.grooming_revenue), sum(m.retail_revenue),
    sum(m.bookings), sum(m.no_shows), sum(m.rebooks), sum(m.retail_attached),
    sum(m.calls_total), sum(m.calls_missed), sum(m.web_visits), sum(m.web_form_starts),
    sum(m.web_form_completes), sum(m.web_booked)
  from metrics_daily m
  where (p_start is null or m.date >= p_start)
    and (p_end   is null or m.date <  p_end)
  group by m.store_id;
$$;

-- Time series bucketed by month or day, summed across the given stores.
create or replace function metrics_series(
  p_store_ids text[], p_start date default null, p_end date default null, p_monthly boolean default true
)
returns table (
  bucket text, revenue numeric, calls_total bigint, calls_missed bigint, web_visits bigint, web_booked bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case when p_monthly then to_char(m.date, 'YYYY-MM') else to_char(m.date, 'YYYY-MM-DD') end as bucket,
    sum(m.revenue), sum(m.calls_total), sum(m.calls_missed), sum(m.web_visits), sum(m.web_booked)
  from metrics_daily m
  where m.store_id = any(p_store_ids)
    and (p_start is null or m.date >= p_start)
    and (p_end   is null or m.date <  p_end)
  group by 1
  order by 1;
$$;

grant execute on function metrics_by_store(date, date) to anon, authenticated;
grant execute on function metrics_series(text[], date, date, boolean) to anon, authenticated;
