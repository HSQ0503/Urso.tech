-- Canes Pressure Washing — Phase 2.5 (invoicing + payments). Run in the CANES
-- project (jeznnlveaymtrhisqckq), NOT Woof Gang. Closes the money loop: a
-- completed job becomes an invoice (the estimate's twin), the customer pays by
-- card via Square's hosted page or Sebastian records cash, and an append-only
-- `payments` ledger is the source of truth for money collected. All additive,
-- deny-all RLS like 0001-0004, money in integer cents.
--
-- Design: mirrors estimates exactly (see 0002_estimates.sql). One invoice per
-- job (job_id UNIQUE = the dedupe backstop). Invoice.status is a cache; the
-- ledger sum is the record. No card data ever lands here — only Square ids,
-- amounts, and a hosted URL (PCI SAQ-A boundary).

-- ── invoices: the bill for a completed job. Estimate-shaped. ──────────────────
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid unique references jobs (id) on delete set null,       -- one invoice per job; dedupe backstop
  estimate_id uuid references estimates (id) on delete set null,
  lead_id uuid references leads (id) on delete set null,
  contact_id uuid references contacts (id) on delete set null,
  number text not null unique,                                      -- INV-000001
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'paid', 'void')),
  customer_name text,
  customer_phone text,
  customer_email text,
  job_address text,
  job_name text,
  subtotal_cents int not null default 0,
  adjustment_cents int not null default 0,                          -- the "actual amount" lever (+/-)
  tax_cents int not null default 0,
  tax_rate_bps int not null default 0,                              -- rate snapshot at creation
  total_cents int not null default 0,                              -- server-computed; the amount billed
  amount_paid_cents int not null default 0,                        -- DERIVED cache of the payments ledger sum
  message_to_customer text,
  terms text,
  internal_notes text,
  public_token text not null unique,
  square_invoice_id text,                                          -- reconciliation key from Square
  square_order_id text,
  hosted_payment_url text,                                         -- Square's public_url (customer pays here)
  sent_at timestamptz,
  viewed_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  employee text
);
create index if not exists invoices_job_idx on invoices (job_id);
create index if not exists invoices_lead_idx on invoices (lead_id, created_at desc);
create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_token_idx on invoices (public_token);
create index if not exists invoices_square_idx on invoices (square_invoice_id);

-- ── invoice_items: snapshot of the billed work (from job_items). Immutable
--    snapshot — editing the job later never rewrites a sent invoice.
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  job_item_id uuid references job_items (id) on delete set null,
  position int not null default 0,
  name text not null,
  description text,
  quantity numeric not null default 1,
  unit_price_cents int not null default 0,
  line_total_cents int not null default 0
);
create index if not exists invoice_items_invoice_idx on invoice_items (invoice_id, position);
alter table invoice_items enable row level security;

-- ── payments: the append-only ledger. The SOURCE OF TRUTH for money in. An
--    invoice's paid state is derived from the sum of its completed payments.
--    Cash = a manual row gated by the Verify step. Card = a row created by the
--    signature-verified Square webhook, idempotent on square_payment_id.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- set null, NOT cascade: this is the append-only money ledger — deleting an
  -- invoice must never wipe the record that money was collected.
  invoice_id uuid references invoices (id) on delete set null,
  job_id uuid references jobs (id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD',
  method text not null check (method in ('cash', 'card', 'other')),
  source text not null check (source in ('manual', 'square_webhook')),
  status text not null default 'completed' check (status in ('completed', 'refunded')),
  square_payment_id text,                                          -- card idempotency key
  external_event_id text,                                         -- the webhook event id (audit)
  recorded_by text,                                              -- 'owner' / user id (cash audit trail)
  note text
);
create index if not exists payments_invoice_idx on payments (invoice_id, created_at desc);
create index if not exists payments_job_idx on payments (job_id);
-- One ledger row per Square payment, no matter how many times the event is
-- redelivered (Square delivers at-least-once).
create unique index if not exists payments_square_payment_id_key
  on payments (square_payment_id) where square_payment_id is not null;
alter table payments enable row level security;

-- ── square_webhook_events: dedupe log so a redelivered webhook is a no-op.
create table if not exists square_webhook_events (
  event_id text primary key,
  event_type text,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);
alter table square_webhook_events enable row level security;

-- ── Reuse the estimate counter table for INV- numbering.
insert into estimate_counters (id, next_value) values ('invoice', 1)
  on conflict (id) do nothing;

-- ── Add the invoice outbox kinds. Must re-list every prior kind (0004 set) —
--    drop + re-add replaces the whole constraint.
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest',
  'estimate_send', 'estimate_reminder',
  'job_confirmation',
  'invoice_send', 'invoice_reminder'   -- NEW: invoice delivery + unpaid nudges
));

-- ── Settings: invoice T&C, customer message, reminder cadence. Snapshotted
--    onto the invoice at creation so later edits never rewrite a sent bill.
insert into settings (key, value) values
  ('invoice_terms', '"Payment is due upon receipt. Thank you for your business. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning."'),
  ('invoice_message', '"Thanks for choosing Canes Pressure Washing! Your invoice is ready. Tap to view the details and pay securely online, or reply to this text with any questions."'),
  ('invoice_reminder_days', '[3, 7]')
on conflict (key) do nothing;

-- ── Lock down: RLS on, no policies. Server-secret-key access only.
alter table invoices enable row level security;
