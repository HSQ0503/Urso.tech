-- Urso Brain migration 0005 — governed temporal truth.
-- Run after 0004_brain_trust_hardening.sql in the dedicated Urso HQ project.
--
-- Documents remain the authoritative records. Claims are governed, temporal
-- projections over exact immutable document versions.

begin;

create table if not exists brain_entities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  canonical_key    text not null,
  name             text not null,
  entity_type      text not null,
  project_id       text,
  metadata         jsonb not null default '{}'::jsonb,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, canonical_key),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id)
);
create index if not exists brain_entities_org_project_idx
  on brain_entities (organization_id, project_id, canonical_key);

create table if not exists brain_predicates (
  organization_id  text not null references brain_organizations(id) on delete cascade,
  id               text not null,
  name             text not null,
  description      text not null default '',
  object_type      text not null
                   check (object_type in ('text', 'number', 'boolean', 'date', 'entity')),
  is_exclusive     boolean not null default false,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, id)
);

create table if not exists brain_claims (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    text not null references brain_organizations(id) on delete cascade,
  subject_entity_id  uuid not null,
  predicate_id       text not null,
  object_type        text not null
                     check (object_type in ('text', 'number', 'boolean', 'date', 'entity')),
  object_value       jsonb,
  object_entity_id   uuid,
  object_key         text generated always as (
                       case
                         when object_type = 'entity' then coalesce(object_entity_id::text, '')
                         else coalesce(object_value::text, '')
                       end
                     ) stored,
  lifecycle          text not null default 'active'
                     check (lifecycle in ('active', 'superseded', 'retired')),
  resolution         text not null default 'accepted'
                     check (resolution in ('accepted', 'unresolved', 'contested')),
  valid_from         date,
  valid_until        date,
  project_id         text,
  asserted_by        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, subject_entity_id)
    references brain_entities(organization_id, id),
  foreign key (organization_id, predicate_id)
    references brain_predicates(organization_id, id),
  foreign key (organization_id, object_entity_id)
    references brain_entities(organization_id, id),
  foreign key (organization_id, project_id)
    references brain_projects(organization_id, id),
  check (
    (object_type = 'entity' and object_entity_id is not null and object_value is null)
    or (object_type <> 'entity' and object_entity_id is null and object_value is not null)
  ),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create index if not exists brain_claims_temporal_lookup_idx
  on brain_claims (
    organization_id,
    project_id,
    subject_entity_id,
    predicate_id,
    valid_from,
    valid_until
  );
create index if not exists brain_claims_resolution_idx
  on brain_claims (organization_id, lifecycle, resolution);

create table if not exists brain_claim_evidence (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  claim_id          uuid not null,
  doc_id            uuid not null references brain_docs(id) on delete restrict,
  doc_version       integer not null,
  evidence_role     text not null default 'authoritative'
                    check (evidence_role in ('authoritative', 'supporting')),
  excerpt           text not null check (length(btrim(excerpt)) > 0),
  created_by        text,
  created_at        timestamptz not null default now(),
  foreign key (organization_id, claim_id)
    references brain_claims(organization_id, id) on delete cascade,
  foreign key (doc_id, doc_version)
    references brain_doc_versions(doc_id, version) on delete restrict,
  unique (organization_id, claim_id, doc_id, doc_version, evidence_role)
);
create index if not exists brain_claim_evidence_claim_idx
  on brain_claim_evidence (organization_id, claim_id, evidence_role);
create index if not exists brain_claim_evidence_doc_idx
  on brain_claim_evidence (organization_id, doc_id, doc_version);

create table if not exists brain_claim_relations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  from_claim_id    uuid not null,
  to_claim_id      uuid not null,
  relation_type    text not null
                   check (relation_type in ('supersedes', 'contradicts', 'refines', 'duplicates')),
  created_by       text,
  created_at       timestamptz not null default now(),
  unique (organization_id, from_claim_id, to_claim_id, relation_type),
  foreign key (organization_id, from_claim_id)
    references brain_claims(organization_id, id) on delete cascade,
  foreign key (organization_id, to_claim_id)
    references brain_claims(organization_id, id) on delete cascade,
  check (from_claim_id <> to_claim_id)
);

create table if not exists brain_claim_conflicts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    text not null references brain_organizations(id) on delete cascade,
  subject_entity_id  uuid not null,
  predicate_id       text not null,
  claim_a_id         uuid not null,
  claim_b_id         uuid not null,
  conflict_type      text not null
                     check (conflict_type in ('exclusive_value', 'explicit')),
  status             text not null default 'open'
                     check (status in ('open', 'resolved', 'dismissed')),
  resolution_note    text not null default '',
  resolved_by        text,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, claim_a_id, claim_b_id, conflict_type),
  foreign key (organization_id, subject_entity_id)
    references brain_entities(organization_id, id),
  foreign key (organization_id, predicate_id)
    references brain_predicates(organization_id, id),
  foreign key (organization_id, claim_a_id)
    references brain_claims(organization_id, id) on delete cascade,
  foreign key (organization_id, claim_b_id)
    references brain_claims(organization_id, id) on delete cascade,
  check (claim_a_id <> claim_b_id)
);
create index if not exists brain_claim_conflicts_queue_idx
  on brain_claim_conflicts (organization_id, status, created_at desc);

