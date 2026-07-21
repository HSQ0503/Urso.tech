-- Canes Pressure Washing — 0013 (deposits at estimate approval). Run in the
-- CANES project (jeznnlveaymtrhisqckq), NOT Woof Gang. Closes the last stubbed
-- piece of the money path: approving an estimate mints a Square Payment Link
-- (quick-pay — no Invoices Plus subscription) for the booking deposit; the
-- payment.updated webhook reconciles it into the payments ledger by order id;
-- the deposit then credits the job's final invoice so the customer only ever
-- pays the balance. All additive, deny-all RLS unchanged, money in integer
-- cents.

-- ── payments: distinguish a booking deposit from the final balance, and keep
--    the Square order id the payment settled against (the Payment Link
--    reconciliation key — pure audit; matching uses jobs.deposit_order_id).
alter table payments add column if not exists kind text not null default 'balance';
alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check check (kind in ('deposit', 'balance'));
alter table payments add column if not exists square_order_id text;

-- ── jobs: the deposit Payment Link minted at approval. order_id is how the
--    webhook finds the job; link_url re-surfaces the button when the customer
--    returns to the approved estimate page; link_id lets us delete the link
--    once it pays (a quick-pay link stays chargeable forever otherwise);
--    paid_at is the UI cache — the payments ledger stays the record.
alter table jobs add column if not exists deposit_order_id text;
alter table jobs add column if not exists deposit_link_id text;
alter table jobs add column if not exists deposit_link_url text;
alter table jobs add column if not exists deposit_paid_at timestamptz;

-- One job per Square order — the webhook's lookup key, unique as the backstop.
create unique index if not exists jobs_deposit_order_key
  on jobs (deposit_order_id) where deposit_order_id is not null;
