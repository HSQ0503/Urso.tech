-- Canes Pressure Washing — Phase 3 (customers). Run in the CANES project
-- (jeznnlveaymtrhisqckq), NOT Woof Gang. Revives the dormant contacts/addresses
-- tables from 0002 as the real customers layer: leads gain an email + a link to
-- their contact, jobs snapshot the customer email (so invoices stop re-fetching
-- it from the originating estimate), and a guarded backfill promotes every won
-- or transacted lead into a contact with its primary address. Also swaps the
-- invoices.job_id UNIQUE constraint for a partial unique index that ignores
-- voided invoices, so a voided bill no longer strands its job forever (re-bill
-- path). All additive + idempotent; RLS stays deny-all from 0001-0005.

-- ── leads: store the email (today estimates re-type it) + the contact link.
alter table leads add column if not exists email text;
alter table leads add column if not exists contact_id uuid references contacts (id) on delete set null;
create index if not exists leads_contact_idx on leads (contact_id);

-- ── jobs: snapshot the customer email at handoff, same discipline as
--    customer_phone in 0004 — invoice creation needs no join back to the estimate.
alter table jobs add column if not exists customer_email text;

-- ── contacts: soft-archive flag (old customers hide from the list, keep history).
alter table contacts add column if not exists archived boolean not null default false;

-- ── Re-bill fix: one LIVE invoice per job, but a voided invoice steps aside.
--    The old UNIQUE constraint made a voided invoice permanently block its job.
alter table invoices drop constraint if exists invoices_job_id_key;
create unique index if not exists invoices_job_id_live_key
  on invoices (job_id) where status <> 'void';

-- ── Backfill (idempotent, guarded) ────────────────────────────────────────────
-- 1. Promote every lead that won or transacted (has an estimate/job/invoice)
--    into a contact. Dedupe on phone (contacts.phone UNIQUE); email comes from
--    the lead's most recent estimate since leads never stored one until now.
insert into contacts (name, phone, email, source, notes, last_activity_at)
select
  l.name,
  l.phone,
  (select e.customer_email from estimates e
    where e.lead_id = l.id and e.customer_email is not null
    order by e.created_at desc limit 1),
  l.source,
  l.notes,
  l.last_activity_at
from leads l
where l.phone is not null
  and (
    l.status = 'won'
    or exists (select 1 from estimates e where e.lead_id = l.id)
    or exists (select 1 from jobs j where j.lead_id = l.id)
    or exists (select 1 from invoices i where i.lead_id = l.id)
  )
on conflict (phone) do nothing;

-- 2. Link each lead to its contact by phone (leads.phone and contacts.phone are
--    both UNIQUE, so this is 1:1).
update leads l
set contact_id = c.id
from contacts c
where l.contact_id is null and l.phone is not null and c.phone = l.phone;

-- 3. Stamp contact_id down the pipeline: lead link first, then a
--    customer_phone → contacts.phone fallback for rows whose lead is gone.
update estimates e set contact_id = l.contact_id
from leads l
where e.contact_id is null and e.lead_id = l.id and l.contact_id is not null;

update estimates e set contact_id = c.id
from contacts c
where e.contact_id is null and e.customer_phone is not null and c.phone = e.customer_phone;

update jobs j set contact_id = l.contact_id
from leads l
where j.contact_id is null and j.lead_id = l.id and l.contact_id is not null;

update jobs j set contact_id = c.id
from contacts c
where j.contact_id is null and j.customer_phone is not null and c.phone = j.customer_phone;

update invoices i set contact_id = l.contact_id
from leads l
where i.contact_id is null and i.lead_id = l.id and l.contact_id is not null;

update invoices i set contact_id = c.id
from contacts c
where i.contact_id is null and i.customer_phone is not null and c.phone = i.customer_phone;

-- 4. Backfill jobs.customer_email from the originating estimate.
update jobs j set customer_email = e.customer_email
from estimates e
where j.customer_email is null and j.estimate_id = e.id and e.customer_email is not null;

-- 5. Seed each new contact's primary address from the lead, only when the
--    contact has no address yet (re-running never duplicates).
insert into addresses (contact_id, line, is_primary)
select l.contact_id, l.address, true
from leads l
where l.contact_id is not null
  and l.address is not null
  and not exists (select 1 from addresses a where a.contact_id = l.contact_id);
