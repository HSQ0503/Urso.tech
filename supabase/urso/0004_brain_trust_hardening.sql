-- Urso Brain migration 0004 — M1–M4 trust hardening.
-- Run after 0003_brain_evaluations.sql in the dedicated Urso HQ project.
--
-- Adds:
--   - explicit project membership
--   - project-membership enforcement inside the retrieval security boundary
--   - atomic Context Run + evidence persistence
--   - atomic proposal approval/rejection and document mutation auditing

begin;

create table if not exists brain_project_memberships (
  organization_id text not null,
  project_id      text not null,
  user_id         text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, project_id, user_id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id)
    references brain_memberships(organization_id, user_id) on delete cascade
);
create index if not exists brain_project_memberships_user_idx
  on brain_project_memberships (organization_id, user_id, active, project_id);

alter table brain_project_memberships enable row level security;

alter table brain_docs
  add constraint brain_docs_project_visibility_scope
  check (visibility <> 'project' or project_id is not null);

-- Older receipts displayed an empty conflicts array as if analysis had run.
-- Preserve their evidence while making the historical limitation explicit.
update brain_context_runs
set receipt = jsonb_set(
  receipt,
  '{conflictAnalysis}',
  '{"status":"not_performed","message":"Automated conflict analysis was not performed for this run."}'::jsonb,
  true
)
where not (receipt ? 'conflictAnalysis');

-- The pre-0004 application used a non-transactional intermediate state. Any
-- row stranded there is safe to review again once the atomic RPC exists.
update brain_knowledge_proposals
set status = 'pending',
    reviewed_by = null,
    reviewed_at = null,
    review_note = 'Recovered from a pre-0004 interrupted approval.',
    updated_at = now()
where status = 'applying';

create or replace function brain_user_can_access_project(
  p_organization_id text,
  p_user_id text,
  p_project_id text
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
    join brain_projects p
      on p.organization_id = m.organization_id
     and p.id = p_project_id
     and p.status = 'active'
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.active
      and (
        m.role in ('org_admin', 'knowledge_steward')
        or exists (
          select 1
          from brain_project_memberships pm
          where pm.organization_id = m.organization_id
            and pm.user_id = m.user_id
            and pm.project_id = p_project_id
            and pm.active
        )
      )
  );
$$;

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
        (
          d.visibility = 'project'
          and d.project_id = p_project_id
          and brain_user_can_access_project(p_organization_id, p_user_id, p_project_id)
        )
        or (
          d.visibility <> 'project'
          and (
            m.role in ('org_admin', 'knowledge_steward')
            or d.visibility = 'organization'
            or (d.visibility = 'department' and d.department_id = m.department_id)
            or exists (
              select 1
              from brain_doc_acl a
              where a.organization_id = d.organization_id
                and a.doc_id = d.id
                and a.permission in ('read', 'edit', 'approve')
                and (
                  (a.principal_type = 'user' and a.principal_id = m.user_id)
                  or (a.principal_type = 'department' and a.principal_id = m.department_id)
                  or (
                    a.principal_type = 'project'
                    and a.principal_id = p_project_id
                    and brain_user_can_access_project(p_organization_id, p_user_id, p_project_id)
                  )
                  or (a.principal_type = 'role' and a.principal_id = m.role)
                )
              )
            )
        )
      )
  );
$$;

create or replace function brain_audit_doc_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if new.updated_by in ('brain-eval', 'brain-acceptance') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.current_version is not distinct from old.current_version then
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'document.created';
  elsif new.deleted_at is not null and old.deleted_at is null then
    v_action := 'document.deleted';
  else
    v_action := 'document.updated';
  end if;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    new.organization_id,
    nullif(new.updated_by, ''),
    v_action,
    'document',
    new.path,
    jsonb_build_object(
      'version', new.current_version,
      'updatedBy', new.updated_by,
      'origin', new.origin
    )
  );
  return new;
end;
$$;

drop trigger if exists brain_docs_audit_mutation on brain_docs;
create trigger brain_docs_audit_mutation
after insert or update on brain_docs
for each row execute function brain_audit_doc_mutation();

