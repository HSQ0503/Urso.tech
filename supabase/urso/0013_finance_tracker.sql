-- Urso HQ migration 0013 — internal finance tracker.
--
-- Finance data belongs to Urso itself, not to a client tenant. These tables
-- therefore live beside the Brain in the dedicated Urso HQ project. They are
-- service-role only: the /fi server components and actions authenticate Han or
-- Guga before using the server key, while browsers receive no table access.

begin;

create table if not exists urso_finance_deals (
  id uuid primary key default gen_random_uuid(),
  client_name text not null check (char_length(trim(client_name)) between 1 and 120),
  deal_name text not null check (char_length(trim(deal_name)) between 1 and 160),
  contracted_cents bigint not null check (contracted_cents > 0),
  planned_han_draw_cents bigint not null default 0 check (planned_han_draw_cents >= 0),
  planned_guga_draw_cents bigint not null default 0 check (planned_guga_draw_cents >= 0),
  signed_on date,
  status text not null default 'active' check (status in ('active', 'complete', 'canceled')),
  notes text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_han_draw_cents + planned_guga_draw_cents <= contracted_cents)
);

create table if not exists urso_finance_entries (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references urso_finance_deals(id) on delete restrict,
  entry_type text not null check (
    entry_type in ('income', 'expense', 'founder_draw', 'founder_contribution', 'refund')
  ),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  category text not null default 'other' check (char_length(trim(category)) between 1 and 80),
  counterparty text not null default '' check (char_length(counterparty) <= 160),
  founder text check (founder in ('han', 'guga')),
  notes text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  check (
    (entry_type in ('founder_draw', 'founder_contribution') and founder is not null)
    or
    (entry_type not in ('founder_draw', 'founder_contribution') and founder is null)
  )
);

create index if not exists urso_finance_entries_occurred_idx
  on urso_finance_entries (occurred_on desc, created_at desc)
  where voided_at is null;

create index if not exists urso_finance_entries_deal_idx
  on urso_finance_entries (deal_id, occurred_on desc)
  where voided_at is null;

alter table urso_finance_deals enable row level security;
alter table urso_finance_entries enable row level security;

revoke all on urso_finance_deals from anon, authenticated;
revoke all on urso_finance_entries from anon, authenticated;

-- Seed the two allocations from Han's brief. These are CONTRACTS only; no cash
-- entry is created until a payment actually reaches Urso.
insert into urso_finance_deals (
  id,
  client_name,
  deal_name,
  contracted_cents,
  planned_han_draw_cents,
  planned_guga_draw_cents,
  notes,
  created_by
) values
  (
    'f1000000-0000-4000-8000-000000000001',
    'Canes Pressure Washing',
    'Sebastian platform build + retainer',
    300000,
    50000,
    50000,
    'Total includes the build and three monthly $250 fees.',
    'seed:user-brief-2026-08-03'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    '1500 Blueprint Drills',
    'Scott platform build',
    150000,
    20000,
    20000,
    'Initial Scott engagement.',
    'seed:user-brief-2026-08-03'
  )
on conflict (id) do update set
  client_name = excluded.client_name,
  deal_name = excluded.deal_name,
  contracted_cents = excluded.contracted_cents,
  planned_han_draw_cents = excluded.planned_han_draw_cents,
  planned_guga_draw_cents = excluded.planned_guga_draw_cents,
  notes = excluded.notes,
  updated_at = now();

commit;
