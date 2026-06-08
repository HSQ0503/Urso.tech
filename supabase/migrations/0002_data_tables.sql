-- Migration 0002 — the data tables (the shelves the cron jobs fill).
--
-- Still no business data here — these are empty structures shaped to match what
-- components/dashboard/data.ts already produces, so swapping the mock for real
-- reads later is a drop-in. Every table carries client_id + store_id for tenant
-- isolation. Money is numeric(12,2); rates are stored as 0..1; counts are ints
-- (so period rates stay additive — sum(rebooks)/sum(bookings), never avg of avgs).

-- 1. metrics_daily — ONE row per store per day. The numeric backbone for the
--    KPI row and every trend chart: revenue, mix, bookings, calls, web funnel.
--    FranPOS + Twilio + GA4 jobs upsert here; the dashboard sums rows by period.
create table if not exists metrics_daily (
  client_id          uuid    not null references clients(id) on delete cascade,
  store_id           text    not null references stores(id)  on delete cascade,
  date               date    not null,
  revenue            numeric(12,2) not null default 0,
  grooming_revenue   numeric(12,2) not null default 0,
  retail_revenue     numeric(12,2) not null default 0,
  bookings           integer not null default 0,
  no_shows           integer not null default 0,
  rebooks            integer not null default 0,  -- rebooked before leaving
  retail_attached    integer not null default 0,  -- grooming visits w/ a retail item
  calls_total        integer not null default 0,
  calls_missed       integer not null default 0,
  web_visits         integer not null default 0,
  web_form_starts    integer not null default 0,
  web_form_completes integer not null default 0,
  web_booked         integer not null default 0,
  synced_at          timestamptz not null default now(),
  primary key (store_id, date)
);
create index if not exists metrics_daily_client_date_idx on metrics_daily (client_id, date);

-- 2. groomers — team scorecards (Team page + manager "Your team"). Snapshot
--    metrics overwritten each sync (groomer figures aren't month-filtered yet).
create table if not exists groomers (
  id          text primary key,            -- FranPOS employee id
  client_id   uuid    not null references clients(id) on delete cascade,
  store_id    text    not null references stores(id)  on delete cascade,
  name        text    not null,
  flag        text    check (flag in ('star', 'coach')),  -- nullable
  rev_per_hr  numeric(10,2) not null default 0,
  appts       integer not null default 0,
  rebook      numeric(4,3)  not null default 0,  -- 0..1
  attach      numeric(4,3)  not null default 0,
  util        numeric(4,3)  not null default 0,
  avg_ticket  numeric(10,2) not null default 0,
  active      boolean not null default true,
  synced_at   timestamptz not null default now()
);

-- 3. customers — customer intelligence (Customers page, win-back, manager watch).
create table if not exists customers (
  id             text primary key,         -- FranPOS customer id
  client_id      uuid    not null references clients(id) on delete cascade,
  store_id       text    not null references stores(id)  on delete cascade,
  name           text    not null,
  pet            text,
  visits         integer not null default 0,
  ltv            numeric(12,2) not null default 0,
  first_visit_at date,
  last_visit_at  date,
  segment        text check (segment in ('VIP', 'Loyal', 'At risk', 'Lapsed')),
  synced_at      timestamptz not null default now()
);
create index if not exists customers_store_idx on customers (store_id, segment);

-- 4. reviews — the review browser + fake-review evidence (Reviews page). The
--    has_matching_customer flag is the FranPOS cross-reference result.
create table if not exists reviews (
  id                    text primary key,  -- Google review id
  client_id             uuid    not null references clients(id) on delete cascade,
  store_id              text    not null references stores(id)  on delete cascade,
  author                text,
  rating                integer not null check (rating between 1 and 5),
  body                  text,
  created_at            timestamptz not null,
  replied               boolean not null default false,
  replied_at            timestamptz,
  has_matching_customer boolean,           -- null = not yet cross-referenced
  flagged_fake          boolean not null default false,
  synced_at             timestamptz not null default now()
);
create index if not exists reviews_store_idx on reviews (store_id, rating);

-- 5. store_listings — per-store reputation + findability snapshot (the Reviews
--    cards: local rank, "no book button", rating, reply rate). One row / store.
create table if not exists store_listings (
  store_id             text primary key references stores(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  local_rank           integer,
  listing_completeness numeric(4,3),       -- 0..1
  has_book_button      boolean not null default true,
  avg_rating           numeric(2,1),
  review_count         integer not null default 0,
  response_rate        numeric(4,3) not null default 0,
  response_hours       integer,
  synced_at            timestamptz not null default now()
);

-- 6. calls — raw Twilio call events. Powers the instant missed-call text-back
--    (each call is a row) + the hourly/after-hours view; daily totals also roll
--    up into metrics_daily for the trend chart.
create table if not exists calls (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid    not null references clients(id) on delete cascade,
  store_id          text    not null references stores(id)  on delete cascade,
  occurred_at       timestamptz not null,
  answered          boolean not null default false,
  after_hours       boolean not null default false,
  duration_s        integer,
  texted_back       boolean not null default false,
  recovered_booking boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists calls_store_time_idx on calls (store_id, occurred_at);

-- 7. agent_actions — the AI action center pipeline (suggested → approved →
--    running → completed). store_id null = an all-stores action.
create table if not exists agent_actions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  store_id    text references stores(id) on delete cascade,  -- null = all stores
  agent       text not null,
  title       text not null,
  detail      text,
  metric      text,
  status      text not null default 'suggested'
                check (status in ('suggested', 'approved', 'running', 'completed')),
  result      text,
  pending     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists agent_actions_status_idx on agent_actions (client_id, status);

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- Temp read-only policies again (replaced with session-scoped ones in the auth
-- phase). The cron jobs WRITE with the service_role secret key, which bypasses
-- RLS entirely — so no insert/update policies are needed here yet.
alter table metrics_daily  enable row level security;
alter table groomers       enable row level security;
alter table customers      enable row level security;
alter table reviews        enable row level security;
alter table store_listings enable row level security;
alter table calls          enable row level security;
alter table agent_actions  enable row level security;

create policy "temp read — replace in auth phase" on metrics_daily  for select using (true);
create policy "temp read — replace in auth phase" on groomers       for select using (true);
create policy "temp read — replace in auth phase" on customers      for select using (true);
create policy "temp read — replace in auth phase" on reviews        for select using (true);
create policy "temp read — replace in auth phase" on store_listings for select using (true);
create policy "temp read — replace in auth phase" on calls          for select using (true);
create policy "temp read — replace in auth phase" on agent_actions  for select using (true);
