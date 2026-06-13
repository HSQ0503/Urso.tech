-- AI-written weekly brief narrative (urso.ai). The Brief page's NUMBERS stay
-- deterministic (computed from metrics_daily at render time); this table holds
-- only the prose the weekly cron writes every Monday. Written by the service
-- key from /api/ai/weekly; read by the dashboard, which falls back to the
-- template narrative when no fresh row exists.

create table if not exists ai_briefs (
  client_id      uuid not null references clients(id) on delete cascade,
  scope          text not null,                 -- 'all' or a store id ('wp', 'wg', 'lv', 'wm')
  week_start     date not null,                 -- first day of the 7-day window the brief covers
  headline       text not null,
  wins           jsonb not null default '[]'::jsonb,   -- string[]
  risks          jsonb not null default '[]'::jsonb,   -- string[]
  opportunity    jsonb,                         -- { "title": string, "detail": string }
  recommendation text,
  model          text,
  created_at     timestamptz not null default now(),
  primary key (client_id, scope, week_start)
);

alter table ai_briefs enable row level security;
drop policy if exists "temp read — replace in auth phase" on ai_briefs;
create policy "temp read — replace in auth phase" on ai_briefs for select using (true);
