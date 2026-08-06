-- Canes Pressure Washing — 0023: durable notification recovery context.
--
-- Notification repair must not infer intent from mutable business state. An
-- owner approving an estimate in person should never receive a later
-- "customer approved" alert, and moving/reassigning a newly-created manual job
-- must not manufacture a second "new assignment" event. These immutable
-- snapshots let the cron repair recreate only the notification that the
-- original mutation intended.

alter table estimates
  add column if not exists approval_source text;

alter table estimates
  drop constraint if exists estimates_approval_source_check;
alter table estimates
  add constraint estimates_approval_source_check
  check (approval_source is null or approval_source in ('customer', 'in_person'));

-- Existing signed approvals can be classified from the marker used by the
-- owner-side flow. This also makes a first deploy safe for approvals completed
-- shortly before this migration is installed.
update estimates
set approval_source = case
  when signature_name ilike '%(agreed in person)%' then 'in_person'
  else 'customer'
end
where status = 'approved'
  and approval_source is null;

alter table jobs
  add column if not exists creation_notification_crew_id uuid
    references crews (id) on delete set null;
alter table jobs
  add column if not exists creation_notification_scheduled_at timestamptz;

create index if not exists estimates_recent_customer_approval_idx
  on estimates (approved_at desc)
  where status = 'approved' and approval_source = 'customer';

create index if not exists jobs_creation_notification_idx
  on jobs (created_at desc)
  where creation_notification_crew_id is not null;
