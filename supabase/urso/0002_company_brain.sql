-- Urso Brain migration 0002 — M1–M3 company-brain foundation.
-- Run after 0001_brain.sql in the dedicated Urso HQ Supabase project.
--
-- Adds:
--   M1  organization boundaries, memberships/roles, document ACLs,
--       immutable document versions, reviewable proposals, and audit events
--   M2  heading-aware chunks, full-text + pgvector indexes, and an
--       authorization-filtered hybrid-search RPC
--   M3  context-run/evidence records for inspectable Context Receipts

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists brain_organizations (
  id          text primary key,
  name        text not null,
  slug        text not null unique,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

insert into brain_organizations (id, name, slug)
values ('urso', 'Urso', 'urso')
on conflict (id) do nothing;

alter table brain_departments add column if not exists organization_id text not null default 'urso';
alter table brain_projects    add column if not exists organization_id text not null default 'urso';
alter table brain_docs        add column if not exists organization_id text not null default 'urso';
alter table brain_profiles    add column if not exists organization_id text not null default 'urso';
alter table brain_org_keys    add column if not exists organization_id text not null default 'urso';
alter table brain_threads     add column if not exists organization_id text not null default 'urso';

alter table brain_departments
  add constraint brain_departments_organization_fkey
  foreign key (organization_id) references brain_organizations(id);
alter table brain_projects
  add constraint brain_projects_organization_fkey
  foreign key (organization_id) references brain_organizations(id);
alter table brain_docs
  add constraint brain_docs_organization_fkey
  foreign key (organization_id) references brain_organizations(id);
alter table brain_profiles
  add constraint brain_profiles_organization_fkey
  foreign key (organization_id) references brain_organizations(id);
alter table brain_org_keys
  add constraint brain_org_keys_organization_fkey
  foreign key (organization_id) references brain_organizations(id);
alter table brain_threads
  add constraint brain_threads_organization_fkey
  foreign key (organization_id) references brain_organizations(id);

-- Convert the v1 global slugs into organization-scoped keys without changing
-- any existing values. This lets a future PE portfolio host the same familiar
-- department/project/path slugs in multiple company brains.
alter table brain_docs     drop constraint if exists brain_docs_department_id_fkey;
alter table brain_docs     drop constraint if exists brain_docs_project_id_fkey;
alter table brain_profiles drop constraint if exists brain_profiles_department_id_fkey;
alter table brain_threads  drop constraint if exists brain_threads_project_id_fkey;

alter table brain_departments drop constraint if exists brain_departments_pkey;
alter table brain_departments add primary key (organization_id, id);
alter table brain_projects drop constraint if exists brain_projects_pkey;
alter table brain_projects add primary key (organization_id, id);
alter table brain_docs drop constraint if exists brain_docs_path_key;
alter table brain_docs add constraint brain_docs_organization_path_key unique (organization_id, path);
alter table brain_profiles drop constraint if exists brain_profiles_pkey;
alter table brain_profiles add primary key (organization_id, user_id);
alter table brain_org_keys drop constraint if exists brain_org_keys_pkey;
alter table brain_org_keys add primary key (organization_id, provider);

alter table brain_docs
  add constraint brain_docs_department_fkey
  foreign key (organization_id, department_id)
  references brain_departments(organization_id, id);
alter table brain_docs
  add constraint brain_docs_project_fkey
  foreign key (organization_id, project_id)
  references brain_projects(organization_id, id);
alter table brain_profiles
  add constraint brain_profiles_department_fkey
  foreign key (organization_id, department_id)
  references brain_departments(organization_id, id);
alter table brain_threads
  add constraint brain_threads_project_fkey
  foreign key (organization_id, project_id)
  references brain_projects(organization_id, id);

create table if not exists brain_memberships (
  organization_id text not null references brain_organizations(id) on delete cascade,
  user_id          text not null,
  role             text not null default 'member'
                   check (role in ('org_admin', 'knowledge_steward', 'member', 'viewer')),
  department_id    text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, department_id)
    references brain_departments(organization_id, id)
);

