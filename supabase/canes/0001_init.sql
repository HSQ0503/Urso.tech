-- Canes Pressure Washing — Phase 1 (leads + phone funnel)
-- Run this in the CANES Supabase project's SQL editor (jeznnlveaymtrhisqckq),
-- NOT the Woof Gang project. Separate database by design.

-- Leads: one row per prospective customer. Hot = arrives with an estimate
-- appointment already set by the lead vendor; cold = virtual-quote request.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null default 'cold' check (type in ('hot', 'cold')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'appointment_set', 'confirmed', 'estimated', 'won', 'lost')),
  name text,
  phone text unique,                 -- E.164; the customer's number, threads key on it
  address text,
  service text,
  source text not null default 'lead_vendor'
    check (source in ('lead_vendor', 'website', 'referral', 'other')),
  appointment_at timestamptz,       -- the estimate visit
  confirmed_at timestamptz,
  lost_reason text,
  notes text,
  raw_message text,                 -- the vendor text this lead was parsed from
  parse_confidence real,            -- 0..1 from the LLM parse; low = review
  opted_out boolean not null default false,
  snoozed_until timestamptz,
  last_activity_at timestamptz not null default now()
);
create index if not exists leads_status_idx on leads (status);
create index if not exists leads_appointment_idx on leads (appointment_at);
create index if not exists leads_activity_idx on leads (last_activity_at desc);

-- Messages: every SMS/MMS in or out. peer_phone is the external number the
-- message traveled to/from (a lead, the vendor, or an unknown).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references leads (id) on delete set null,
  peer_phone text not null,
  direction text not null check (direction in ('in', 'out')),
  body text not null default '',
  media_urls jsonb not null default '[]'::jsonb,
  automated boolean not null default false,
  twilio_sid text,
  delivery_status text              -- queued/sent/delivered/failed from status callbacks
);
create index if not exists messages_peer_idx on messages (peer_phone, created_at desc);
create index if not exists messages_lead_idx on messages (lead_id, created_at desc);
create index if not exists messages_sid_idx on messages (twilio_sid);

-- Calls: forwarded inbound calls and click-to-call bridges.
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references leads (id) on delete set null,
  peer_phone text not null,
  direction text not null check (direction in ('in', 'out')),
  status text,                      -- completed / no-answer / busy / voicemail
  duration_seconds int,
  recording_url text,
  transcript text,
  twilio_sid text
);
create index if not exists calls_lead_idx on calls (lead_id, created_at desc);

-- Tasks: the automation outbox + idempotency ledger. One row per intended
-- automated action; dedupe_key makes retries and cron overlaps safe.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references leads (id) on delete cascade,
  kind text not null check (kind in (
    'hold_text', 'confirmation', 'no_reply_escalation',
    'cold_escalation', 'follow_up', 'digest'
  )),
  dedupe_key text not null unique,  -- e.g. 'confirmation:<lead>:<appt-iso>' or 'digest:2026-07-04'
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'canceled', 'failed')),
  payload jsonb not null default '{}'::jsonb
);
create index if not exists tasks_due_idx on tasks (status, scheduled_for);

-- Events: the per-lead activity timeline (created, parsed, confirmed, edited...).
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references leads (id) on delete cascade,
  kind text not null,
  detail text,
  data jsonb not null default '{}'::jsonb
);
create index if not exists events_lead_idx on events (lead_id, created_at desc);

-- Settings: single-row-per-key configuration editable from the UI.
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('quiet_hours', '{"start": 21, "end": 8, "timezone": "America/New_York"}'),
  ('confirmation_offset_hours', '12'),
  ('templates', '{
    "hold_text": "Hi{name}! This is Canes Pressure Washing. We got your request and Sebastian will call you in just a few minutes. Reply STOP to opt out.",
    "confirmation": "Hi{name}, this is Canes Pressure Washing confirming your free estimate visit {when} at {address}. Reply YES to confirm. Reply STOP to opt out.",
    "confirmation_ack": "You are confirmed for {when}. See you then! - Canes Pressure Washing. Reply STOP to opt out.",
    "missed_call": "Hi, this is Canes Pressure Washing. Sorry we missed your call - we will get back to you shortly. Reply here and we will text you right back. Reply STOP to opt out."
  }'),
  ('lead_vendor_phones', '[]')
on conflict (key) do nothing;

-- Lock everything down: RLS on, no policies. The publishable key can read
-- nothing; all access goes through the server with the secret key.
alter table leads enable row level security;
alter table messages enable row level security;
alter table calls enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table settings enable row level security;
