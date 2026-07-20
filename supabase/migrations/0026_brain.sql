-- Migration 0026 — Urso Brain: the identity-aware company-brain chat (/brain).
-- Vault docs are synced in by scripts/brain-sync.mjs; chat context is assembled
-- per request from the user's department + active project + standing rules.
-- See vault: "07 - Urso Brain/Urso Brain — Product & v1 Spec".
--
-- RLS on with NO policies on every table: server-only via the service-role key,
-- ownership enforced in code — same pattern as the analyst tables (0023).
-- Tighten with auth.uid() policies at multi-tenant hardening.

create table if not exists brain_departments (
  id     text primary key,              -- slug, e.g. 'marketing'
  name   text not null,
  blurb  text not null default '',
  sort   int  not null default 0
);

create table if not exists brain_projects (
  id            text primary key,       -- slug, e.g. 'canes'
  name          text not null,
  blurb         text not null default '',
  status        text not null default 'active' check (status in ('active', 'archived')),
  sort          int  not null default 0
);

-- One synced vault doc per row. `path` is the stable sync key (vault-relative);
-- the sync script hash-upserts and prunes by it.
create table if not exists brain_docs (
  id            uuid primary key default gen_random_uuid(),
  path          text not null unique,
  title         text not null,
  description   text not null default '',
  department_id text references brain_departments(id),
  project_id    text references brain_projects(id),
  doc_type      text not null default 'doc' check (doc_type in ('core', 'doc', 'rule')),
  audience      text[] not null default '{}',   -- rules: department slugs or 'all'
  tags          text[] not null default '{}',
  content       text not null,
  content_hash  text not null,
  synced_at     timestamptz not null default now()
);
create index if not exists brain_docs_project_idx    on brain_docs (project_id);
create index if not exists brain_docs_department_idx on brain_docs (department_id);
create index if not exists brain_docs_type_idx       on brain_docs (doc_type);

-- Who the user is inside the brain. Department/title are self-serve (settings);
-- switching department is also how a demo persona is played.
create table if not exists brain_profiles (
  user_id       text primary key,               -- Supabase auth uid
  name          text not null,
  department_id text not null references brain_departments(id),
  title         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- BYO org keys, one per provider, AES-256-GCM encrypted with BRAIN_KEYS_SECRET.
-- Only the last 4 characters are ever sent back to the client.
create table if not exists brain_org_keys (
  provider        text primary key check (provider in ('anthropic', 'openai', 'google', 'moonshot')),
  key_ciphertext  text not null,
  key_last4       text not null,
  updated_by      text not null default '',
  updated_at      timestamptz not null default now()
);

create table if not exists brain_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  project_id  text references brain_projects(id),
  model       text not null default '',         -- last-used catalog model id
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists brain_threads_user_idx on brain_threads (user_id, updated_at desc);

create table if not exists brain_messages (
  id          text primary key,                 -- UIMessage id (server-generated)
  thread_id   uuid not null references brain_threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  parts       jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists brain_messages_thread_idx on brain_messages (thread_id, created_at);

alter table brain_departments enable row level security;
alter table brain_projects    enable row level security;
alter table brain_docs        enable row level security;
alter table brain_profiles    enable row level security;
alter table brain_org_keys    enable row level security;
alter table brain_threads     enable row level security;
alter table brain_messages    enable row level security;
-- No policies on purpose: server-only via service-role; ownership enforced in code.

-- Seed the five demo departments and the current project slate.
insert into brain_departments (id, name, blurb, sort) values
  ('exec',      'Executive',  'Company direction — what Urso sells, to whom, and what gets built next.', 0),
  ('software',  'Software',   'Builds and runs everything: the dashboard, client platforms, the Brain.', 1),
  ('sales',     'Sales',      'Deals, pricing, client relationships, and the pipeline.', 2),
  ('marketing', 'Marketing',  'Brand, positioning, and outbound material.', 3),
  ('legal',     'Legal',      'Contracts, compliance, and the standing rules other departments follow.', 4)
on conflict (id) do nothing;

insert into brain_projects (id, name, blurb, sort) values
  ('woof-gang',          'Woof Gang',           'Pilot client — 4-store pet grooming/retail dashboard on real FranPOS data, plus the urso.ai analyst.', 0),
  ('canes',              'Canes Pressure Washing', 'Field-service platform: leads + phone funnel, estimates, scheduler, payments.', 1),
  ('1500-blueprint',     '1500 Blueprint Drills', 'Scott Robinson''s SAT practice-test platform (Bluebook emulator, AI drilling).', 2),
  ('health-monitor-one', 'Health Monitor One',  'AI nurse-scheduling/routing engine for a Florida preventive-care company.', 3),
  ('urso-brain',         'Urso Brain',          'This product — the identity-aware company-brain chat.', 4)
on conflict (id) do nothing;