create or replace function brain_audit_proposal_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    new.organization_id,
    new.proposed_by,
    'knowledge.proposed',
    'knowledge_proposal',
    new.id::text,
    jsonb_build_object('operation', new.operation, 'targetPath', new.target_path)
  );
  return new;
end;
$$;

drop trigger if exists brain_proposals_audit_created on brain_knowledge_proposals;
create trigger brain_proposals_audit_created
after insert on brain_knowledge_proposals
for each row execute function brain_audit_proposal_created();

create or replace function brain_persist_context_run(
  p_run jsonb,
  p_evidence jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id text := p_run->>'organization_id';
  v_user_id text := p_run->>'user_id';
  v_item jsonb;
  v_doc_id uuid;
  v_chunk_id uuid;
begin
  if not exists (
    select 1
    from brain_memberships
    where organization_id = v_organization_id
      and user_id = v_user_id
      and active
  ) then
    raise exception 'active Brain membership required';
  end if;

  insert into brain_context_runs (
    id,
    organization_id,
    user_id,
    thread_id,
    project_id,
    query,
    status,
    retrieval_mode,
    plan,
    receipt,
    latency_ms
  ) values (
    (p_run->>'id')::uuid,
    v_organization_id,
    v_user_id,
    nullif(p_run->>'thread_id', '')::uuid,
    nullif(p_run->>'project_id', ''),
    p_run->>'query',
    p_run->>'status',
    p_run->>'retrieval_mode',
    p_run->'plan',
    p_run->'receipt',
    (p_run->>'latency_ms')::integer
  );

  for v_item in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_doc_id := (v_item->>'doc_id')::uuid;
    v_chunk_id := nullif(v_item->>'chunk_id', '')::uuid;

    if not exists (
      select 1
      from brain_docs
      where organization_id = v_organization_id
        and id = v_doc_id
    ) then
      raise exception 'context evidence document is outside the run organization';
    end if;

    if v_chunk_id is not null and not exists (
      select 1
      from brain_doc_chunks
      where organization_id = v_organization_id
        and id = v_chunk_id
        and doc_id = v_doc_id
    ) then
      raise exception 'context evidence chunk does not belong to its document';
    end if;

    insert into brain_context_evidence (
      context_run_id,
      evidence_id,
      doc_id,
      chunk_id,
      rank,
      lexical_score,
      semantic_score,
      fused_score,
      reasons
    ) values (
      (p_run->>'id')::uuid,
      v_item->>'evidence_id',
      v_doc_id,
      v_chunk_id,
      (v_item->>'rank')::integer,
      coalesce((v_item->>'lexical_score')::real, 0),
      coalesce((v_item->>'semantic_score')::real, 0),
      coalesce((v_item->>'fused_score')::real, 0),
      coalesce(
        array(select jsonb_array_elements_text(v_item->'reasons')),
        '{}'::text[]
      )
    );
  end loop;
end;
$$;

create or replace function brain_reject_knowledge_proposal(
  p_organization_id text,
  p_proposal_id uuid,
  p_reviewer_user_id text,
  p_review_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal brain_knowledge_proposals%rowtype;
begin
  if not exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_reviewer_user_id
      and active
      and role in ('org_admin', 'knowledge_steward')
  ) then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_proposal
  from brain_knowledge_proposals
  where organization_id = p_organization_id
    and id = p_proposal_id
    and status = 'pending'
  for update;

  if not found then return false; end if;

  update brain_knowledge_proposals
  set status = 'rejected',
      reviewed_by = p_reviewer_user_id,
      reviewed_at = now(),
      review_note = left(coalesce(p_review_note, ''), 800),
      updated_at = now()
  where id = p_proposal_id;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_reviewer_user_id,
    'knowledge.rejected',
    'knowledge_proposal',
    p_proposal_id::text,
    jsonb_build_object('operation', v_proposal.operation, 'targetPath', v_proposal.target_path)
  );

  return true;
end;
$$;

