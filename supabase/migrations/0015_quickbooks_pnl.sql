-- QuickBooks P&L, flattened from the report matrix: one row per
-- month × section × account. Written by /api/quickbooks/sync via the
-- service-role key. RLS on with no policies (server-only), matching
-- quickbooks_connections — the dashboard reads it through server components.

create table if not exists quickbooks_pnl (
  client_id text not null,                  -- tenant, e.g. 'woof-gang'
  realm_id text not null,                   -- QuickBooks company id
  month date not null,                      -- first day of the month
  section text not null,                    -- Income / Cost of Goods Sold / Expenses …
  account text not null,                    -- QBO account name
  amount numeric not null default 0,
  accounting_method text not null default 'Accrual',
  synced_at timestamptz not null default now(),
  primary key (client_id, realm_id, month, section, account, accounting_method)
);

alter table quickbooks_pnl enable row level security;
-- No policies on purpose: server-only, like quickbooks_connections.