-- Preserve access for the current internal demo team. Future invitations should
-- assign the least-privileged role explicitly.
insert into brain_memberships (organization_id, user_id, role, department_id)
select organization_id, user_id, 'org_admin', department_id
from brain_profiles
on conflict (organization_id, user_id) do nothing;

alter table brain_docs add column if not exists visibility text not null default 'organization'
  check (visibility in ('organization', 'department', 'project', 'restricted'));
alter table brain_docs add column if not exists owner_user_id text;
alter table brain_docs add column if not exists current_version integer not null default 1;
alter table brain_docs add column if not exists review_due_at timestamptz;
alter table brain_docs add column if not exists source_updated_at timestamptz not null default now();
alter table brain_docs add column if not exists search_document tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) stored;

create index if not exists brain_docs_org_idx on brain_docs (organization_id);
create index if not exists brain_docs_search_idx on brain_docs using gin (search_document);

create table if not exists brain_doc_acl (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  doc_id            uuid not null references brain_docs(id) on delete cascade,
  principal_type    text not null check (principal_type in ('user', 'department', 'project', 'role')),
  principal_id      text not null,
  permission        text not null check (permission in ('discover', 'read', 'edit', 'approve')),
  created_by        text not null default '',
  created_at        timestamptz not null default now(),
  unique (organization_id, doc_id, principal_type, principal_id, permission)
);
create index if not exists brain_doc_acl_lookup_idx
  on brain_doc_acl (organization_id, doc_id, permission);

create table if not exists brain_doc_versions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  doc_id            uuid not null references brain_docs(id) on delete cascade,
  version           integer not null,
  title             text not null,
  description       text not null default '',
  content           text not null,
  content_hash      text not null,
  metadata          jsonb not null default '{}'::jsonb,
  change_summary    text not null default '',
  created_by        text not null default '',
  created_at        timestamptz not null default now(),
  unique (doc_id, version)
);
create index if not exists brain_doc_versions_org_doc_idx
  on brain_doc_versions (organization_id, doc_id, version desc);

insert into brain_doc_versions (
  organization_id, doc_id, version, title, description, content, content_hash,
  metadata, change_summary, created_by, created_at
)
select
  organization_id, id, current_version, title, description, content, content_hash,
  jsonb_build_object(
    'path', path,
    'department_id', department_id,
    'project_id', project_id,
    'doc_type', doc_type,
    'audience', audience,
    'tags', tags,
    'links', links,
    'visibility', visibility,
    'origin', origin,
    'deleted_at', deleted_at
  ),
  'Baseline imported from Brain v1',
  coalesce(nullif(updated_by, ''), 'migration'),
  synced_at
from brain_docs
on conflict (doc_id, version) do nothing;

