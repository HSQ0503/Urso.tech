-- Migration 0024 — discovery form submissions. Captures the pre-meeting
-- operating-context form a warm prospect fills out before the first call
-- (app/discovery -> /api/discovery). The form is the homework: it feeds
-- external recon so the owner call starts three moves deep instead of zero.
--
-- RLS is ON with NO policies: this table holds inbound prospect PII and is
-- written + read only server-side through the service-role client
-- (lib/supabase/admin.ts), same pattern as quickbooks_pnl / analyst_*. No
-- browser ever touches it.

create table if not exists discovery_submissions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- contact (name + email are the only fields the form requires)
  name              text not null,
  email             text not null,
  business_name     text,
  -- the basics
  locations         text,   -- band: 1 / 2-3 / 4-9 / 10-24 / 25+
  structure         text,   -- independent, or which franchise/brand
  revenue_band      text,   -- rough monthly revenue band (optional)
  -- the setup
  systems           text,   -- POS, accounting, scheduling, customer/marketing tools
  info_location     text,   -- one system / scattered / spreadsheets / in someone's head
  contact_channels  text,   -- how customers reach & book, and who answers the phone
  -- how it works + where it leaks
  journey           text,   -- first contact -> paid, in their words
  leak_guess        text,   -- where they think they lose the most
  -- what they want to see
  wish_visibility   text,   -- the one thing they wish they could see instantly
  gut_decisions     text,   -- what they decide on gut today
  current_reports   text,   -- numbers/reports they already check
  -- outcome
  worth_it          text,   -- what would make it clearly worth it
  anything_else     text
);

alter table discovery_submissions enable row level security;
