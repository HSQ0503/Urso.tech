-- QuickBooks Online OAuth connections — one row per client company (realm).
-- Holds access/refresh tokens, so this table is SECRET: RLS is ON with NO
-- policies, meaning the anon/publishable key (and the dashboard) can never read
-- it. Only the server-side SECRET (service-role) key reaches it — see
-- lib/supabase/admin.ts and the /api/quickbooks/* route handlers.

create table if not exists quickbooks_connections (
  client_id text not null,                 -- tenant, e.g. 'woof-gang'
  realm_id text not null,                  -- the QuickBooks company id
  access_token text,
  refresh_token text not null,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  environment text not null default 'production',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, realm_id)
);

alter table quickbooks_connections enable row level security;
-- No policies on purpose: tokens are server-only.
