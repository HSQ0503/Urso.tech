-- Urso HQ migration 0014 — auditable finance entry edits.

begin;

alter table urso_finance_entries
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;

update urso_finance_entries
set
  updated_at = created_at,
  updated_by = created_by
where updated_by is null;

commit;
