-- 0014 — projected costs on estimates (Sebastian: "track expenses when I
-- make an estimate"). Mirrors job_expenses (0007) minus the crew snapshot —
-- there is no crew at quote time. Approval copies these rows onto the job as
-- job_expenses seeds, so the quote's cost model becomes the job's starting
-- cost model. Additive; deny-all RLS, server secret key only.

create table if not exists estimate_expenses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  estimate_id  uuid not null references estimates (id) on delete cascade,
  amount_cents int  not null check (amount_cents >= 0),
  category     text not null default 'Materials',
  note         text,
  created_by   text
);
create index if not exists estimate_expenses_estimate_idx on estimate_expenses (estimate_id);
alter table estimate_expenses enable row level security;  -- deny-all; server key only