create or replace function brain_bump_doc_version()
returns trigger
language plpgsql
as $$
begin
  if new.content_hash is distinct from old.content_hash
     or new.visibility is distinct from old.visibility
     or new.deleted_at is distinct from old.deleted_at then
    new.current_version := old.current_version + 1;
    new.source_updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function brain_store_doc_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.current_version is distinct from old.current_version then
    insert into brain_doc_versions (
      organization_id, doc_id, version, title, description, content, content_hash,
      metadata, change_summary, created_by
    ) values (
      new.organization_id, new.id, new.current_version, new.title, new.description,
      new.content, new.content_hash,
      jsonb_build_object(
        'path', new.path,
        'department_id', new.department_id,
        'project_id', new.project_id,
        'doc_type', new.doc_type,
        'audience', new.audience,
        'tags', new.tags,
        'links', new.links,
        'visibility', new.visibility,
        'origin', new.origin,
        'deleted_at', new.deleted_at
      ),
      case when tg_op = 'INSERT' then 'Document created' else 'Document content updated' end,
      coalesce(nullif(new.updated_by, ''), 'system')
    )
    on conflict (doc_id, version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists brain_docs_bump_version on brain_docs;
create trigger brain_docs_bump_version
before update on brain_docs
for each row execute function brain_bump_doc_version();

drop trigger if exists brain_docs_store_version on brain_docs;
create trigger brain_docs_store_version
after insert or update on brain_docs
for each row execute function brain_store_doc_version();

create table if not exists brain_knowledge_proposals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  operation        text not null check (operation in ('create', 'update', 'link', 'delete')),
  target_doc_id    uuid references brain_docs(id) on delete set null,
  target_path      text not null,
  proposed_change  jsonb not null,
  evidence         jsonb not null default '[]'::jsonb,
  rationale        text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending', 'applying', 'approved', 'rejected', 'withdrawn')),
  proposed_by      text not null,
  reviewed_by      text,
  review_note      text not null default '',
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists brain_proposals_queue_idx
  on brain_knowledge_proposals (organization_id, status, created_at desc);

create table if not exists brain_audit_events (
  id               bigint generated always as identity primary key,
  organization_id  text not null references brain_organizations(id) on delete cascade,
  actor_user_id    text,
  action           text not null,
  resource_type    text not null,
  resource_id      text not null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists brain_audit_events_org_time_idx
  on brain_audit_events (organization_id, created_at desc);

create table if not exists brain_doc_chunks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  doc_id            uuid not null references brain_docs(id) on delete cascade,
  version           integer not null,
  ordinal           integer not null,
  heading           text not null default '',
  content           text not null,
  token_count       integer not null default 0,
  embedding         extensions.vector(1536),
  metadata          jsonb not null default '{}'::jsonb,
  search_document   tsvector generated always as (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored,
  created_at        timestamptz not null default now(),
  unique (doc_id, version, ordinal)
);
create index if not exists brain_doc_chunks_org_doc_idx
  on brain_doc_chunks (organization_id, doc_id, version);
create index if not exists brain_doc_chunks_search_idx
  on brain_doc_chunks using gin (search_document);
create index if not exists brain_doc_chunks_embedding_idx
  on brain_doc_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists brain_context_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  user_id           text not null,
  thread_id         uuid references brain_threads(id) on delete set null,
  project_id        text,
  query             text not null,
  status            text not null default 'complete'
                   check (status in ('complete', 'partial', 'failed')),
  retrieval_mode    text not null check (retrieval_mode in ('hybrid', 'lexical', 'none')),
  plan              jsonb not null,
  receipt           jsonb not null,
  latency_ms        integer not null default 0,
  created_at        timestamptz not null default now(),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id)
);
create index if not exists brain_context_runs_user_time_idx
  on brain_context_runs (organization_id, user_id, created_at desc);

create table if not exists brain_context_evidence (
  context_run_id  uuid not null references brain_context_runs(id) on delete cascade,
  evidence_id     text not null,
  doc_id          uuid not null references brain_docs(id) on delete cascade,
  chunk_id        uuid references brain_doc_chunks(id) on delete set null,
  rank            integer not null,
  lexical_score   real not null default 0,
  semantic_score  real not null default 0,
  fused_score     real not null default 0,
  reasons         text[] not null default '{}',
  primary key (context_run_id, evidence_id)
);

-- This function is the hard security boundary for retrieval. It is intentionally
-- callable only by the service role: callers cannot supply another user's id.
create or replace function brain_can_read_doc(
  p_organization_id text,
  p_user_id text,
  p_doc_id uuid,
  p_project_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from brain_memberships m
    join brain_docs d
      on d.organization_id = m.organization_id
     and d.id = p_doc_id
     and d.deleted_at is null
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.active
      and (
        m.role in ('org_admin', 'knowledge_steward')
        or d.visibility = 'organization'
        or (d.visibility = 'department' and d.department_id = m.department_id)
        or (d.visibility = 'project' and d.project_id = p_project_id)
        or exists (
          select 1
          from brain_doc_acl a
          where a.organization_id = d.organization_id
            and a.doc_id = d.id
            and a.permission in ('read', 'edit', 'approve')
            and (
              (a.principal_type = 'user' and a.principal_id = m.user_id)
              or (a.principal_type = 'department' and a.principal_id = m.department_id)
              or (a.principal_type = 'project' and a.principal_id = p_project_id)
              or (a.principal_type = 'role' and a.principal_id = m.role)
            )
        )
      )
  );
