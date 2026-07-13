-- Canes Pressure Washing — 0011: private per-job photos (Crew Accounts Phase C).
-- Run in the Canes Supabase project after 0010_owner_crew_checklists.sql.
--
-- The jobs row is the project: every media row attaches to a job. The database
-- stores metadata only; binaries live in the private canes-job-media Storage
-- bucket and are reached exclusively through short-lived signed URLs minted by
-- the server after a job-access check. RLS stays deny-all with no policies.

create table if not exists job_media (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  job_id       uuid not null references jobs (id) on delete cascade,
  -- Null uploader = the owner/office; technicians always attribute.
  uploaded_by_account_id uuid references crew_accounts (id) on delete set null,
  media_type   text not null default 'photo'
               check (media_type in ('photo', 'video')),
  category     text not null
               check (category in ('before', 'after', 'walkthrough', 'reference', 'issue')),
  -- internal = owner only; assigned_crew = owner + the job's crew (upload
  -- default); customer = additionally allowed into a future share-link gallery.
  visibility   text not null default 'assigned_crew'
               check (visibility in ('internal', 'assigned_crew', 'customer')),
  storage_path   text not null unique,
  thumbnail_path text,
  mime_type    text not null,
  size_bytes   bigint not null default 0,
  width        integer,
  height       integer,
  duration_seconds integer,
  caption      text,
  captured_at  timestamptz,
  approved_by_account_id uuid references crew_accounts (id) on delete set null,
  approved_at  timestamptz,
  -- Soft delete keeps the audit trail; galleries filter this out.
  deleted_at   timestamptz
);
create index if not exists job_media_job_idx
  on job_media (job_id, created_at desc) where deleted_at is null;
alter table job_media enable row level security;

-- One private bucket for every job's media. Never public; reads and writes go
-- through signed URLs only. Limits are defense-in-depth behind the server's
-- own MIME/size validation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'canes-job-media',
  'canes-job-media',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
