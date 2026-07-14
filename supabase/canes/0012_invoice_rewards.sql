-- Canes Pressure Washing — 0012: review rewards on invoices. Run in the CANES
-- project (jeznnlveaymtrhisqckq), NOT Woof Gang. Sebastian's review engine:
-- an invoice can carry up to three money-off offers (Google review, Facebook
-- review, Instagram+Facebook follow). The customer claims on the public
-- invoice page; the OWNER verifies the review actually exists and approves;
-- approval subtracts the reward from the invoice total (recomputed server-side
-- in recomputeInvoiceTotals — the discount is part of the total formula, never
-- a payments-ledger row, so collected-revenue analytics stay truthful).
--
-- Lifecycle: offered → claimed → approved | declined. Rows are seeded at
-- invoice creation for every configured kind and toggled per invoice before
-- send (happy client = all three, upset client = none). Amount + label are
-- SNAPSHOTS at offer time — changing defaults in Settings never rewrites an
-- offer already on a customer's bill. Additive, deny-all RLS like 0001–0011,
-- money in integer cents.

create table if not exists invoice_rewards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  kind text not null
    check (kind in ('google_review', 'facebook_review', 'social_follow')),
  label text not null,                                -- snapshot ("Google review")
  amount_cents int not null check (amount_cents > 0), -- snapshot of the discount
  status text not null default 'offered'
    check (status in ('offered', 'claimed', 'approved', 'declined')),
  claimed_at timestamptz,                             -- customer tapped "I did it"
  resolved_at timestamptz,                            -- owner approved/declined
  resolved_by text,                                   -- 'owner' (audit trail)
  unique (invoice_id, kind)                           -- one offer per kind per bill
);
create index if not exists invoice_rewards_invoice_idx on invoice_rewards (invoice_id);
-- The owner's "waiting for approval" queue.
create index if not exists invoice_rewards_claimed_idx
  on invoice_rewards (created_at desc) where status = 'claimed';

-- ── Settings: reward amounts + destination links. Empty URLs = that offer is
--    unconfigured and never seeds onto an invoice, so the feature is dormant
--    until Sebastian fills in his links in Settings.
insert into settings (key, value) values
  ('review_rewards', '{
    "google_cents": 1500,
    "facebook_cents": 1500,
    "follow_cents": 1000,
    "google_url": "",
    "facebook_url": "",
    "instagram_url": ""
  }'::jsonb)
on conflict (key) do nothing;

-- ── Lock down: RLS on, no policies. Server-secret-key access only.
alter table invoice_rewards enable row level security;
