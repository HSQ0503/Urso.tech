-- Canes Pressure Washing — 0017 (applied-migrations ledger). Run in the CANES
-- project (jeznnlveaymtrhisqckq), NOT Woof Gang. Same ledger as Woof Gang's
-- 0026: applies are manual, and whether 0014+0015 have hit live is exactly the
-- kind of fact this table exists to answer. checksum is null on backfilled
-- rows (hashing arrives with the apply script); the backfill only asserts the
-- file EXISTS in the repo — on conflict do nothing keeps a re-run or a
-- later real apply from fighting these rows.

create table if not exists schema_migrations (
  filename   text primary key,
  checksum   text,
  applied_at timestamptz not null default now(),
  applied_by text
);

-- Service-role only: RLS on, NO policies — deploy history is not app data.
alter table schema_migrations enable row level security;

insert into schema_migrations (filename, checksum, applied_by) values
  ('0001_init.sql',                  null, 'backfill'),
  ('0002_estimates.sql',             null, 'backfill'),
  ('0003_catalog_seed.sql',          null, 'backfill'),
  ('0004_scheduler.sql',             null, 'backfill'),
  ('0005_invoicing.sql',             null, 'backfill'),
  ('0006_customers.sql',             null, 'backfill'),
  ('0007_ops_feedback.sql',          null, 'backfill'),
  ('0008_growth.sql',                null, 'backfill'),
  ('0009_crew_accounts.sql',         null, 'backfill'),
  ('0010_owner_crew_checklists.sql', null, 'backfill'),
  ('0011_job_media.sql',             null, 'backfill'),
  ('0012_invoice_rewards.sql',       null, 'backfill'),
  ('0013_deposits.sql',              null, 'backfill'),
  ('0014_estimate_expenses.sql',     null, 'backfill'),
  ('0015_ops_permissions.sql',       null, 'backfill'),
  ('0016_payout_controls.sql',       null, 'backfill'),
  ('0017_schema_migrations.sql',     null, 'backfill')
on conflict (filename) do nothing;
