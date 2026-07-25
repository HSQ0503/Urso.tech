-- Urso Brain migration 0003 — M4 evaluation history.
-- Run after 0002_company_brain.sql in the dedicated Urso HQ project.

create table if not exists brain_eval_runs (
  id               uuid primary key,
  organization_id  text not null references brain_organizations(id) on delete cascade,
  suite_id          text not null,
  suite_version     integer not null,
  suite_hash        text not null,
  mode              text not null check (mode in ('retrieval', 'full')),
  status            text not null default 'running'
                   check (status in ('running', 'passed', 'failed', 'error')),
  answer_provider   text not null,
  answer_model      text not null,
  judge_provider    text not null,
  judge_model       text not null,
  thresholds        jsonb not null default '{}'::jsonb,
  metrics           jsonb not null default '{}'::jsonb,
  git_sha           text,
  git_branch        text,
  trigger_source    text not null default 'local',
  started_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index if not exists brain_eval_runs_org_time_idx
  on brain_eval_runs (organization_id, started_at desc);

create table if not exists brain_eval_results (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references brain_eval_runs(id) on delete cascade,
  case_id           text not null,
  category          text not null,
  status            text not null check (status in ('passed', 'failed', 'error')),
  query             text not null,
  persona           jsonb not null,
  project_id        text,
  receipt           jsonb,
  answer            text,
  judge             jsonb,
  metrics           jsonb not null default '{}'::jsonb,
  usage             jsonb not null default '{}'::jsonb,
  failure_reasons   text[] not null default '{}',
  duration_ms       integer not null default 0,
  created_at        timestamptz not null default now(),
  unique (run_id, case_id)
);
create index if not exists brain_eval_results_run_status_idx
  on brain_eval_results (run_id, status, case_id);

alter table brain_eval_runs    enable row level security;
alter table brain_eval_results enable row level security;

-- No browser policies: evaluation history is written and read only through
-- trusted server/CI tooling using the Urso service key.
