-- Canes Pressure Washing — Phase 2 (scheduler). Run in the CANES project
-- (jeznnlveaymtrhisqckq). Turns an approved `unscheduled` job into scheduled,
-- dispatched, confirmed work: real duration, a crew resource, a line-item
-- snapshot, non-job calendar blocks, and a day-before customer confirmation on
-- the existing tasks outbox. All additions are additive (nullable or defaulted),
-- so existing rows are never rewritten. RLS deny-all like 0001/0002: enable, no
-- policies — all access is server-side with the secret key. Money in integer cents.

-- ── crews: the schedulable resource. Created before jobs.crew_id so its FK
--    resolves. Colors come from the cool .cp-* palette; brand orange stays chrome.
create table if not exists crews (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  color      text not null default '#0b6aa2',
  active     boolean not null default true,
  sort       int not null default 0
);
alter table crews enable row level security;   -- deny-all; server uses service key

-- ── Jobs: give a job a real duration, a resource to schedule against, and the
--    data a day-before confirmation needs without a join. All additive.
alter table jobs add column if not exists duration_minutes       int  not null default 120;
alter table jobs add column if not exists ends_at                timestamptz;              -- derived scheduled_at + duration; stored so range queries are trivial
alter table jobs add column if not exists arrival_window_minutes int  not null default 0;  -- 0 = exact time; >0 renders "arrives between"
alter table jobs add column if not exists crew_id                uuid references crews (id) on delete set null;
alter table jobs add column if not exists confirmed_at           timestamptz;              -- set when the customer replies YES; scheduling audit
alter table jobs add column if not exists customer_phone         text;                     -- snapshot at handoff, so the day-before text needs no join
alter table jobs add column if not exists job_name               text;                     -- service label shown on the calendar block
alter table jobs add column if not exists gate_code              text;                     -- site access, shown only on the run sheet
alter table jobs add column if not exists site_notes             text;                     -- replaces the per-job Google Doc's freeform notes
alter table jobs add column if not exists canceled_reason        text;                     -- cancel / no-show reason
create index if not exists jobs_scheduled_idx on jobs (scheduled_at);  -- calendar range queries: "jobs between X and Y"
create index if not exists jobs_crew_idx      on jobs (crew_id);       -- run sheet: "this crew's jobs today"

-- ── job_items: snapshot the sold work at handoff (this becomes the run-sheet
--    checklist). A snapshot, not a live join, so editing the estimate later
--    never rewrites a dispatched job — same discipline as estimate line items.
create table if not exists job_items (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references jobs (id) on delete cascade,
  estimate_item_id  uuid references estimate_items (id) on delete set null,
  position          int  not null default 0,
  name              text not null,
  description       text,
  quantity          numeric not null default 1,
  line_total_cents  int  not null default 0,
  done              boolean not null default false  -- doubles as the on-site completion checklist (FOLLOW build writes this)
);
create index if not exists job_items_job_idx on job_items (job_id, position);
alter table job_items enable row level security;  -- deny-all

-- ── calendar_events: non-job blocks (holidays, time off, notes). Kept separate
--    from jobs so the two are never conflated on the calendar.
create table if not exists calendar_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,
  crew_id      uuid references crews (id) on delete set null,  -- null = affects everyone (holiday); set = one crew off
  kind         text not null default 'block'
               check (kind in ('block', 'time_off', 'holiday', 'note')),
  notes        text
);
create index if not exists calendar_events_range_idx on calendar_events (starts_at);
alter table calendar_events enable row level security;  -- deny-all

-- ── Add the day-before job confirmation kind to the tasks outbox.
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest',
  'estimate_send', 'estimate_reminder',
  'job_confirmation'  -- NEW: day-before customer confirmation for a scheduled job
));

-- ── Settings: the day-before job confirmation template + a job confirmation
--    offset (jobs are planned further out than estimate visits, so ~24h).
insert into settings (key, value) values
  ('job_confirmation_template', '"Hi{name}, this is Canes Pressure Washing confirming your appointment {when} at {address}. Reply YES to confirm. Reply STOP to opt out."'),
  ('job_confirmation_offset_hours', '24')
on conflict (key) do nothing;