create table if not exists brain_claim_proposals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  text not null references brain_organizations(id) on delete cascade,
  operation        text not null
                   check (operation in ('assert', 'supersede', 'retire', 'mark_unresolved')),
  target_claim_id  uuid,
  proposed_claim   jsonb not null default '{}'::jsonb,
  evidence         jsonb not null default '[]'::jsonb,
  rationale        text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  proposed_by      text not null,
  reviewed_by      text,
  review_note      text not null default '',
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, target_claim_id)
    references brain_claims(organization_id, id) on delete restrict
);
create index if not exists brain_claim_proposals_queue_idx
  on brain_claim_proposals (organization_id, status, created_at desc);

alter table brain_context_evidence
  add column if not exists claim_id uuid references brain_claims(id) on delete restrict,
  add column if not exists source_version integer;

alter table brain_entities         enable row level security;
alter table brain_predicates       enable row level security;
alter table brain_claims           enable row level security;
alter table brain_claim_evidence   enable row level security;
alter table brain_claim_relations  enable row level security;
alter table brain_claim_conflicts  enable row level security;
alter table brain_claim_proposals  enable row level security;

create or replace function brain_is_truth_steward(
  p_organization_id text,
  p_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_user_id
      and active
      and role in ('org_admin', 'knowledge_steward')
  );
$$;

create or replace function brain_can_read_claim(
  p_organization_id text,
  p_user_id text,
  p_claim_id uuid,
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
    from brain_claims c
    join brain_memberships m
      on m.organization_id = c.organization_id
     and m.user_id = p_user_id
     and m.active
    where c.organization_id = p_organization_id
      and c.id = p_claim_id
      and (
        (
          c.project_id is null
          and (p_project_id is null or brain_user_can_access_project(
            p_organization_id,
            p_user_id,
            p_project_id
          ))
        )
        or (
          c.project_id is not null
          and c.project_id = p_project_id
          and brain_user_can_access_project(
            p_organization_id,
            p_user_id,
            c.project_id
          )
        )
      )
      and exists (
        select 1
        from brain_claim_evidence e
        where e.organization_id = c.organization_id
          and e.claim_id = c.id
          and e.evidence_role = 'authoritative'
      )
      and not exists (
        select 1
        from brain_claim_evidence e
        where e.organization_id = c.organization_id
          and e.claim_id = c.id
          and e.evidence_role = 'authoritative'
          and not brain_can_read_doc(
            p_organization_id,
            p_user_id,
            e.doc_id,
            p_project_id
          )
      )
  );
$$;

create or replace function brain_authorized_temporal_claim_search(
  p_organization_id text,
  p_user_id text,
  p_project_id text,
  p_as_of date,
  p_query text,
  p_limit integer default 12
)
returns table (
  claim_id uuid,
  project_id text,
  subject_entity_id uuid,
  subject_key text,
  subject_name text,
  subject_type text,
  predicate_id text,
  predicate_name text,
  object_type text,
  object_value jsonb,
  object_entity_id uuid,
  object_entity_key text,
  object_entity_name text,
  lifecycle text,
  resolution text,
  valid_from date,
  valid_until date,
  evidence jsonb,
  conflicts jsonb,
  supersedes jsonb,
  superseded_by jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.project_id,
    subject.id,
    subject.canonical_key,
    subject.name,
    subject.entity_type,
    predicate.id,
    predicate.name,
    c.object_type,
    c.object_value,
    c.object_entity_id,
    object_entity.canonical_key,
    object_entity.name,
    c.lifecycle,
    c.resolution,
    c.valid_from,
    c.valid_until,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'doc_id', ce.doc_id,
          'path', coalesce(dv.metadata->>'path', d.path),
          'title', dv.title,
          'doc_type', coalesce(dv.metadata->>'doc_type', d.doc_type),
          'doc_version', ce.doc_version,
          'evidence_role', ce.evidence_role,
          'excerpt', ce.excerpt
        )
        order by case ce.evidence_role when 'authoritative' then 0 else 1 end, ce.created_at
      )
      from brain_claim_evidence ce
      join brain_docs d
        on d.organization_id = ce.organization_id
       and d.id = ce.doc_id
      join brain_doc_versions dv
        on dv.doc_id = ce.doc_id
       and dv.version = ce.doc_version
      where ce.organization_id = c.organization_id
        and ce.claim_id = c.id
        and brain_can_read_doc(
          p_organization_id,
          p_user_id,
          ce.doc_id,
          p_project_id
        )
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', conflict.id,
          'status', conflict.status,
          'subject_name', subject.name,
          'predicate_name', predicate.name,
          'claim_ids', jsonb_build_array(conflict.claim_a_id, conflict.claim_b_id),
          'message', 'Authorized claims disagree for this subject and predicate.'
        )
        order by conflict.created_at
      )
      from brain_claim_conflicts conflict
      where conflict.organization_id = c.organization_id
        and conflict.status = 'open'
        and c.id in (conflict.claim_a_id, conflict.claim_b_id)
        and brain_can_read_claim(
          p_organization_id,
          p_user_id,
          conflict.claim_a_id,
          p_project_id
        )
        and brain_can_read_claim(
          p_organization_id,
          p_user_id,
          conflict.claim_b_id,
          p_project_id
        )
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(r.to_claim_id order by r.created_at)
      from brain_claim_relations r
      where r.organization_id = c.organization_id
        and r.from_claim_id = c.id
        and r.relation_type = 'supersedes'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(r.from_claim_id order by r.created_at)
      from brain_claim_relations r
      where r.organization_id = c.organization_id
        and r.to_claim_id = c.id
        and r.relation_type = 'supersedes'
    ), '[]'::jsonb)
  from brain_claims c
  join brain_entities subject
    on subject.organization_id = c.organization_id
   and subject.id = c.subject_entity_id
  join brain_predicates predicate
    on predicate.organization_id = c.organization_id
   and predicate.id = c.predicate_id
  left join brain_entities object_entity
    on object_entity.organization_id = c.organization_id
   and object_entity.id = c.object_entity_id
  where c.organization_id = p_organization_id
    and (c.valid_from is null or c.valid_from <= p_as_of)
    and (c.valid_until is null or c.valid_until > p_as_of)
    and brain_can_read_claim(
      p_organization_id,
      p_user_id,
      c.id,
      p_project_id
    )
    and (
      nullif(btrim(p_query), '') is null
      or exists (
        select 1
        from unnest(regexp_split_to_array(lower(p_query), '[^a-z0-9]+')) term
        where length(term) >= 3
          and lower(concat_ws(
          ' ',
          subject.canonical_key,
          subject.name,
          subject.entity_type,
          predicate.id,
          predicate.name,
          c.object_value::text,
          object_entity.canonical_key,
          object_entity.name
        )) like '%' || term || '%'
      )
    )
  order by
    case c.resolution when 'accepted' then 0 when 'unresolved' then 1 else 2 end,
    case c.lifecycle when 'active' then 0 when 'superseded' then 1 else 2 end,
    c.valid_from desc nulls last,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$$;