$$;

create or replace function brain_authorized_hybrid_search(
  p_organization_id text,
  p_user_id text,
  p_department_id text,
  p_project_id text,
  p_query text,
  p_query_embedding extensions.vector(1536) default null,
  p_limit integer default 12
)
returns table (
  chunk_id uuid,
  doc_id uuid,
  path text,
  title text,
  description text,
  department_id text,
  project_id text,
  doc_type text,
  visibility text,
  version integer,
  heading text,
  content text,
  token_count integer,
  lexical_score real,
  semantic_score real,
  fused_score real,
  candidate_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with permitted as (
    select d.*
    from brain_docs d
    where d.organization_id = p_organization_id
      and d.deleted_at is null
      and brain_can_read_doc(p_organization_id, p_user_id, d.id, p_project_id)
      and (
        d.doc_type <> 'rule'
        or d.audience && array['all', p_department_id]::text[]
      )
  ),
  candidates as (
    select
      c.id as chunk_id,
      d.id as doc_id,
      d.path,
      d.title,
      d.description,
      d.department_id,
      d.project_id,
      d.doc_type,
      d.visibility,
      c.version,
      c.heading,
      c.content,
      c.token_count,
      ts_rank_cd(c.search_document, websearch_to_tsquery('english', p_query))::real as lexical_score,
      case
        when p_query_embedding is null or c.embedding is null then 0::real
        else greatest(0, 1 - (c.embedding <=> p_query_embedding))::real
      end as semantic_score,
      row_number() over (
        order by ts_rank_cd(c.search_document, websearch_to_tsquery('english', p_query)) desc
      ) as lexical_rank,
      case
        when p_query_embedding is null or c.embedding is null then null
        else row_number() over (order by c.embedding <=> p_query_embedding)
      end as semantic_rank
    from permitted d
    join brain_doc_chunks c
      on c.organization_id = d.organization_id
     and c.doc_id = d.id
     and c.version = d.current_version
    where
      c.search_document @@ websearch_to_tsquery('english', p_query)
      or (p_query_embedding is not null and c.embedding is not null)
  )
  select
    chunk_id, doc_id, path, title, description, department_id, project_id,
    doc_type, visibility, version, heading, content, token_count,
    lexical_score, semantic_score,
    (
      case when lexical_score > 0 then 0.55 / (60 + lexical_rank) else 0 end +
      case when semantic_rank is not null then 0.45 / (60 + semantic_rank) else 0 end
    )::real as fused_score,
    count(*) over () as candidate_count
  from candidates
  order by fused_score desc, path, version desc
  limit least(greatest(p_limit, 1), 40);
$$;

revoke all on function brain_can_read_doc(text, text, uuid, text) from public, anon, authenticated;
revoke all on function brain_authorized_hybrid_search(text, text, text, text, text, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function brain_can_read_doc(text, text, uuid, text) to service_role;
grant execute on function brain_authorized_hybrid_search(text, text, text, text, text, extensions.vector, integer)
  to service_role;

alter table brain_organizations       enable row level security;
alter table brain_memberships         enable row level security;
alter table brain_doc_acl             enable row level security;
alter table brain_doc_versions        enable row level security;
alter table brain_knowledge_proposals enable row level security;
alter table brain_audit_events        enable row level security;
alter table brain_doc_chunks          enable row level security;
alter table brain_context_runs        enable row level security;
alter table brain_context_evidence    enable row level security;

-- All data access remains server-only through the secret key. The application
-- authorization layer and the hybrid-search RPC both enforce membership before
-- any document metadata or content reaches the model.
