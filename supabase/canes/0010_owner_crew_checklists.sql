-- Canes Pressure Washing — owner crew + per-job checklist management.
-- Procedural checklist steps share the existing job_items progress system but
-- are marked so they never become customer-facing invoice lines.

alter table job_items
  add column if not exists checklist_only boolean not null default false;

create index if not exists job_items_checklist_idx
  on job_items (job_id, checklist_only, position);
