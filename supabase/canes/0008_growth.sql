-- Canes Pressure Washing — 0008: growth round. Run in the CANES project
-- (jeznnlveaymtrhisqckq), after 0007. Three additive features:
--   (1) new lead sources for Sebastian's marketing mix (Meta ads, yard signs,
--       door hangers) so channel attribution covers what he is about to run;
--   (2) business/overhead expenses NOT tied to a job (subscriptions, insurance,
--       truck, marketing), including recurring monthly/yearly rows;
--   (3) team members + a settable profit split so payouts show each person's cut.
-- All additive; RLS deny-all like every prior migration. Money in integer cents.

-- ── (1) Widen the lead source check to the new channels.
alter table leads drop constraint if exists leads_source_check;
alter table leads add constraint leads_source_check check (source in (
  'lead_vendor', 'website', 'referral', 'meta_ads', 'yard_sign', 'door_hanger', 'other'
));

-- ── (2) business_expenses: overhead, not attached to a job. A recurring row
--    (monthly/yearly) counts every period it is active between incurred_on and
--    ends_on; a one_time row counts once, on incurred_on.
create table if not exists business_expenses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  amount_cents int  not null check (amount_cents >= 0),
  category    text not null default 'Other',
  recurring   boolean not null default false,
  frequency   text not null default 'one_time'
              check (frequency in ('one_time', 'monthly', 'yearly')),
  incurred_on date not null default (now() at time zone 'America/New_York')::date,
  ends_on     date,          -- recurring end; null = ongoing
  active      boolean not null default true,
  note        text
);
create index if not exists business_expenses_incurred_idx on business_expenses (incurred_on);
alter table business_expenses enable row level security;  -- deny-all; server key only

-- ── (3) team_members: the people who get paid, and how. profit_split members
--    (owner/partner) share the distributable profit; profit_share (ops manager)
--    takes a % of gross; hourly workers are paid rate x hours.
create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  role        text not null default 'worker'
              check (role in ('owner', 'partner', 'ops_manager', 'worker')),
  comp_type   text not null default 'hourly'
              check (comp_type in ('profit_split', 'profit_share', 'hourly', 'none')),
  comp_bps    int  not null default 0,   -- profit_split / profit_share, basis points (6000 = 60%)
  hourly_cents int not null default 0,    -- hourly workers, cents per hour
  crew_id     uuid references crews (id) on delete set null,  -- worker -> crew (labor proxy)
  active      boolean not null default true,
  sort        int  not null default 0
);
alter table team_members enable row level security;  -- deny-all

-- Seed the default 60/40 owner/partner split ONLY when the roster is empty, so a
-- re-run never duplicates and an edited roster is never overwritten. Names are
-- placeholders Sebastian renames in the Team UI.
insert into team_members (name, role, comp_type, comp_bps, sort)
select v.name, v.role, v.comp_type, v.comp_bps, v.sort
from (values
  ('Sebastian', 'owner',   'profit_split', 6000, 0),
  ('Brother',   'partner', 'profit_split', 4000, 1)
) as v(name, role, comp_type, comp_bps, sort)
where not exists (select 1 from team_members);
