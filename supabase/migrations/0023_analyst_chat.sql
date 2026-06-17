-- Migration 0023 — memory for the urso.ai strategy console (the general chat on
-- the AI actions page). That console (/api/ai/agent) was stateless: conversations
-- lived only in client React state and vanished on reload. This adds three tables:
--
--   analyst_threads   one named conversation per row, per user (multiple threads)
--   analyst_messages  the persisted UIMessage turns (idempotent upsert by id)
--   analyst_memory    one rolling, distilled summary per user — injected into the
--                     system prompt of EVERY new conversation so the analyst
--                     recalls durable facts/decisions across separate threads
--                     (the same memory idea the weekly brief already uses).
--
-- Scoped by user_id (the Supabase auth uid, stored as text). RLS on with NO
-- policies: these are written/read only by the authenticated server routes via
-- the service-role key, which enforce user ownership in code — same pattern as
-- quickbooks_pnl. Tighten with auth.uid() policies at multi-tenant hardening.

create table if not exists analyst_threads (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null,                    -- tenant slug, e.g. 'woof-gang'
  user_id     text not null,                    -- Supabase auth uid
  title       text not null default 'New conversation',
  scope       text not null default 'all',      -- the dashboard filter at creation
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists analyst_threads_user_idx on analyst_threads (user_id, updated_at desc);

create table if not exists analyst_messages (
  id          text primary key,                 -- UIMessage id (client/server-generated, stable)
  thread_id   uuid not null references analyst_threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  parts       jsonb not null,                   -- UIMessage.parts (text + tool parts)
  created_at  timestamptz not null default now()
);
create index if not exists analyst_messages_thread_idx on analyst_messages (thread_id, created_at);

create table if not exists analyst_memory (
  user_id     text primary key,                 -- one rolling memory per user
  client_id   text not null,
  summary     text not null default '',
  updated_at  timestamptz not null default now()
);

alter table analyst_threads  enable row level security;
alter table analyst_messages enable row level security;
alter table analyst_memory   enable row level security;
-- No policies on purpose: server-only via service-role; ownership enforced in code.
