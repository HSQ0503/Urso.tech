-- Canes Pressure Washing — Phase 2 (estimates + jobs). Run in CANES project (jeznnlveaymtrhisqckq).
-- Money in integer cents. RLS deny-all like 0001: enable, no policies.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  phone text unique,
  email text,
  source text not null default 'lead_vendor'
    check (source in ('lead_vendor', 'website', 'referral', 'other')),
  notes text,
  last_activity_at timestamptz not null default now()
);
create index if not exists contacts_phone_idx on contacts (phone);

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid references contacts (id) on delete cascade,
  line text not null,
  site_notes text,
  is_primary boolean not null default false
);
create index if not exists addresses_contact_idx on addresses (contact_id);

create table if not exists service_catalog (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  description text,
  kind text not null default 'service' check (kind in ('service', 'product')),
  default_price_cents int not null default 0,
  unit text not null default 'each',
  taxable boolean not null default false,
  active boolean not null default true,
  position int not null default 0
);
create index if not exists service_catalog_active_idx on service_catalog (active, position);

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid references leads (id) on delete set null,
  contact_id uuid references contacts (id) on delete set null,
  address_id uuid references addresses (id) on delete set null,
  number text not null unique,
  estimate_type text not null default 'standard'
    check (estimate_type in ('standard', 'options', 'packages')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'approved', 'declined', 'expired')),
  customer_name text,
  customer_phone text,
  customer_email text,
  job_address text,
  job_name text,
  subtotal_cents int not null default 0,
  discount_cents int not null default 0,
  adjustment_cents int not null default 0,
  tax_cents int not null default 0,
  tax_rate_bps int not null default 0,   -- rate snapshot at creation; frozen so a later settings edit never rewrites a sent estimate
  total_cents int not null default 0,
  deposit_percent int not null default 0 check (deposit_percent between 0 and 100),
  deposit_cents int not null default 0,
  message_to_customer text,
  terms text,
  internal_notes text,
  expires_at timestamptz,
  public_token text not null unique,
  sent_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  signature_name text,
  employee text
);
create index if not exists estimates_lead_idx on estimates (lead_id, created_at desc);
create index if not exists estimates_status_idx on estimates (status);
create index if not exists estimates_token_idx on estimates (public_token);

create table if not exists estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates (id) on delete cascade,
  catalog_id uuid references service_catalog (id) on delete set null,
  position int not null default 0,
  name text not null,
  description text,
  kind text not null default 'service' check (kind in ('service', 'product')),
  quantity numeric not null default 1,
  unit_price_cents int not null default 0,
  discount_cents int not null default 0,
  taxable boolean not null default false,
  line_total_cents int not null default 0,
  is_option boolean not null default false,
  is_mandatory boolean not null default false,
  is_selected boolean not null default true,
  package_group text
);
create index if not exists estimate_items_estimate_idx on estimate_items (estimate_id, position);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  estimate_id uuid unique references estimates (id) on delete set null,  -- one job per estimate; approval-dedupe backstop
  lead_id uuid references leads (id) on delete set null,
  contact_id uuid references contacts (id) on delete set null,
  status text not null default 'unscheduled'
    check (status in ('unscheduled', 'scheduled', 'confirmed', 'in_progress', 'completed', 'invoiced', 'paid', 'canceled')),
  customer_name text,
  job_address text,
  total_cents int not null default 0,
  deposit_cents int not null default 0,
  scheduled_at timestamptz,
  assigned_to text,
  notes text
);
create index if not exists jobs_status_idx on jobs (status);
create index if not exists jobs_estimate_idx on jobs (estimate_id);

create table if not exists estimate_counters (
  id text primary key,
  next_value int not null default 1
);
insert into estimate_counters (id, next_value) values ('estimate', 1)
  on conflict (id) do nothing;

alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest',
  'estimate_send', 'estimate_reminder'
));

insert into settings (key, value) values
  ('estimate_terms', '"Payment due on completion unless a deposit is agreed. Estimates are valid for 28 days. Canes Pressure Washing is not responsible for pre-existing damage, loose or failing surfaces, or oxidation revealed by cleaning. Access to water and power required. Reschedules due to weather are expected."'),
  ('estimate_message', '"Thanks for having us out. Here is your estimate. Tap to review the details and approve, and we will get you on the schedule. Any questions, just reply to this text."'),
  ('deposit_presets', '[0, 25, 50]'),
  ('estimate_expiry_days', '28'),
  ('estimate_tax_rate_bps', '0')
on conflict (key) do nothing;

alter table contacts enable row level security;
alter table addresses enable row level security;
alter table service_catalog enable row level security;
alter table estimates enable row level security;
alter table estimate_items enable row level security;
alter table jobs enable row level security;
alter table estimate_counters enable row level security;
