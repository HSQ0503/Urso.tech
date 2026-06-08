-- Migration 0001 — tenancy foundation: clients + stores, with the Woof Gang seed.
--
-- This creates EMPTY tables (structure only). There is no business data here —
-- the cron jobs fill the data tables (orders, calls, reviews, …) once the
-- FranPOS / Twilio / Google keys are connected. We seed only the two things we
-- already know for certain: the client and its four stores.
--
-- Mirrors the vault data model ("Platform — Multi-Tenancy & Auth" §5).

-- ── Tenants ────────────────────────────────────────────────────────────────
-- Each Urso client is one row. Woof Gang is the first; every other table hangs
-- off this so one client can never see another's data.
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── Stores ─────────────────────────────────────────────────────────────────
-- Stores within a client. The id is the short code already used as `StoreId`
-- in components/dashboard/data.ts ('wp' | 'wg' | 'lv' | 'wm') so the existing
-- UI keeps working unchanged.
create table if not exists stores (
  id          text primary key,
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  tier        text not null check (tier in ('Established', 'Newer')),
  created_at  timestamptz not null default now()
);

-- ── Seed: Woof Gang + its four Orlando stores ──────────────────────────────
insert into clients (slug, name)
values ('woof-gang', 'Woof Gang')
on conflict (slug) do nothing;

insert into stores (id, client_id, name, tier)
select v.id, c.id, v.name, v.tier
from clients c
cross join (values
  ('wp', 'Winter Park',      'Established'),
  ('wg', 'Winter Garden',    'Established'),
  ('lv', 'Lakeside Village', 'Newer'),
  ('wm', 'Windermere',       'Newer')
) as v(id, name, tier)
where c.slug = 'woof-gang'
on conflict (id) do nothing;

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- RLS on from day one. These are TEMPORARY read-only policies so we can verify
-- the pipe before auth exists. In Phase 1 (real auth) they get replaced with
-- session-scoped policies: a row is visible iff it belongs to the signed-in
-- user's client (and, for managers, their store).
alter table clients enable row level security;
alter table stores  enable row level security;

create policy "temp public read — replace in auth phase" on clients
  for select using (true);
create policy "temp public read — replace in auth phase" on stores
  for select using (true);
