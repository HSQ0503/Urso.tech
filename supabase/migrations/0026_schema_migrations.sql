-- Migration 0026 — schema_migrations: the applied-migrations ledger (Woof Gang
-- project). Migrations here are applied by hand/script against the live
-- project, and "which ones have actually run" currently lives in someone's
-- head — the ledger makes it queryable. checksum is null on backfilled rows
-- (the files ran before hashing existed); the apply script fills it going
-- forward. Lives in public — distinct from the Supabase CLI's own
-- supabase_migrations schema, which this project does not use.

create table if not exists schema_migrations (
  filename   text primary key,
  checksum   text,
  applied_at timestamptz not null default now(),
  applied_by text
);

-- Service-role only: RLS on, NO policies — same posture as the franpos staging
-- tables (0006). Session roles have no business reading deploy history.
alter table schema_migrations enable row level security;

-- Backfill: everything on disk has already been applied to the live project.
insert into schema_migrations (filename, checksum, applied_by) values
  ('0001_tenancy.sql',                        null, 'backfill'),
  ('0002_data_tables.sql',                    null, 'backfill'),
  ('0003_aggregate_functions.sql',            null, 'backfill'),
  ('0004_quickbooks_connections.sql',         null, 'backfill'),
  -- 0005_twilio_missed_calls DELIBERATELY NOT backfilled: the 2026-07-30 live
  -- probe showed twilio_numbers/record_call were never applied to prod (the
  -- Twilio feed is still pending). Apply 0005 for real when Twilio goes live —
  -- the apply script records it then.
  ('0006_franpos_staging.sql',                null, 'backfill'),
  ('0007_franpos_rollup_v2.sql',              null, 'backfill'),
  ('0008_franpos_passthrough.sql',            null, 'backfill'),
  ('0009_fix_ticket_and_return_rate.sql',     null, 'backfill'),
  ('0010_real_customer_analytics.sql',        null, 'backfill'),
  ('0011_compare_product_cost.sql',           null, 'backfill'),
  ('0012_grooming_cycle.sql',                 null, 'backfill'),
  ('0013_app_users.sql',                      null, 'backfill'),
  ('0014_dormant_segment_cohort_monthly.sql', null, 'backfill'),
  ('0015_quickbooks_pnl.sql',                 null, 'backfill'),
  ('0016_staff_roles.sql',                    null, 'backfill'),
  ('0017_ai_briefs.sql',                      null, 'backfill'),
  ('0018_product_identity.sql',               null, 'backfill'),
  ('0019_action_persistence.sql',             null, 'backfill'),
  ('0020_business_events.sql',                null, 'backfill'),
  ('0021_quickbooks_pnl_totals.sql',          null, 'backfill'),
  ('0022_store_aliases.sql',                  null, 'backfill'),
  ('0023_analyst_chat.sql',                   null, 'backfill'),
  ('0024_discovery_submissions.sql',          null, 'backfill'),
  -- 0025_store_day_lineitems DELIBERATELY NOT backfilled: it was written
  -- 2026-06-26 but never applied (THE drift incident this ledger exists to
  -- prevent). Applying it via the script records it with a real checksum.
  ('0026_schema_migrations.sql',              null, 'backfill')
on conflict (filename) do nothing;
