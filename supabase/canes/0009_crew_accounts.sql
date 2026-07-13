-- Canes Pressure Washing — 0009: individual technician accounts + crew portal.
-- Run in the Canes Supabase project after 0008_growth.sql.
--
-- The browser never reads these tables directly. RLS remains deny-all and the
-- Next.js server uses the Canes secret key after verifying the technician's
-- Supabase Auth session and crew assignment. This keeps pricing and unrelated
-- customer/job data out of the technician surface by construction.

-- The existing payout roster becomes the owner-managed employee allowlist.
alter table team_members add column if not exists phone text;
alter table team_members add column if not exists email text;
create unique index if not exists team_members_email_unique
  on team_members (lower(email)) where email is not null;

-- Sebastian's questionnaire named one initial technician. Keep this seed
-- idempotent and reuse an existing Crew 1 / Shouqi row when present.
insert into crews (name, color, active, sort)
select 'Crew 1', '#0b6aa2', true, 0
where not exists (select 1 from crews where lower(name) = 'crew 1');

update team_members
set email = 'theyeeterboi53@gmail.com',
    phone = '+16892502341',
    role = 'worker',
    crew_id = (select id from crews where lower(name) = 'crew 1' order by created_at limit 1),
    active = true
where lower(name) = 'shouqi han'
  and email is null;

insert into team_members (name, role, comp_type, hourly_cents, crew_id, active, sort, phone, email)
select
  'Shouqi Han',
  'worker',
  'hourly',
  0,
  (select id from crews where lower(name) = 'crew 1' order by created_at limit 1),
  true,
  100,
  '+16892502341',
  'theyeeterboi53@gmail.com'
where not exists (
  select 1 from team_members
  where lower(coalesce(email, '')) = 'theyeeterboi53@gmail.com'
     or lower(name) = 'shouqi han'
);

-- One account per employee. `email` is duplicated intentionally so the login
-- action can check the owner-approved allowlist without reading auth.users.
create table if not exists crew_accounts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  auth_user_id    uuid not null unique references auth.users (id) on delete cascade,
  team_member_id  uuid not null unique references team_members (id) on delete cascade,
  email           text not null,
  account_role    text not null default 'technician'
                  check (account_role in ('technician')),
  active          boolean not null default true,
  last_login_at   timestamptz
);
create unique index if not exists crew_accounts_email_unique on crew_accounts (lower(email));
alter table crew_accounts enable row level security;

-- Separate access rows keep authorization ready for an employee who may be
-- assigned to more than one crew later. Shouqi currently receives Crew 1 only.
create table if not exists crew_account_access (
  account_id  uuid not null references crew_accounts (id) on delete cascade,
  crew_id     uuid not null references crews (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (account_id, crew_id)
);
create index if not exists crew_account_access_crew_idx on crew_account_access (crew_id);
alter table crew_account_access enable row level security;

-- A technician can have only one open check-in at a time. Closed rows form the
-- hours ledger; technicians see duration only, never pay or payout figures.
create table if not exists job_time_entries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  job_id      uuid not null references jobs (id) on delete cascade,
  account_id  uuid not null references crew_accounts (id) on delete cascade,
  checked_in_at   timestamptz not null default now(),
  checked_out_at  timestamptz,
  check (checked_out_at is null or checked_out_at >= checked_in_at)
);
create unique index if not exists job_time_entries_one_open_per_account
  on job_time_entries (account_id) where checked_out_at is null;
create index if not exists job_time_entries_job_idx on job_time_entries (job_id, checked_in_at);
create index if not exists job_time_entries_account_idx on job_time_entries (account_id, checked_in_at);
alter table job_time_entries enable row level security;

-- Append-only audit trail for owner progress views and later notifications.
create table if not exists job_activity_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  job_id      uuid not null references jobs (id) on delete cascade,
  account_id  uuid references crew_accounts (id) on delete set null,
  event_type  text not null,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists job_activity_events_job_idx
  on job_activity_events (job_id, created_at desc);
alter table job_activity_events enable row level security;

-- The sold job-item snapshot is also the current run-sheet checklist. These
-- fields add technician attribution, notes, and blocked-step reporting without
-- exposing line_total_cents in the crew data layer.
alter table job_items add column if not exists required boolean not null default true;
alter table job_items add column if not exists technician_note text;
alter table job_items add column if not exists blocked boolean not null default false;
alter table job_items add column if not exists completed_at timestamptz;
alter table job_items add column if not exists completed_by uuid references crew_accounts (id) on delete set null;
alter table job_items add column if not exists blocked_at timestamptz;
alter table job_items add column if not exists blocked_by uuid references crew_accounts (id) on delete set null;

alter table jobs add column if not exists technician_completed_at timestamptz;
alter table jobs add column if not exists technician_completed_by uuid references crew_accounts (id) on delete set null;

-- If the Auth user was provisioned before this migration, link it now. Normal
-- operation provisions approved employees just-in-time on their first login.
insert into crew_accounts (auth_user_id, team_member_id, email, active)
select u.id, tm.id, lower(tm.email), tm.active
from team_members tm
join auth.users u on lower(u.email) = lower(tm.email)
where tm.email is not null
  and tm.role = 'worker'
on conflict do nothing;

insert into crew_account_access (account_id, crew_id)
select ca.id, tm.crew_id
from crew_accounts ca
join team_members tm on tm.id = ca.team_member_id
where tm.crew_id is not null
on conflict do nothing;