create or replace function brain_save_org_key(
  p_organization_id text,
  p_actor_user_id text,
  p_actor_email text,
  p_provider text,
  p_key_ciphertext text,
  p_key_last4 text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and active
      and role in ('org_admin', 'knowledge_steward')
  ) then
    raise exception 'knowledge steward access required';
  end if;

  insert into brain_org_keys (
    organization_id,
    provider,
    key_ciphertext,
    key_last4,
    updated_by,
    updated_at
  ) values (
    p_organization_id,
    p_provider,
    p_key_ciphertext,
    p_key_last4,
    p_actor_email,
    now()
  )
  on conflict (organization_id, provider)
  do update set
    key_ciphertext = excluded.key_ciphertext,
    key_last4 = excluded.key_last4,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  ) values (
    p_organization_id,
    p_actor_user_id,
    'provider_key.saved',
    'provider_key',
    p_provider
  );
end;
$$;

create or replace function brain_delete_org_key(
  p_organization_id text,
  p_actor_user_id text,
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and active
      and role in ('org_admin', 'knowledge_steward')
  ) then
    raise exception 'knowledge steward access required';
  end if;

  delete from brain_org_keys
  where organization_id = p_organization_id
    and provider = p_provider;
  if not found then return false; end if;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  ) values (
    p_organization_id,
    p_actor_user_id,
    'provider_key.deleted',
    'provider_key',
    p_provider
  );
  return true;
end;
$$;

