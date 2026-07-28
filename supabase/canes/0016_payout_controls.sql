-- 0016_payout_controls.sql — Canes Pressure Washing (jeznnlveaymtrhisqckq).
--
-- Sebastian's payout asks, July 2026:
--   1. "DJ gets 15 percent of profit after job MATERIAL expenses. $1000 job with
--      $300 sealer, he gets 15 percent of 700. I don't want him to get profits
--      taken away from outside of job expenses."
--      -> new comp_type 'job_margin_share': per-job revenue minus that job's
--         MATERIAL-category expenses only. Overhead and labor never touch it,
--         unlike the existing company-wide 'profit_share'.
--   2. "Manual buttons so I can correct the payout stats if needed to" — correct
--      a day's hours, or set what someone actually took home.
--      -> two append-only adjustment tables. The tamper-proof timesheet
--         (job_time_entries) is NEVER mutated: the owner's correction sits
--         beside the clocked figure so both stay visible. That timesheet exists
--         precisely "so employees can't screw over the owner", and overwriting
--         it would destroy the evidence it was built to preserve.
--
-- Additive and idempotent. Deny-all RLS like every other table here.

-- ── 1. job margin share ─────────────────────────────────────────────────────
alter table team_members drop constraint if exists team_members_comp_type_check;
alter table team_members add constraint team_members_comp_type_check
  check (comp_type in ('profit_split', 'profit_share', 'hourly', 'none', 'job_margin_share'));

-- Which job_expenses categories count as "material" for job_margin_share.
-- Stored rather than hardcoded so Sebastian can retune it from Settings without
-- a deploy; the payout code falls back to this exact list when the row is absent.
insert into settings (key, value)
values ('margin_share_categories', '["Materials"]'::jsonb)
on conflict (key) do nothing;

-- ── 2. owner corrections to clocked hours ───────────────────────────────────
-- One row per person per ET calendar day. The clocked total is recomputed live
-- from job_time_entries; this only records what the owner says it should be.
create table if not exists time_adjustments (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  team_member_id  uuid not null references team_members (id) on delete cascade,
  work_date       date not null,                  -- ET calendar day being corrected
  minutes         int  not null check (minutes >= 0),
  reason          text,
  created_by      text,
  unique (team_member_id, work_date)
);
create index if not exists time_adjustments_member_idx
  on time_adjustments (team_member_id, work_date);
alter table time_adjustments enable row level security;

-- ── 3. owner overrides to a payout line ─────────────────────────────────────
-- period_key mirrors the Payouts page range: 'day:2026-07-27', 'week:2026-07-27'
-- (Monday), 'month:2026-07', 'year:2026'. Storing the computed figure alongside
-- the override keeps "what the system said" auditable after the fact.
create table if not exists payout_overrides (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  team_member_id  uuid not null references team_members (id) on delete cascade,
  period_key      text not null,
  amount_cents    int  not null check (amount_cents >= 0),
  computed_cents  int,                             -- what the waterfall produced
  reason          text,
  created_by      text,
  unique (team_member_id, period_key)
);
create index if not exists payout_overrides_period_idx
  on payout_overrides (period_key);
alter table payout_overrides enable row level security;
