-- QuickBooks P&L summary lines — QuickBooks' OWN top-level totals for each
-- month (Total Income, Total Cost of Goods Sold, Gross Profit, Total Expenses,
-- Net Operating Income, Total Other Income/Expenses, Net Income …).
--
-- Why this exists alongside quickbooks_pnl: the flattened per-account leaf rows
-- in quickbooks_pnl come from a deeply nested report tree and do NOT reliably
-- reconcile to QuickBooks' subtotals (duplicate group names collide, parent
-- rollups drop out). These summary lines are read straight from the report's
-- own Summary rows, so they are authoritative and complete — this is what the
-- dashboard Money panel should read for revenue / COGS / expenses / net profit.
--
-- Written by /api/quickbooks/sync (lib/quickbooks.ts) via the service-role key.
-- RLS on with no policies (server-only), matching quickbooks_pnl.

create table if not exists quickbooks_pnl_totals (
  client_id text not null,                  -- tenant, e.g. 'woof-gang'
  realm_id text not null,                   -- QuickBooks company id
  month date not null,                      -- first day of the month
  label text not null,                      -- QBO summary label, e.g. 'Net Income'
  amount numeric not null default 0,
  accounting_method text not null default 'Accrual',
  synced_at timestamptz not null default now(),
  primary key (client_id, realm_id, month, label, accounting_method)
);

alter table quickbooks_pnl_totals enable row level security;
-- No policies on purpose: server-only, like quickbooks_pnl.
