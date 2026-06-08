-- TEMPORARY sample data for metrics_daily.
--
-- Purpose: prove the read pipe (Supabase → data layer → dashboard) before
-- FranPOS is connected. These are plausible *sample* numbers, NOT real Woof
-- Gang figures. The shape (per store, per day) is exactly what the FranPOS cron
-- will produce, so swapping the source later changes nothing downstream.
--
-- Seeds ~365 days for the 4 stores, with a gentle upward trend + daily noise so
-- the charts look organic. Re-runnable (on conflict do nothing) — but if you
-- previously seeded 180 days, run `delete from metrics_daily;` first for a clean
-- 12-month series.
--
-- DELETE this once the FranPOS cron is live:  delete from metrics_daily;

with params (store_id, rev, gpct, ticket, noshow, rebook, attach, calls, miss, visits) as (
  values
    ('wp', 1947, 0.64, 96, 0.06, 0.64, 0.38, 44, 0.18, 37),
    ('wg', 1640, 0.67, 89, 0.07, 0.58, 0.31, 38, 0.22, 31),
    ('lv', 1320, 0.71, 82, 0.11, 0.41, 0.24, 32, 0.31, 23),
    ('wm', 1230, 0.73, 79, 0.13, 0.38, 0.21, 28, 0.34, 20)
),
days as (
  select (current_date - g.n)      as date,
         (364 - g.n)::numeric / 364 as t   -- 0 (oldest) .. 1 (today): the growth fraction
  from generate_series(0, 364) as g(n)
)
insert into metrics_daily (
  client_id, store_id, date,
  revenue, grooming_revenue, retail_revenue,
  bookings, no_shows, rebooks, retail_attached,
  calls_total, calls_missed,
  web_visits, web_form_starts, web_form_completes, web_booked
)
select
  c.id,
  p.store_id,
  dy.date,
  rev.revenue,
  round(rev.revenue * p.gpct, 2),
  round(rev.revenue * (1 - p.gpct), 2),
  bk.bookings,
  round(bk.bookings * p.noshow)::int,
  round(bk.bookings * p.rebook)::int,
  round(bk.bookings * p.attach)::int,
  ct.calls_total,
  round(ct.calls_total * p.miss)::int,
  wv.web_visits,
  round(wv.web_visits * 0.18)::int,
  round(wv.web_visits * 0.18 * 0.37)::int,
  round(wv.web_visits * 0.18 * 0.37 * 0.9)::int
from clients c
cross join params p
cross join days dy
cross join lateral (select round((p.rev * (0.88 + 0.24 * dy.t) * (0.9 + random() * 0.2))::numeric, 2) as revenue) rev
cross join lateral (select greatest(1, round(rev.revenue / p.ticket))::int as bookings) bk
cross join lateral (select greatest(0, round(p.calls * (0.85 + random() * 0.3)))::int as calls_total) ct
cross join lateral (select greatest(0, round(p.visits * (0.85 + random() * 0.3)))::int as web_visits) wv
where c.slug = 'woof-gang'
on conflict (store_id, date) do nothing;
