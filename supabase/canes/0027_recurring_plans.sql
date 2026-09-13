-- 0027 — recurring plans
--
-- Sebastian, 2026-09-13: "I want a spot I can convert an estimate or invoice
-- into a recurring work order — quarterly, bi-yearly, yearly — with a contract
-- that has a 50% cancellation fee of the next visit." And on the dashboard:
-- "recurring revenue on each month of the year and overall year ARR."
--
-- Until now the only recurring signal was jobs.recurrence, a FLAG on a single
-- work order that fed an MRR estimate and generated nothing. A plan is the
-- record that outlives any one visit: the customer, the services and price per
-- visit, the cadence, the contract (sent and signed like an estimate), the
-- pause and cancel states, and the cancellation term. Every visit it produces
-- is an ordinary job with plan_id set, so schedule / crew / checklist /
-- complete / invoice keep working untouched, and the payments ledger stays the
-- single source of collected revenue.
--
-- Money in integer cents. Dates that are calendar days (starts_on, next_due_on)
-- are DATE, in the business's own ET calendar; the cron composes the ET
-- instant when it mints a visit. Deny-all RLS like everything else.

begin;

create table if not exists recurring_plans (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  number            text not null unique,                 -- 'PLAN-000001'
  contact_id        uuid references contacts (id) on delete set null,
  -- Where the plan came from, for the "Convert To Recurring" trail. Any may be null.
  source_estimate_id uuid references estimates (id) on delete set null,
  source_invoice_id  uuid references invoices (id) on delete set null,
  source_job_id      uuid references jobs (id) on delete set null,
  -- Customer snapshot, like an estimate: the contract page needs one row.
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  job_address       text,
  job_name          text,                                 -- "Quarterly house wash"
  cadence           text not null
    check (cadence in ('monthly', 'quarterly', 'semiannual', 'yearly')),
  price_per_visit_cents int not null default 0,
  status            text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'canceled')),
  starts_on         date not null,                        -- first visit due
  next_due_on       date,                                 -- next visit to mint; null once canceled
  last_generated_for date,                                -- due date of the newest minted visit
  lead_days         int not null default 21,              -- mint a visit this many days ahead
  cancellation_fee_bps int not null default 5000,         -- 50% of the next visit
  notice_days       int not null default 0,               -- 0 = fee applies to any cancel
  -- Contract snapshot (settings.recurring_terms at creation) + public agreement.
  terms             text,
  message_to_customer text,
  public_token      text not null unique,
  sent_at           timestamptz,
  viewed_at         timestamptz,
  signed_at         timestamptz,
  signature_name    text,
  agreement_source  text check (agreement_source in ('customer', 'in_person')),
  paused_at         timestamptz,
  canceled_at       timestamptz,
  canceled_reason   text,
  cancellation_fee_invoice_id uuid references invoices (id) on delete set null
);
create index if not exists recurring_plans_status_idx on recurring_plans (status, next_due_on);
create index if not exists recurring_plans_contact_idx on recurring_plans (contact_id);
create index if not exists recurring_plans_token_idx on recurring_plans (public_token);

-- The services a visit consists of. Snapshotted from the source document's
-- lines; a plan's price_per_visit is the sum, kept in step by the server.
create table if not exists recurring_plan_items (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references recurring_plans (id) on delete cascade,
  position          int not null default 0,
  name              text not null,
  description       text,
  quantity          numeric not null default 1,
  unit_price_cents  int not null default 0,
  line_total_cents  int not null default 0
);
create index if not exists recurring_plan_items_plan_idx on recurring_plan_items (plan_id, position);

-- A visit is a job. plan_visit_due_on is the due date it was minted for, and the
-- partial unique index is the generator's idempotency: a cron retry can never
-- mint the same visit twice.
alter table jobs add column if not exists plan_id uuid references recurring_plans (id) on delete set null;
alter table jobs add column if not exists plan_visit_due_on date;
create unique index if not exists jobs_plan_visit_idx on jobs (plan_id, plan_visit_due_on) where plan_id is not null;
create index if not exists jobs_plan_idx on jobs (plan_id) where plan_id is not null;

-- Numbering rides the shared counter table, like estimates and invoices.
insert into estimate_counters (id, next_value) values ('plan', 1)
  on conflict (id) do nothing;

-- The contract copy, snapshotted onto each plan at creation exactly like
-- estimate_terms. Editable in Settings; edits never rewrite a signed plan.
insert into settings (key, value) values
  ('recurring_terms', '"This is a recurring service agreement between Canes Pressure Washing and the customer named above. Canes will perform the services listed at the price per visit shown, on the schedule shown, and will contact you to book each visit in advance. Each visit is invoiced on completion and payment is due on receipt unless agreed otherwise. Prices may be adjusted for future visits with notice before the visit is booked. Either party may end this agreement at any time. If the customer cancels after the next visit has been scheduled, a cancellation fee of 50% of that visit''s price applies. Access to water and power is required; weather reschedules are expected and carry no fee."')
on conflict (key) do nothing;

alter table recurring_plans enable row level security;
alter table recurring_plan_items enable row level security;

notify pgrst, 'reload schema';
commit;