create or replace function brain_authorized_claims_for_doc(
  p_organization_id text,
  p_user_id text,
  p_doc_id uuid,
  p_project_id text,
  p_as_of date,
  p_include_history boolean default false
)
returns table (
  claim_id uuid,
  project_id text,
  subject_entity_id uuid,
  subject_key text,
  subject_name text,
  subject_type text,
  predicate_id text,
  predicate_name text,
  object_type text,
  object_value jsonb,
  object_entity_id uuid,
  object_entity_key text,
  object_entity_name text,
  lifecycle text,
  resolution text,
  valid_from date,
  valid_until date,
  evidence jsonb,
  conflicts jsonb,
  supersedes jsonb,
  superseded_by jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select search.*
  from brain_authorized_temporal_claim_search(
    p_organization_id,
    p_user_id,
    p_project_id,
    p_as_of,
    '',
    100
  ) search
  where search.evidence @> jsonb_build_array(jsonb_build_object('doc_id', p_doc_id))
    and (p_include_history or search.lifecycle = 'active');
$$;

create or replace function brain_refresh_claim_conflicts(
  p_organization_id text,
  p_subject_entity_id uuid default null,
  p_predicate_id text default null,
  p_actor_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opened integer := 0;
  v_resolved integer := 0;
begin
  if p_actor_user_id is not null
     and not brain_is_truth_steward(p_organization_id, p_actor_user_id) then
    raise exception 'knowledge steward access required';
  end if;

  insert into brain_claim_conflicts (
    organization_id,
    subject_entity_id,
    predicate_id,
    claim_a_id,
    claim_b_id,
    conflict_type,
    status
  )
  select
    left_claim.organization_id,
    left_claim.subject_entity_id,
    left_claim.predicate_id,
    left_claim.id,
    right_claim.id,
    'exclusive_value',
    'open'
  from brain_claims left_claim
  join brain_claims right_claim
    on right_claim.organization_id = left_claim.organization_id
   and right_claim.subject_entity_id = left_claim.subject_entity_id
   and right_claim.predicate_id = left_claim.predicate_id
   and left_claim.id::text < right_claim.id::text
  join brain_predicates predicate
    on predicate.organization_id = left_claim.organization_id
   and predicate.id = left_claim.predicate_id
   and predicate.is_exclusive
  where left_claim.organization_id = p_organization_id
    and (p_subject_entity_id is null or left_claim.subject_entity_id = p_subject_entity_id)
    and (p_predicate_id is null or left_claim.predicate_id = p_predicate_id)
    and left_claim.lifecycle = 'active'
    and right_claim.lifecycle = 'active'
    and left_claim.resolution in ('accepted', 'contested')
    and right_claim.resolution in ('accepted', 'contested')
    and left_claim.object_key <> right_claim.object_key
    and daterange(left_claim.valid_from, left_claim.valid_until, '[)')
        && daterange(right_claim.valid_from, right_claim.valid_until, '[)')
  on conflict (organization_id, claim_a_id, claim_b_id, conflict_type)
  do update
    set status = 'open',
        updated_at = now(),
        resolved_by = null,
        resolved_at = null,
        resolution_note = ''
  where brain_claim_conflicts.status <> 'dismissed';
  get diagnostics v_opened = row_count;

  update brain_claim_conflicts conflict
  set status = 'resolved',
      resolution_note = case
        when conflict.resolution_note = '' then 'Claims no longer overlap as active accepted truth.'
        else conflict.resolution_note
      end,
      resolved_by = coalesce(p_actor_user_id, conflict.resolved_by),
      resolved_at = now(),
      updated_at = now()
  where conflict.organization_id = p_organization_id
    and conflict.status = 'open'
    and (p_subject_entity_id is null or conflict.subject_entity_id = p_subject_entity_id)
    and (p_predicate_id is null or conflict.predicate_id = p_predicate_id)
    and not exists (
      select 1
      from brain_claims left_claim
      join brain_claims right_claim
        on right_claim.organization_id = left_claim.organization_id
       and right_claim.id = conflict.claim_b_id
      join brain_predicates predicate
        on predicate.organization_id = left_claim.organization_id
       and predicate.id = left_claim.predicate_id
       and predicate.is_exclusive
      where left_claim.organization_id = conflict.organization_id
        and left_claim.id = conflict.claim_a_id
        and left_claim.lifecycle = 'active'
        and right_claim.lifecycle = 'active'
        and left_claim.resolution in ('accepted', 'contested')
        and right_claim.resolution in ('accepted', 'contested')
        and left_claim.object_key <> right_claim.object_key
        and daterange(left_claim.valid_from, left_claim.valid_until, '[)')
            && daterange(right_claim.valid_from, right_claim.valid_until, '[)')
    );
  get diagnostics v_resolved = row_count;

  return jsonb_build_object(
    'openedOrReopened', v_opened,
    'resolved', v_resolved,
    'openConflictIds', coalesce((
      select jsonb_agg(id order by created_at)
      from brain_claim_conflicts
      where organization_id = p_organization_id
        and status = 'open'
        and (p_subject_entity_id is null or subject_entity_id = p_subject_entity_id)
        and (p_predicate_id is null or predicate_id = p_predicate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function brain_apply_claim_proposal(
  p_organization_id text,
  p_proposal_id uuid,
  p_reviewer_user_id text,
  p_review_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal brain_claim_proposals%rowtype;
  v_target brain_claims%rowtype;
  v_claim brain_claims%rowtype;
  v_claim_id uuid;
  v_subject_id uuid;
  v_predicate_id text;
  v_object_type text;
  v_object_value jsonb;
  v_object_entity_id uuid;
  v_resolution text;
  v_valid_from date;
  v_valid_until date;
  v_project_id text;
  v_item jsonb;
  v_doc_id uuid;
  v_doc_version integer;
  v_evidence_role text;
  v_excerpt text;
  v_refresh jsonb := '{}'::jsonb;
  v_affected jsonb := '[]'::jsonb;
begin
  if not brain_is_truth_steward(p_organization_id, p_reviewer_user_id) then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_proposal
  from brain_claim_proposals
  where organization_id = p_organization_id
    and id = p_proposal_id
  for update;

  if not found then raise exception 'claim proposal not found'; end if;
  if v_proposal.status <> 'pending' then raise exception 'claim proposal is not pending'; end if;
  if not exists (
    select 1
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = v_proposal.proposed_by
      and active
  ) then
    raise exception 'proposal author no longer has an active Brain membership';
  end if;

  if v_proposal.target_claim_id is not null then
    select *
    into v_target
    from brain_claims
    where organization_id = p_organization_id
      and id = v_proposal.target_claim_id
    for update;
    if not found then raise exception 'target claim not found'; end if;
    if v_proposal.proposed_claim ? 'expected_target_updated_at'
       and v_target.updated_at::text <> v_proposal.proposed_claim->>'expected_target_updated_at' then
      raise exception 'target claim changed after proposal creation';
    end if;
  end if;

  if v_proposal.operation in ('assert', 'supersede') then
    if v_proposal.operation = 'supersede' and v_proposal.target_claim_id is null then
      raise exception 'supersession requires a target claim';
    end if;
    if v_proposal.operation = 'supersede' and v_target.lifecycle <> 'active' then
      raise exception 'only an active claim can be superseded';
    end if;

    v_subject_id := case
      when v_proposal.operation = 'supersede' then v_target.subject_entity_id
      else nullif(v_proposal.proposed_claim->>'subject_entity_id', '')::uuid
    end;
    v_predicate_id := case
      when v_proposal.operation = 'supersede' then v_target.predicate_id
      else nullif(v_proposal.proposed_claim->>'predicate_id', '')
    end;
    v_object_type := nullif(v_proposal.proposed_claim->>'object_type', '');
    v_object_value := v_proposal.proposed_claim->'object_value';
    v_object_entity_id := nullif(v_proposal.proposed_claim->>'object_entity_id', '')::uuid;
    v_resolution := coalesce(nullif(v_proposal.proposed_claim->>'resolution', ''), 'accepted');
    v_valid_from := nullif(v_proposal.proposed_claim->>'valid_from', '')::date;
    v_valid_until := nullif(v_proposal.proposed_claim->>'valid_until', '')::date;
    v_project_id := case
      when v_proposal.operation = 'supersede' then v_target.project_id
      else nullif(v_proposal.proposed_claim->>'project_id', '')
    end;

    if v_subject_id is null or v_predicate_id is null or v_object_type is null then
      raise exception 'proposed claim is missing subject, predicate, or object type';
    end if;
    if not exists (
      select 1
      from brain_entities
      where organization_id = p_organization_id
        and id = v_subject_id
        and project_id is not distinct from v_project_id
    ) then
      raise exception 'claim subject is outside the proposal organization/project';
    end if;
    if not exists (
      select 1
      from brain_predicates
      where organization_id = p_organization_id
        and id = v_predicate_id
        and object_type = v_object_type
    ) then
      raise exception 'claim predicate or object type is invalid';
    end if;
    if v_project_id is not null and not brain_user_can_access_project(
      p_organization_id,
      v_proposal.proposed_by,
      v_project_id
    ) then
      raise exception 'proposal author lacks project access';
    end if;
    if v_resolution = 'accepted' and not exists (
      select 1
      from jsonb_array_elements(v_proposal.evidence) item
      where coalesce(item->>'evidence_role', 'authoritative') = 'authoritative'
    ) then
      raise exception 'accepted claims require authoritative evidence';
    end if;
    if v_proposal.operation = 'supersede'
       and v_valid_from is null then
      raise exception 'supersession requires an effective date';
    end if;
    if v_proposal.operation = 'supersede'
       and v_target.valid_from is not null
       and v_valid_from < v_target.valid_from then
      raise exception 'supersession cannot predate the target claim';
    end if;

    insert into brain_claims (
      organization_id,
      subject_entity_id,
      predicate_id,
      object_type,
      object_value,
      object_entity_id,
      lifecycle,
      resolution,
      valid_from,
      valid_until,
      project_id,
      asserted_by
    ) values (
      p_organization_id,
      v_subject_id,
      v_predicate_id,
      v_object_type,
      case when v_object_type = 'entity' then null else v_object_value end,
      case when v_object_type = 'entity' then v_object_entity_id else null end,
      'active',
      v_resolution,
      v_valid_from,
      v_valid_until,
      v_project_id,
      v_proposal.proposed_by
    )
    returning * into v_claim;
    v_claim_id := v_claim.id;

    for v_item in
      select value from jsonb_array_elements(v_proposal.evidence)
    loop
      v_doc_id := nullif(v_item->>'doc_id', '')::uuid;
      v_doc_version := nullif(v_item->>'doc_version', '')::integer;
      v_evidence_role := coalesce(nullif(v_item->>'evidence_role', ''), 'authoritative');
      v_excerpt := btrim(coalesce(v_item->>'excerpt', ''));

      if v_doc_id is null or v_doc_version is null or v_excerpt = '' then
        raise exception 'claim evidence requires doc_id, doc_version, and excerpt';
      end if;
      if not exists (
        select 1
        from brain_doc_versions dv
        where dv.organization_id = p_organization_id
          and dv.doc_id = v_doc_id
          and dv.version = v_doc_version
          and (
            position(v_excerpt in dv.content) > 0
            or position(
              regexp_replace(v_excerpt, '\s+', ' ', 'g')
              in regexp_replace(dv.content, '\s+', ' ', 'g')
            ) > 0
          )
      ) then
        raise exception 'claim evidence is not an exact excerpt from that document version';
      end if;
      if not brain_can_read_doc(
        p_organization_id,
        v_proposal.proposed_by,
        v_doc_id,
        v_project_id
      ) then
        raise exception 'proposal evidence is outside the author''s permitted scope';
      end if;

      insert into brain_claim_evidence (
        organization_id,
        claim_id,
        doc_id,
        doc_version,
        evidence_role,
        excerpt,
        created_by
      ) values (
        p_organization_id,
        v_claim_id,
        v_doc_id,
        v_doc_version,
        v_evidence_role,
        v_excerpt,
        v_proposal.proposed_by
      );
    end loop;

    if v_resolution = 'accepted' and not exists (
      select 1
      from brain_claim_evidence
      where organization_id = p_organization_id
        and claim_id = v_claim_id
        and evidence_role = 'authoritative'
    ) then
      raise exception 'accepted claim evidence could not be persisted';
    end if;

    if v_proposal.operation = 'supersede' then
      update brain_claims
      set lifecycle = 'superseded',
          valid_until = v_valid_from,
          updated_at = now()
      where organization_id = p_organization_id
        and id = v_target.id;

      insert into brain_claim_relations (
        organization_id,
        from_claim_id,
        to_claim_id,
        relation_type,
        created_by
      ) values (
        p_organization_id,
        v_claim_id,
        v_target.id,
        'supersedes',
        p_reviewer_user_id
      );
      v_affected := jsonb_build_array(v_claim_id, v_target.id);
    else
      v_affected := jsonb_build_array(v_claim_id);
    end if;

    v_refresh := brain_refresh_claim_conflicts(
      p_organization_id,
      v_subject_id,
      v_predicate_id,
      null
    );
  elsif v_proposal.operation = 'retire' then
    if v_proposal.target_claim_id is null then raise exception 'retirement requires a target claim'; end if;
    if v_target.lifecycle <> 'active' then raise exception 'only an active claim can be retired'; end if;
    v_valid_until := coalesce(
      nullif(v_proposal.proposed_claim->>'valid_until', '')::date,
      current_date
    );
    if v_target.valid_from is not null and v_valid_until < v_target.valid_from then
      raise exception 'retirement cannot predate the target claim';
    end if;
    update brain_claims
    set lifecycle = 'retired',
        valid_until = v_valid_until,
        updated_at = now()
    where organization_id = p_organization_id
      and id = v_target.id;
    v_claim_id := v_target.id;
    v_affected := jsonb_build_array(v_target.id);
    v_refresh := brain_refresh_claim_conflicts(
      p_organization_id,
      v_target.subject_entity_id,
      v_target.predicate_id,
      null
    );
  elsif v_proposal.operation = 'mark_unresolved' then
    if v_proposal.target_claim_id is null then raise exception 'resolution change requires a target claim'; end if;
    update brain_claims
    set resolution = 'unresolved',
        updated_at = now()
    where organization_id = p_organization_id
      and id = v_target.id;
    v_claim_id := v_target.id;
    v_affected := jsonb_build_array(v_target.id);
    v_refresh := brain_refresh_claim_conflicts(
      p_organization_id,
      v_target.subject_entity_id,
      v_target.predicate_id,
      null
    );
  else
    raise exception 'unsupported claim proposal operation';
  end if;

  update brain_claim_proposals
  set status = 'approved',
      reviewed_by = p_reviewer_user_id,
      review_note = coalesce(p_review_note, ''),
      reviewed_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_proposal_id;

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
    'claim.proposal.approved',
    'claim_proposal',
    p_proposal_id::text,
    jsonb_build_object(
      'operation', v_proposal.operation,
      'claimId', v_claim_id,
      'affectedClaimIds', v_affected,
      'reviewNote', coalesce(p_review_note, '')
    )
  );

  return jsonb_build_object(
    'proposalId', p_proposal_id,
    'operation', v_proposal.operation,
    'claimId', v_claim_id,
    'affectedClaimIds', v_affected,
    'openConflictIds', coalesce(v_refresh->'openConflictIds', '[]'::jsonb)
  );
end;
$$;

create or replace function brain_reject_claim_proposal(
  p_organization_id text,
  p_proposal_id uuid,
  p_reviewer_user_id text,
  p_review_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal brain_claim_proposals%rowtype;
begin
  if not brain_is_truth_steward(p_organization_id, p_reviewer_user_id) then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_proposal
  from brain_claim_proposals
  where organization_id = p_organization_id
    and id = p_proposal_id
  for update;
  if not found then raise exception 'claim proposal not found'; end if;
  if v_proposal.status <> 'pending' then raise exception 'claim proposal is not pending'; end if;

  update brain_claim_proposals
  set status = 'rejected',
      reviewed_by = p_reviewer_user_id,
      review_note = coalesce(p_review_note, ''),
      reviewed_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_proposal_id;

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
    'claim.proposal.rejected',
    'claim_proposal',
    p_proposal_id::text,
    jsonb_build_object(
      'operation', v_proposal.operation,
      'reviewNote', coalesce(p_review_note, '')
    )
  );
  return true;
end;
$$;

create or replace function brain_resolve_claim_conflict(
  p_organization_id text,
  p_conflict_id uuid,
  p_reviewer_user_id text,
  p_resolution text,
  p_review_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict brain_claim_conflicts%rowtype;
  v_left brain_claims%rowtype;
  v_right brain_claims%rowtype;
  v_loser_id uuid;
  v_winner_id uuid;
  v_effective date;
begin
  if not brain_is_truth_steward(p_organization_id, p_reviewer_user_id) then
    raise exception 'knowledge steward access required';
  end if;
  if p_resolution not in (
    'supersede_left',
    'supersede_right',
    'keep_unresolved',
    'dismiss_duplicate'
  ) then
    raise exception 'invalid conflict resolution';
  end if;

  select *
  into v_conflict
  from brain_claim_conflicts
  where organization_id = p_organization_id
    and id = p_conflict_id
  for update;
  if not found then raise exception 'claim conflict not found'; end if;
  if v_conflict.status <> 'open' then raise exception 'claim conflict is not open'; end if;

  select * into v_left
  from brain_claims
  where organization_id = p_organization_id and id = v_conflict.claim_a_id
  for update;
  select * into v_right
  from brain_claims
  where organization_id = p_organization_id and id = v_conflict.claim_b_id
  for update;

  if p_resolution in ('supersede_left', 'supersede_right') then
    v_loser_id := case when p_resolution = 'supersede_left' then v_left.id else v_right.id end;
    v_winner_id := case when p_resolution = 'supersede_left' then v_right.id else v_left.id end;
    v_effective := greatest(
      current_date,
      coalesce(
        case when p_resolution = 'supersede_left' then v_left.valid_from else v_right.valid_from end,
        current_date
      )
    );

    update brain_claims
    set lifecycle = 'superseded',
        valid_until = v_effective,
        updated_at = now()
    where organization_id = p_organization_id
      and id = v_loser_id;

    insert into brain_claim_relations (
      organization_id,
      from_claim_id,
      to_claim_id,
      relation_type,
      created_by
    ) values (
      p_organization_id,
      v_winner_id,
      v_loser_id,
      'supersedes',
      p_reviewer_user_id
    )
    on conflict (organization_id, from_claim_id, to_claim_id, relation_type)
    do nothing;
  elsif p_resolution = 'keep_unresolved' then
    update brain_claims
    set resolution = 'unresolved',
        updated_at = now()
    where organization_id = p_organization_id
      and id in (v_left.id, v_right.id);
  else
    insert into brain_claim_relations (
      organization_id,
      from_claim_id,
      to_claim_id,
      relation_type,
      created_by
    ) values (
      p_organization_id,
      v_right.id,
      v_left.id,
      'duplicates',
      p_reviewer_user_id
    )
    on conflict (organization_id, from_claim_id, to_claim_id, relation_type)
    do nothing;
  end if;

  update brain_claim_conflicts
  set status = case when p_resolution = 'dismiss_duplicate' then 'dismissed' else 'resolved' end,
      resolution_note = coalesce(p_review_note, ''),
      resolved_by = p_reviewer_user_id,
      resolved_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_conflict_id;

  perform brain_refresh_claim_conflicts(
    p_organization_id,
    v_conflict.subject_entity_id,
    v_conflict.predicate_id,
    null
  );

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
    'claim.conflict.resolved',
    'claim_conflict',
    p_conflict_id::text,
    jsonb_build_object(
      'resolution', p_resolution,
      'claimIds', jsonb_build_array(v_left.id, v_right.id),
      'reviewNote', coalesce(p_review_note, '')
    )
  );

  return jsonb_build_object(
    'conflictId', p_conflict_id,
    'resolution', p_resolution,
    'claimIds', jsonb_build_array(v_left.id, v_right.id)
  );
end;
$$;

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
  v_project_id text := nullif(p_run->>'project_id', '');
  v_item jsonb;
  v_doc_id uuid;
  v_chunk_id uuid;
  v_claim_id uuid;
  v_source_version integer;
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
  if v_project_id is not null
     and not brain_user_can_access_project(v_organization_id, v_user_id, v_project_id) then
    raise exception 'project access required';
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
    v_project_id,
    p_run->>'query',
    p_run->>'status',
    p_run->>'retrieval_mode',
    p_run->'plan',
    p_run->'receipt',
    (p_run->>'latency_ms')::integer
  );

  for v_item in
    select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_doc_id := nullif(v_item->>'doc_id', '')::uuid;
    v_chunk_id := nullif(v_item->>'chunk_id', '')::uuid;
    v_claim_id := nullif(v_item->>'claim_id', '')::uuid;
    v_source_version := nullif(v_item->>'source_version', '')::integer;

    if not exists (
      select 1
      from brain_doc_versions
      where organization_id = v_organization_id
        and doc_id = v_doc_id
        and version = v_source_version
    ) then
      raise exception 'context evidence source version is outside the run organization';
    end if;
    if not brain_can_read_doc(
      v_organization_id,
      v_user_id,
      v_doc_id,
      v_project_id
    ) then
      raise exception 'context evidence document is not authorized';
    end if;
    if v_chunk_id is not null and not exists (
      select 1
      from brain_doc_chunks
      where organization_id = v_organization_id
        and id = v_chunk_id
        and doc_id = v_doc_id
        and version = v_source_version
    ) then
      raise exception 'context evidence chunk does not belong to its source version';
    end if;
    if v_claim_id is not null then
      if not brain_can_read_claim(
        v_organization_id,
        v_user_id,
        v_claim_id,
        v_project_id
      ) then
        raise exception 'context evidence claim is not authorized';
      end if;
      if not exists (
        select 1
        from brain_claim_evidence
        where organization_id = v_organization_id
          and claim_id = v_claim_id
          and doc_id = v_doc_id
          and doc_version = v_source_version
      ) then
        raise exception 'context evidence source is not provenance for its claim';
      end if;
    end if;

    insert into brain_context_evidence (
      context_run_id,
      evidence_id,
      doc_id,
      chunk_id,
      claim_id,
      source_version,
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
      v_claim_id,
      v_source_version,
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

create or replace function brain_audit_claim_proposal_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proposed_by like 'brain-m5-acceptance-%' then
    return new;
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
    new.proposed_by,
    'claim.proposed',
    'claim_proposal',
    new.id::text,
    jsonb_build_object(
      'operation', new.operation,
      'targetClaimId', new.target_claim_id
    )
  );
  return new;
end;
$$;

drop trigger if exists brain_claim_proposals_audit_created on brain_claim_proposals;
create trigger brain_claim_proposals_audit_created
after insert on brain_claim_proposals
for each row execute function brain_audit_claim_proposal_created();

-- Curated first vertical slice: Woof Gang GBP was planned, then explicitly
-- removed from scope on 2026-07-24. The seed is skipped unless both exact,
-- immutable source excerpts exist; accepted claims are never created without
-- provenance.
insert into brain_entities (
  id,
  organization_id,
  canonical_key,
  name,
  entity_type,
  project_id,
  created_by
) values (
  '75000000-0000-4000-8000-000000000001',
  'urso',
  'woof-gang/gbp-data-integration',
  'Woof Gang Google Business Profile data integration',
  'integration',
  'woof-gang',
  'brain-m5-seed'
)
on conflict (organization_id, canonical_key) do nothing;

insert into brain_predicates (
  organization_id,
  id,
  name,
  description,
  object_type,
  is_exclusive,
  created_by
) values (
  'urso',
  'integration_status',
  'Integration status',
  'The approved lifecycle status of a source-system integration.',
  'text',
  true,
  'brain-m5-seed'
)
on conflict (organization_id, id) do update
set is_exclusive = excluded.is_exclusive,
    updated_at = now();

do $$
declare
  v_entity_id uuid;
  v_planned_doc_id uuid;
  v_current_doc_id uuid;
  v_planned_excerpt constant text :=
    'The **API** (for the automated dashboard) needs a Cloud project + an allowlist.';
  v_current_excerpt constant text :=
    'Urso will not fetch data from Google Business Profile (GBP) for Woof Gang.';
begin
  select id into v_entity_id
  from brain_entities
  where organization_id = 'urso'
    and canonical_key = 'woof-gang/gbp-data-integration';

  select d.id into v_planned_doc_id
  from brain_docs d
  join brain_doc_versions dv
    on dv.doc_id = d.id
   and dv.version = 1
  where d.organization_id = 'urso'
    and d.path = '03 - Woof Gang — Product & Build/Integration — Google Business Profile.md'
    and position(v_planned_excerpt in dv.content) > 0;

  select d.id into v_current_doc_id
  from brain_docs d
  join brain_doc_versions dv
    on dv.doc_id = d.id
   and dv.version = 1
  where d.organization_id = 'urso'
    and d.path = '01 - Urso/Decision — Woof Gang GBP Data Access.md'
    and position(v_current_excerpt in dv.content) > 0;

  if v_entity_id is null or v_planned_doc_id is null or v_current_doc_id is null then
    raise notice 'Skipping Woof GBP temporal seed: exact source versions are unavailable.';
    return;
  end if;

  insert into brain_claims (
    id,
    organization_id,
    subject_entity_id,
    predicate_id,
    object_type,
    object_value,
    lifecycle,
    resolution,
    valid_from,
    valid_until,
    project_id,
    asserted_by
  ) values (
    '75000000-0000-4000-8000-000000000002',
    'urso',
    v_entity_id,
    'integration_status',
    'text',
    to_jsonb('planned'::text),
    'superseded',
    'accepted',
    '2026-06-09',
    '2026-07-24',
    'woof-gang',
    'brain-m5-seed'
  )
  on conflict (id) do nothing;

  insert into brain_claim_evidence (
    organization_id,
    claim_id,
    doc_id,
    doc_version,
    evidence_role,
    excerpt,
    created_by
  ) values (
    'urso',
    '75000000-0000-4000-8000-000000000002',
    v_planned_doc_id,
    1,
    'authoritative',
    v_planned_excerpt,
    'brain-m5-seed'
  )
  on conflict (
    organization_id,
    claim_id,
    doc_id,
    doc_version,
    evidence_role
  ) do nothing;

  insert into brain_claims (
    id,
    organization_id,
    subject_entity_id,
    predicate_id,
    object_type,
    object_value,
    lifecycle,
    resolution,
    valid_from,
    valid_until,
    project_id,
    asserted_by
  ) values (
    '75000000-0000-4000-8000-000000000003',
    'urso',
    v_entity_id,
    'integration_status',
    'text',
    to_jsonb('out_of_scope'::text),
    'active',
    'accepted',
    '2026-07-24',
    null,
    'woof-gang',
    'brain-m5-seed'
  )
  on conflict (id) do nothing;

  insert into brain_claim_evidence (
    organization_id,
    claim_id,
    doc_id,
    doc_version,
    evidence_role,
    excerpt,
    created_by
  ) values (
    'urso',
    '75000000-0000-4000-8000-000000000003',
    v_current_doc_id,
    1,
    'authoritative',
    v_current_excerpt,
    'brain-m5-seed'
  )
  on conflict (
    organization_id,
    claim_id,
    doc_id,
    doc_version,
    evidence_role
  ) do nothing;

  insert into brain_claim_relations (
    organization_id,
    from_claim_id,
    to_claim_id,
    relation_type,
    created_by
  ) values (
    'urso',
    '75000000-0000-4000-8000-000000000003',
    '75000000-0000-4000-8000-000000000002',
    'supersedes',
    'brain-m5-seed'
  )
  on conflict (organization_id, from_claim_id, to_claim_id, relation_type)
  do nothing;
end;
$$;

revoke all on table
  brain_entities,
  brain_predicates,
  brain_claims,
  brain_claim_evidence,
  brain_claim_relations,
  brain_claim_conflicts,
  brain_claim_proposals
from public, anon, authenticated;

grant all on table
  brain_entities,
  brain_predicates,
  brain_claims,
  brain_claim_evidence,
  brain_claim_relations,
  brain_claim_conflicts,
  brain_claim_proposals
to service_role;

revoke all on function brain_is_truth_steward(text, text)
  from public, anon, authenticated;
revoke all on function brain_can_read_claim(text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function brain_authorized_temporal_claim_search(text, text, text, date, text, integer)
  from public, anon, authenticated;
revoke all on function brain_authorized_claims_for_doc(text, text, uuid, text, date, boolean)
  from public, anon, authenticated;
revoke all on function brain_refresh_claim_conflicts(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function brain_apply_claim_proposal(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function brain_reject_claim_proposal(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function brain_resolve_claim_conflict(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function brain_persist_context_run(jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function brain_is_truth_steward(text, text) to service_role;
grant execute on function brain_can_read_claim(text, text, uuid, text) to service_role;
grant execute on function brain_authorized_temporal_claim_search(text, text, text, date, text, integer)
  to service_role;
grant execute on function brain_authorized_claims_for_doc(text, text, uuid, text, date, boolean)
  to service_role;
grant execute on function brain_refresh_claim_conflicts(text, uuid, text, text)
  to service_role;
grant execute on function brain_apply_claim_proposal(text, uuid, text, text)
  to service_role;
grant execute on function brain_reject_claim_proposal(text, uuid, text, text)
  to service_role;
grant execute on function brain_resolve_claim_conflict(text, uuid, text, text, text)
  to service_role;
grant execute on function brain_persist_context_run(jsonb, jsonb)
  to service_role;

commit;
