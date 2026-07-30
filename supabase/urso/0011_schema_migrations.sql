-- Urso Brain migration 0011 — applied-migrations ledger for the Urso HQ
-- project. Same shape as Woof Gang's 0026 / Canes' 0017: three Supabase
-- projects, three manual apply paths, one queryable answer to "did this file
-- run here". checksum null on backfilled rows; the apply script fills it once
-- ledger-aware applies ship.

create table if not exists schema_migrations (
  filename   text primary key,
  checksum   text,
  applied_at timestamptz not null default now(),
  applied_by text
);

-- Service-role only: RLS on, NO policies — matches every other brain table.
alter table schema_migrations enable row level security;

insert into schema_migrations (filename, checksum, applied_by) values
  ('0001_brain.sql',                               null, 'backfill'),
  ('0002_company_brain.sql',                       null, 'backfill'),
  ('0003_brain_evaluations.sql',                   null, 'backfill'),
  ('0004_brain_trust_hardening.sql',               null, 'backfill'),
  ('0005_brain_temporal_truth.sql',                null, 'backfill'),
  ('0006_brain_controlled_learning.sql',           null, 'backfill'),
  ('0007_brain_gardener_operations.sql',           null, 'backfill'),
  ('0008_brain_learning_operations.sql',           null, 'backfill'),
  ('0009_brain_learning_operations_privileges.sql', null, 'backfill'),
  -- 0010_woof_gang_org DELIBERATELY NOT backfilled: it ships in the same
  -- wave as this ledger and is recorded by the apply script when it runs.
  ('0011_schema_migrations.sql',                   null, 'backfill')
on conflict (filename) do nothing;