create or replace function brain_apply_knowledge_proposal(
  p_organization_id text,
  p_proposal_id uuid,
  p_reviewer_user_id text,
  p_reviewer_email text,
  p_review_note text,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal brain_knowledge_proposals%rowtype;
  v_change jsonb;
  v_document jsonb;
  v_operation text;
  v_path text;
  v_expected_version integer;
  v_current_version integer;
  v_changed_paths text[] := '{}';
  v_index_paths text[] := '{}';
  v_primary_operation text;
begin
  if not exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_reviewer_user_id
      and active
      and role in ('org_admin', 'knowledge_steward')
  ) then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_proposal
  from brain_knowledge_proposals
  where organization_id = p_organization_id
    and id = p_proposal_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'proposal is no longer pending';
  end if;

  if jsonb_typeof(coalesce(p_changes, '[]'::jsonb)) <> 'array' then
    raise exception 'proposal changes must be an array';
  end if;

  if jsonb_array_length(p_changes) > 0 and p_changes->0->>'path' = v_proposal.target_path then
    v_primary_operation := p_changes->0->>'operation';
    if (
      (v_proposal.operation = 'create' and v_primary_operation <> 'create')
      or (v_proposal.operation = 'delete' and v_primary_operation <> 'delete')
      or (v_proposal.operation in ('update', 'link') and v_primary_operation <> 'update')
    ) then
      raise exception 'primary proposal operation does not match the prepared mutation';
    end if;
  elsif v_proposal.operation <> 'link' then
    raise exception 'primary proposal mutation is missing';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_operation := v_change->>'operation';
    v_path := v_change->>'path';
    v_document := v_change->'document';
    v_expected_version := nullif(v_change->>'expectedVersion', '')::integer;

    if v_operation = 'create' then
      insert into brain_docs (
        organization_id,
        path,
        title,
        description,
        department_id,
        project_id,
        doc_type,
        audience,
        tags,
        links,
        content,
        content_hash,
        visibility,
        origin,
        updated_by,
        synced_at
      ) values (
        p_organization_id,
        v_path,
        v_document->>'title',
        coalesce(v_document->>'description', ''),
        nullif(v_document->>'department_id', ''),
        nullif(v_document->>'project_id', ''),
        v_document->>'doc_type',
        coalesce(array(select jsonb_array_elements_text(v_document->'audience')), '{}'::text[]),
        coalesce(array(select jsonb_array_elements_text(v_document->'tags')), '{}'::text[]),
        coalesce(array(select jsonb_array_elements_text(v_document->'links')), '{}'::text[]),
        v_document->>'content',
        v_document->>'content_hash',
        v_document->>'visibility',
        'brain',
        p_reviewer_email,
        now()
      );
      v_index_paths := array_append(v_index_paths, v_path);

    elsif v_operation = 'update' then
      select current_version
      into v_current_version
      from brain_docs
      where organization_id = p_organization_id
        and path = v_path
        and deleted_at is null
      for update;

      if not found then raise exception 'document % is no longer available', v_path; end if;
      if v_expected_version is null or v_current_version <> v_expected_version then
        raise exception 'document % changed after the proposal was prepared', v_path;
      end if;

      update brain_docs
      set title = v_document->>'title',
          description = coalesce(v_document->>'description', ''),
          department_id = nullif(v_document->>'department_id', ''),
          project_id = nullif(v_document->>'project_id', ''),
          doc_type = v_document->>'doc_type',
          audience = coalesce(array(select jsonb_array_elements_text(v_document->'audience')), '{}'::text[]),
          tags = coalesce(array(select jsonb_array_elements_text(v_document->'tags')), '{}'::text[]),
          links = coalesce(array(select jsonb_array_elements_text(v_document->'links')), '{}'::text[]),
          content = v_document->>'content',
          content_hash = v_document->>'content_hash',
          visibility = v_document->>'visibility',
          origin = 'brain',
          updated_by = p_reviewer_email,
          synced_at = now()
      where organization_id = p_organization_id
        and path = v_path
        and current_version = v_expected_version
        and deleted_at is null;
      if not found then raise exception 'document % changed while applying the proposal', v_path; end if;
      v_index_paths := array_append(v_index_paths, v_path);

    elsif v_operation = 'delete' then
      select current_version
      into v_current_version
      from brain_docs
      where organization_id = p_organization_id
        and path = v_path
        and deleted_at is null
      for update;

      if not found then raise exception 'document % is no longer available', v_path; end if;
      if v_expected_version is null or v_current_version <> v_expected_version then
        raise exception 'document % changed after the proposal was prepared', v_path;
      end if;

      update brain_docs
      set deleted_at = now(),
          origin = 'brain',
          updated_by = p_reviewer_email
      where organization_id = p_organization_id
        and path = v_path
        and current_version = v_expected_version
        and deleted_at is null;
      if not found then raise exception 'document % changed while applying the proposal', v_path; end if;

    else
      raise exception 'unsupported proposal mutation operation: %', v_operation;
    end if;

    v_changed_paths := array_append(v_changed_paths, v_path);
  end loop;

  update brain_knowledge_proposals
  set status = 'approved',
      reviewed_by = p_reviewer_user_id,
      reviewed_at = now(),
      review_note = left(coalesce(p_review_note, ''), 800),
      updated_at = now()
  where id = p_proposal_id;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_reviewer_user_id,
    'knowledge.approved',
    'knowledge_proposal',
    p_proposal_id::text,
    jsonb_build_object(
      'operation', v_proposal.operation,
      'targetPath', v_proposal.target_path,
      'affectedPaths', to_jsonb(v_changed_paths)
    )
  );

  return jsonb_build_object(
    'changedPaths', to_jsonb(v_changed_paths),
    'indexPaths', to_jsonb(v_index_paths)
  );
end;
$$;

revoke all on function brain_user_can_access_project(text, text, text)
  from public, anon, authenticated;
revoke all on function brain_persist_context_run(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function brain_reject_knowledge_proposal(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function brain_save_org_key(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function brain_delete_org_key(text, text, text)
  from public, anon, authenticated;
revoke all on function brain_apply_knowledge_proposal(text, uuid, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function brain_user_can_access_project(text, text, text) to service_role;
grant execute on function brain_persist_context_run(jsonb, jsonb) to service_role;
grant execute on function brain_reject_knowledge_proposal(text, uuid, text, text) to service_role;
grant execute on function brain_save_org_key(text, text, text, text, text, text) to service_role;
grant execute on function brain_delete_org_key(text, text, text) to service_role;
grant execute on function brain_apply_knowledge_proposal(text, uuid, text, text, text, jsonb) to service_role;

commit;
