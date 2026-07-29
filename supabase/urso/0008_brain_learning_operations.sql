-- Urso Brain migration 0008 — M6.3 controlled-learning operations.
-- Run after 0007_brain_gardener_operations.sql.
--
-- This migration adds append-only steward assessments, honest learning
-- metrics, exact-scope batch operations, and version-locked document-patch
-- proposal promotion. It never applies a proposal and never writes brain_docs.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists brain_learning_assessments (
  id                 uuid primary key default gen_random_uuid(),
  assessment_order   bigint generated always as identity unique,
  organization_id    text not null references brain_organizations(id) on delete cascade,
  candidate_id       uuid not null,
  reviewer_user_id   text not null,
  verdict             text not null check (verdict in (
                        'correct',
                        'partially_correct',
                        'incorrect',
                        'duplicate',
                        'insufficient_evidence',
                        'out_of_scope',
                        'unsafe'
                      )),
  reason_code         text not null check (reason_code in (
                        'accepted',
                        'needs_correction',
                        'duplicate',
                        'insufficient_evidence',
                        'out_of_scope',
                        'unsafe',
                        'other'
                      )),
  note                text not null default '' check (length(note) <= 1000),
  idempotency_key     text,
  request_hash        text not null check (length(request_hash) = 64),
  candidate_status    text not null check (candidate_status in (
                        'detected',
                        'queued',
                        'batched',
                        'proposed',
                        'dismissed',
                        'applied',
                        'expired'
                      )),
  learning_run_id     uuid not null,
  prompt_version      text not null,
  provider            text,
  model               text,
  evidence_snapshot   jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(evidence_snapshot) = 'array'),
  created_at          timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, candidate_id)
    references brain_learning_candidates(organization_id, id) on delete restrict,
  foreign key (organization_id, reviewer_user_id)
    references brain_memberships(organization_id, user_id) on delete restrict,
  foreign key (organization_id, learning_run_id)
    references brain_learning_runs(organization_id, id) on delete restrict,
  check (
    idempotency_key is null
    or length(btrim(idempotency_key)) between 1 and 200
  ),
  check (
    (verdict = 'correct' and reason_code = 'accepted')
    or (verdict = 'partially_correct' and reason_code = 'needs_correction')
    or (
      verdict = 'incorrect'
      and reason_code in ('needs_correction', 'other')
    )
    or (verdict = 'duplicate' and reason_code = 'duplicate')
    or (
      verdict = 'insufficient_evidence'
      and reason_code = 'insufficient_evidence'
    )
    or (verdict = 'out_of_scope' and reason_code = 'out_of_scope')
    or (verdict = 'unsafe' and reason_code = 'unsafe')
  )
);

create index if not exists brain_learning_assessments_candidate_idx
  on brain_learning_assessments (
    organization_id,
    candidate_id,
    created_at desc,
    assessment_order desc
  );
create index if not exists brain_learning_assessments_reviewer_idx
  on brain_learning_assessments (
    organization_id,
    reviewer_user_id,
    created_at desc
  );

alter table brain_learning_assessments enable row level security;

create or replace function brain_reject_learning_assessment_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'learning assessments are append-only';
end;
$$;

drop trigger if exists brain_learning_assessments_append_only
  on brain_learning_assessments;
create trigger brain_learning_assessments_append_only
before update or delete on brain_learning_assessments
for each row execute function brain_reject_learning_assessment_mutation();

create or replace function brain_assess_learning_candidate(
  p_organization_id text,
  p_candidate_id uuid,
  p_reviewer_user_id text,
  p_verdict text,
  p_reason_code text,
  p_note text default '',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_reviewer_role text;
  v_reviewer_department_id text;
  v_candidate brain_learning_candidates%rowtype;
  v_run brain_learning_runs%rowtype;
  v_evidence_snapshot jsonb := '[]'::jsonb;
  v_assessment brain_learning_assessments%rowtype;
  v_note text := coalesce(p_note, '');
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_request_hash text;
begin
  if p_verdict not in (
    'correct',
    'partially_correct',
    'incorrect',
    'duplicate',
    'insufficient_evidence',
    'out_of_scope',
    'unsafe'
  ) then
    raise exception 'invalid learning assessment verdict';
  end if;
  if p_reason_code not in (
    'accepted',
    'needs_correction',
    'duplicate',
    'insufficient_evidence',
    'out_of_scope',
    'unsafe',
    'other'
  ) then
    raise exception 'invalid learning assessment reason';
  end if;
  if not (
    (p_verdict = 'correct' and p_reason_code = 'accepted')
    or (
      p_verdict = 'partially_correct'
      and p_reason_code = 'needs_correction'
    )
    or (
      p_verdict = 'incorrect'
      and p_reason_code in ('needs_correction', 'other')
    )
    or (p_verdict = 'duplicate' and p_reason_code = 'duplicate')
    or (
      p_verdict = 'insufficient_evidence'
      and p_reason_code = 'insufficient_evidence'
    )
    or (p_verdict = 'out_of_scope' and p_reason_code = 'out_of_scope')
    or (p_verdict = 'unsafe' and p_reason_code = 'unsafe')
  ) then
    raise exception 'learning assessment verdict and reason are incompatible';
  end if;
  if p_reason_code = 'other' and btrim(v_note) = '' then
    raise exception 'other assessments require a note';
  end if;
  if length(v_note) > 1000 then
    raise exception 'learning assessment note is limited to 1000 characters';
  end if;
  if length(coalesce(p_idempotency_key, '')) > 200 then
    raise exception 'learning assessment idempotency key is limited to 200 characters';
  end if;

  select role, department_id
  into v_reviewer_role, v_reviewer_department_id
  from brain_memberships
  where organization_id = p_organization_id
    and user_id = p_reviewer_user_id
    and active
    and role in ('org_admin', 'knowledge_steward')
  for share;
  if not found then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_candidate
  from brain_learning_candidates
  where organization_id = p_organization_id
    and id = p_candidate_id
  for update;
  if not found then
    raise exception 'learning candidate not found';
  end if;
  if v_reviewer_role = 'knowledge_steward'
     and v_candidate.department_id is not null
     and v_candidate.department_id is distinct from v_reviewer_department_id then
    raise exception 'knowledge stewards may assess only permitted department or organization-wide scope';
  end if;

  select *
  into v_run
  from brain_learning_runs
  where organization_id = p_organization_id
    and id = v_candidate.last_detected_run_id;
  if not found then
    raise exception 'learning candidate source run not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'learningEvidenceId', evidence.id,
        'sourceContextRunId', evidence.source_context_run_id,
        'contextEvidenceId', evidence.context_evidence_id,
        'docId', evidence.doc_id,
        'sourceVersion', evidence.source_version,
        'claimId', evidence.claim_id,
        'role', evidence.evidence_role,
        'authority', evidence.authority
      ))
      order by evidence.created_at, evidence.id
    ),
    '[]'::jsonb
  )
  into v_evidence_snapshot
  from (
    select *
    from brain_learning_evidence
    where organization_id = p_organization_id
      and candidate_id = p_candidate_id
    order by created_at, id
    limit 50
  ) evidence;

  v_request_hash := encode(digest(
    concat_ws(
      E'\n',
      p_organization_id,
      p_candidate_id::text,
      p_reviewer_user_id,
      p_verdict,
      p_reason_code,
      v_note
    ),
    'sha256'
  ), 'hex');

  if v_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id || ':learning-assessment:' || v_idempotency_key,
        0
      )
    );

    select *
    into v_assessment
    from brain_learning_assessments
    where organization_id = p_organization_id
      and idempotency_key = v_idempotency_key;

    if found then
      if v_assessment.request_hash <> v_request_hash then
        raise exception 'learning assessment idempotency key was reused with different input';
      end if;
      return jsonb_build_object(
        'assessmentId', v_assessment.id,
        'candidateId', v_assessment.candidate_id,
        'verdict', v_assessment.verdict,
        'reasonCode', v_assessment.reason_code,
        'createdAt', v_assessment.created_at,
        'replayed', true
      );
    end if;
  end if;

  insert into brain_learning_assessments (
    organization_id,
    candidate_id,
    reviewer_user_id,
    verdict,
    reason_code,
    note,
    idempotency_key,
    request_hash,
    candidate_status,
    learning_run_id,
    prompt_version,
    provider,
    model,
    evidence_snapshot
  ) values (
    p_organization_id,
    p_candidate_id,
    p_reviewer_user_id,
    p_verdict,
    p_reason_code,
    v_note,
    v_idempotency_key,
    v_request_hash,
    v_candidate.status,
    v_run.id,
    v_run.prompt_version,
    v_run.provider,
    v_run.model,
    v_evidence_snapshot
  )
  returning * into v_assessment;

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
    'learning.candidate.assessed',
    'learning_assessment',
    v_assessment.id::text,
    jsonb_build_object(
      'candidateId', p_candidate_id,
      'verdict', p_verdict,
      'reasonCode', p_reason_code,
      'evidenceCount', jsonb_array_length(v_evidence_snapshot)
    )
  );

  return jsonb_build_object(
    'assessmentId', v_assessment.id,
    'candidateId', v_assessment.candidate_id,
    'verdict', v_assessment.verdict,
    'reasonCode', v_assessment.reason_code,
    'createdAt', v_assessment.created_at,
    'replayed', false
  );
end;
$$;

create or replace view brain_learning_latest_assessments as
select
  ranked.id,
  ranked.organization_id,
  ranked.candidate_id,
  ranked.reviewer_user_id,
  ranked.verdict,
  ranked.reason_code,
  ranked.note,
  ranked.candidate_status,
  ranked.learning_run_id,
  ranked.prompt_version,
  ranked.provider,
  ranked.model,
  ranked.evidence_snapshot,
  ranked.created_at
from (
  select
    assessment.*,
    row_number() over (
      partition by assessment.organization_id, assessment.candidate_id
      order by assessment.created_at desc, assessment.assessment_order desc
    ) as recency
  from brain_learning_assessments assessment
) ranked
where ranked.recency = 1;

create or replace view brain_learning_operations_metrics as
with assessment_history as (
  select
    organization_id,
    count(*)::integer as assessment_count
  from brain_learning_assessments
  group by organization_id
),
latest as (
  select *
  from brain_learning_latest_assessments
)
select
  policy.organization_id,
  coalesce(history.assessment_count, 0)::integer as assessment_count,
  count(latest.id)::integer as reviewed_count,
  count(latest.id) filter (
    where latest.verdict <> 'insufficient_evidence'
  )::integer as adjudicated_count,
  count(latest.id) filter (where latest.verdict = 'correct')::integer
    as correct_count,
  count(latest.id) filter (where latest.verdict = 'partially_correct')::integer
    as partially_correct_count,
  count(latest.id) filter (where latest.verdict = 'incorrect')::integer
    as incorrect_count,
  count(latest.id) filter (where latest.verdict = 'duplicate')::integer
    as duplicate_count,
  count(latest.id) filter (where latest.verdict = 'insufficient_evidence')::integer
    as insufficient_evidence_count,
  count(latest.id) filter (where latest.verdict = 'out_of_scope')::integer
    as out_of_scope_count,
  count(latest.id) filter (where latest.verdict = 'unsafe')::integer
    as unsafe_count,
  case
    when count(latest.id) filter (
      where latest.verdict <> 'insufficient_evidence'
    ) = 0 then null
    else (
      count(latest.id) filter (where latest.verdict = 'correct')
    )::numeric / (
      count(latest.id) filter (
        where latest.verdict <> 'insufficient_evidence'
      )
    )::numeric
  end as strict_precision,
  case
    when count(latest.id) = 0 then null
    else (
      count(latest.id) filter (
        where latest.verdict in ('correct', 'partially_correct')
      )
    )::numeric / count(latest.id)::numeric
  end as actionable_yield,
  case
    when count(latest.id) = 0 then null
    else (
      count(latest.id) filter (
        where jsonb_array_length(latest.evidence_snapshot) > 0
      )
    )::numeric / count(latest.id)::numeric
  end as evidence_coverage,
  percentile_cont(0.5) within group (
    order by (
      extract(epoch from (latest.created_at - candidate.first_detected_at))
      * 1000
    )
  ) filter (where latest.id is not null) as median_decision_ms
from brain_learning_policies policy
left join assessment_history history
  on history.organization_id = policy.organization_id
left join latest
  on latest.organization_id = policy.organization_id
left join brain_learning_candidates candidate
  on candidate.organization_id = latest.organization_id
 and candidate.id = latest.candidate_id
group by policy.organization_id, history.assessment_count;

alter table brain_learning_batches
  add column if not exists idempotency_key text,
  add column if not exists request_hash text;

alter table brain_learning_batches
  drop constraint if exists brain_learning_batches_idempotency_key_check,
  add constraint brain_learning_batches_idempotency_key_check check (
    idempotency_key is null
    or length(btrim(idempotency_key)) between 1 and 200
  ),
  drop constraint if exists brain_learning_batches_request_hash_check,
  add constraint brain_learning_batches_request_hash_check check (
    request_hash is null
    or length(request_hash) = 64
  );

create unique index if not exists brain_learning_batches_idempotency_idx
  on brain_learning_batches (organization_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists brain_create_learning_batch(
  text,
  text,
  text,
  text,
  uuid[],
  text
);

create or replace function brain_create_learning_batch(
  p_organization_id text,
  p_actor_user_id text,
  p_title text,
  p_summary text,
  p_candidate_ids uuid[],
  p_assigned_to text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_role text;
  v_actor_department_id text;
  v_assignee_role text;
  v_assignee_department_id text;
  v_first brain_learning_candidates%rowtype;
  v_batch brain_learning_batches%rowtype;
  v_candidate_ids uuid[];
  v_candidate_count integer;
  v_distinct_count integer;
  v_locked_count integer;
  v_risk text;
  v_title text := btrim(coalesce(p_title, ''));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_request_hash text;
begin
  select role, department_id
  into v_actor_role, v_actor_department_id
  from brain_memberships
  where organization_id = p_organization_id
    and user_id = p_actor_user_id
    and active
    and role in ('org_admin', 'knowledge_steward')
  for share;
  if not found then
    raise exception 'knowledge steward access required';
  end if;
  if v_title = '' then
    raise exception 'learning batch title is required';
  end if;
  if length(v_title) > 240 then
    raise exception 'learning batch title is limited to 240 characters';
  end if;
  if length(v_summary) > 2000 then
    raise exception 'learning batch summary is limited to 2000 characters';
  end if;
  if length(coalesce(p_idempotency_key, '')) > 200 then
    raise exception 'learning batch idempotency key is limited to 200 characters';
  end if;

  select
    array_agg(candidate_id order by candidate_id),
    count(*)::integer,
    count(distinct candidate_id)::integer
  into v_candidate_ids, v_candidate_count, v_distinct_count
  from unnest(coalesce(p_candidate_ids, '{}'::uuid[])) candidate_id;

  if coalesce(v_candidate_count, 0) = 0 then
    raise exception 'learning batch requires candidates';
  end if;
  if v_candidate_count > 25 then
    raise exception 'learning batches may contain at most 25 candidates';
  end if;
  if v_candidate_count <> v_distinct_count then
    raise exception 'learning batch candidate IDs must be unique';
  end if;

  v_request_hash := encode(digest(
    concat_ws(
      E'\n',
      p_organization_id,
      p_actor_user_id,
      v_title,
      v_summary,
      array_to_string(v_candidate_ids, ','),
      coalesce(p_assigned_to, '')
    ),
    'sha256'
  ), 'hex');

  if v_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id || ':learning-batch:' || v_idempotency_key,
        0
      )
    );

    select *
    into v_batch
    from brain_learning_batches
    where organization_id = p_organization_id
      and idempotency_key = v_idempotency_key
    for update;

    if found then
      if v_batch.request_hash <> v_request_hash then
        raise exception 'learning batch idempotency key was reused with different input';
      end if;
      return jsonb_build_object(
        'batchId', v_batch.id,
        'candidateIds', to_jsonb(v_candidate_ids),
        'candidateCount', v_candidate_count,
        'risk', v_batch.risk,
        'status', v_batch.status,
        'assignedTo', v_batch.assigned_to,
        'replayed', true
      );
    end if;
  end if;

  perform 1
  from brain_learning_candidates candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = any(v_candidate_ids)
  order by candidate.id
  for update;

  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_candidate_count then
    raise exception 'one or more learning batch candidates were not found';
  end if;

  select *
  into v_first
  from brain_learning_candidates
  where organization_id = p_organization_id
    and id = v_candidate_ids[1];

  if exists (
    select 1
    from brain_learning_candidates candidate
    where candidate.organization_id = p_organization_id
      and candidate.id = any(v_candidate_ids)
      and candidate.status not in ('detected', 'queued')
  ) then
    raise exception 'batch candidate is unavailable';
  end if;
  if exists (
    select 1
    from brain_learning_candidates candidate
    where candidate.organization_id = p_organization_id
      and candidate.id = any(v_candidate_ids)
      and (
        candidate.department_id is distinct from v_first.department_id
        or candidate.project_id is distinct from v_first.project_id
      )
  ) then
    raise exception 'batch candidates must share one exact project and department scope';
  end if;
  if exists (
    select 1
    from brain_learning_batch_candidates membership
    join brain_learning_batches batch
      on batch.organization_id = membership.organization_id
     and batch.id = membership.batch_id
    where membership.organization_id = p_organization_id
      and membership.candidate_id = any(v_candidate_ids)
      and batch.status in ('open', 'in_review', 'proposed')
  ) then
    raise exception 'batch candidate already belongs to an active batch';
  end if;
  if v_actor_role = 'knowledge_steward'
     and v_first.department_id is not null
     and v_first.department_id is distinct from v_actor_department_id then
    raise exception 'knowledge stewards may batch only permitted department or organization-wide scope';
  end if;

  if p_assigned_to is not null then
    select role, department_id
    into v_assignee_role, v_assignee_department_id
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = p_assigned_to
      and active
      and role in ('org_admin', 'knowledge_steward')
    for share;
    if not found then
      raise exception 'batch assignee must be an active knowledge steward';
    end if;
    if v_assignee_role = 'knowledge_steward'
       and v_first.department_id is not null
       and v_first.department_id is distinct from v_assignee_department_id then
      raise exception 'batch assignee is outside the permitted candidate scope';
    end if;
  end if;

  select case max(
    case candidate.risk
      when 'informational' then 1
      when 'low' then 2
      when 'material' then 3
      when 'critical' then 4
    end
  )
    when 4 then 'critical'
    when 3 then 'material'
    when 2 then 'low'
    else 'informational'
  end
  into v_risk
  from brain_learning_candidates candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = any(v_candidate_ids);

  insert into brain_learning_batches (
    organization_id,
    title,
    summary,
    department_id,
    project_id,
    risk,
    status,
    assigned_to,
    created_by,
    idempotency_key,
    request_hash
  ) values (
    p_organization_id,
    v_title,
    v_summary,
    v_first.department_id,
    v_first.project_id,
    v_risk,
    'open',
    p_assigned_to,
    p_actor_user_id,
    v_idempotency_key,
    v_request_hash
  )
  returning * into v_batch;

  insert into brain_learning_batch_candidates (
    organization_id,
    batch_id,
    candidate_id,
    added_by
  )
  select
    p_organization_id,
    v_batch.id,
    candidate_id,
    p_actor_user_id
  from unnest(v_candidate_ids) candidate_id;

  update brain_learning_candidates
  set status = 'batched',
      updated_at = now()
  where organization_id = p_organization_id
    and id = any(v_candidate_ids);

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_actor_user_id,
    'learning.batch.created',
    'learning_batch',
    v_batch.id::text,
    jsonb_build_object(
      'candidateIds', to_jsonb(v_candidate_ids),
      'risk', v_risk,
      'assignedTo', p_assigned_to
    )
  );

  return jsonb_build_object(
    'batchId', v_batch.id,
    'candidateIds', to_jsonb(v_candidate_ids),
    'candidateCount', v_candidate_count,
    'risk', v_risk,
    'status', v_batch.status,
    'assignedTo', v_batch.assigned_to,
    'replayed', false
  );
end;
$$;

create or replace function brain_transition_learning_batch(
  p_organization_id text,
  p_batch_id uuid,
  p_actor_user_id text,
  p_action text,
  p_note text default '',
  p_assigned_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_actor_department_id text;
  v_assignee_role text;
  v_assignee_department_id text;
  v_batch brain_learning_batches%rowtype;
  v_effective_assignee text;
  v_released_count integer := 0;
  v_note text := coalesce(p_note, '');
begin
  if p_action not in ('assign', 'start_review', 'dismiss') then
    raise exception 'invalid learning batch transition';
  end if;
  if length(v_note) > 1000 then
    raise exception 'learning batch transition note is limited to 1000 characters';
  end if;

  select role, department_id
  into v_actor_role, v_actor_department_id
  from brain_memberships
  where organization_id = p_organization_id
    and user_id = p_actor_user_id
    and active
    and role in ('org_admin', 'knowledge_steward')
  for share;
  if not found then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_batch
  from brain_learning_batches
  where organization_id = p_organization_id
    and id = p_batch_id
  for update;
  if not found then
    raise exception 'learning batch not found';
  end if;
  if v_actor_role = 'knowledge_steward'
     and v_batch.department_id is not null
     and v_batch.department_id is distinct from v_actor_department_id then
    raise exception 'knowledge stewards may transition only permitted department or organization-wide scope';
  end if;

  if p_action = 'dismiss' and v_batch.status = 'dismissed' then
    return jsonb_build_object(
      'batchId', v_batch.id,
      'status', v_batch.status,
      'assignedTo', v_batch.assigned_to,
      'releasedCandidateCount', 0,
      'replayed', true
    );
  end if;
  if p_action = 'dismiss' then
    if v_batch.status not in ('open', 'in_review') then
      raise exception 'learning batch cannot be dismissed from its current status';
    end if;

    update brain_learning_batches
    set status = 'dismissed',
        reviewed_by = p_actor_user_id,
        review_note = v_note,
        reviewed_at = now(),
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_batch_id
    returning * into v_batch;

    update brain_learning_candidates candidate
    set status = 'queued',
        updated_at = now()
    where candidate.organization_id = p_organization_id
      and candidate.status = 'batched'
      and exists (
        select 1
        from brain_learning_batch_candidates membership
        where membership.organization_id = candidate.organization_id
          and membership.batch_id = p_batch_id
          and membership.candidate_id = candidate.id
      )
      and not exists (
        select 1
        from brain_learning_batch_candidates other_membership
        join brain_learning_batches other_batch
          on other_batch.organization_id = other_membership.organization_id
         and other_batch.id = other_membership.batch_id
        where other_membership.organization_id = candidate.organization_id
          and other_membership.candidate_id = candidate.id
          and other_membership.batch_id <> p_batch_id
          and other_batch.status in ('open', 'in_review', 'proposed')
      );
    get diagnostics v_released_count = row_count;
  else
    if v_batch.status not in ('open', 'in_review') then
      raise exception 'learning batch assignment is no longer editable';
    end if;
    if p_action = 'assign' and p_assigned_to is null then
      raise exception 'batch assignment requires an assignee';
    end if;

    v_effective_assignee := coalesce(p_assigned_to, v_batch.assigned_to);
    if v_effective_assignee is null then
      raise exception 'starting review requires an active steward assignment';
    end if;

    select role, department_id
    into v_assignee_role, v_assignee_department_id
    from brain_memberships
    where organization_id = p_organization_id
      and user_id = v_effective_assignee
      and active
      and role in ('org_admin', 'knowledge_steward')
    for share;
    if not found then
      raise exception 'batch assignee must be an active knowledge steward';
    end if;
    if v_assignee_role = 'knowledge_steward'
       and v_batch.department_id is not null
       and v_batch.department_id is distinct from v_assignee_department_id then
      raise exception 'batch assignee is outside the permitted batch scope';
    end if;

    if p_action = 'start_review'
       and v_batch.status = 'in_review'
       and (
         p_assigned_to is null
         or p_assigned_to is not distinct from v_batch.assigned_to
       ) then
      return jsonb_build_object(
        'batchId', v_batch.id,
        'status', v_batch.status,
        'assignedTo', v_batch.assigned_to,
        'releasedCandidateCount', 0,
        'replayed', true
      );
    end if;
    if p_action = 'assign'
       and p_assigned_to is not distinct from v_batch.assigned_to then
      return jsonb_build_object(
        'batchId', v_batch.id,
        'status', v_batch.status,
        'assignedTo', v_batch.assigned_to,
        'releasedCandidateCount', 0,
        'replayed', true
      );
    end if;

    if p_action = 'start_review' and v_batch.status <> 'open' then
      raise exception 'learning batch cannot start review from its current status';
    end if;

    update brain_learning_batches
    set status = case
          when p_action = 'start_review' then 'in_review'
          else status
        end,
        assigned_to = v_effective_assignee,
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_batch_id
    returning * into v_batch;
  end if;

  insert into brain_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_organization_id,
    p_actor_user_id,
    case p_action
      when 'assign' then 'learning.batch.assigned'
      when 'start_review' then 'learning.batch.review_started'
      else 'learning.batch.dismissed'
    end,
    'learning_batch',
    p_batch_id::text,
    jsonb_build_object(
      'assignedTo', v_batch.assigned_to,
      'releasedCandidateCount', v_released_count
    )
  );

  return jsonb_build_object(
    'batchId', v_batch.id,
    'status', v_batch.status,
    'assignedTo', v_batch.assigned_to,
    'releasedCandidateCount', v_released_count,
    'replayed', false
  );
end;
$$;

create or replace function brain_promote_learning_document_patch(
  p_organization_id text,
  p_candidate_id uuid,
  p_reviewer_user_id text,
  p_review_note text,
  p_replacements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_reviewer_role text;
  v_reviewer_department_id text;
  v_policy brain_learning_policies%rowtype;
  v_candidate brain_learning_candidates%rowtype;
  v_doc brain_docs%rowtype;
  v_proposal brain_knowledge_proposals%rowtype;
  v_operation jsonb;
  v_find text;
  v_replace text;
  v_occurrences integer;
  v_replacement_count integer;
  v_target_evidence_count integer;
  v_target_version_count integer;
  v_total_evidence_count integer;
  v_base_version integer;
  v_proposed_content text;
  v_evidence jsonb := '[]'::jsonb;
  v_change jsonb;
  v_request_hash text;
  v_review_note text := coalesce(p_review_note, '');
  v_total_replacement_chars integer := 0;
  v_patch_text text := '';
begin
  if jsonb_typeof(coalesce(p_replacements, 'null'::jsonb)) <> 'array' then
    raise exception 'document patch replacements must be an array';
  end if;
  if length(v_review_note) > 1000 then
    raise exception 'document patch review note is limited to 1000 characters';
  end if;
  v_replacement_count := jsonb_array_length(p_replacements);
  if v_replacement_count < 1 or v_replacement_count > 10 then
    raise exception 'document patches require between 1 and 10 replacements';
  end if;

  for v_operation in select value from jsonb_array_elements(p_replacements)
  loop
    if jsonb_typeof(v_operation) <> 'object'
       or jsonb_typeof(v_operation->'find') <> 'string'
       or jsonb_typeof(v_operation->'replace') <> 'string'
       or exists (
         select 1
         from jsonb_object_keys(v_operation) key
         where key not in ('find', 'replace')
       ) then
      raise exception 'each document patch operation must contain only string find and replace fields';
    end if;
    if v_operation->>'find' = '' then
      raise exception 'document patch find text cannot be empty';
    end if;
    if length(v_operation->>'find') > 8000
       or length(v_operation->>'replace') > 8000 then
      raise exception 'document patch find and replace values are limited to 8000 characters';
    end if;
    v_total_replacement_chars := v_total_replacement_chars
      + length(v_operation->>'find')
      + length(v_operation->>'replace');
    v_patch_text := v_patch_text
      || E'\n'
      || (v_operation->>'find')
      || E'\n'
      || (v_operation->>'replace');
  end loop;
  if v_total_replacement_chars > 32000 then
    raise exception 'document patch replacement payload exceeds 32000 characters';
  end if;
  if v_patch_text ~* '-----BEGIN[[:space:]]+(RSA[[:space:]]+|EC[[:space:]]+|OPENSSH[[:space:]]+)?PRIVATE[[:space:]]+KEY-----'
     or v_patch_text ~* '(^|[^[:alnum:]_])(sk|rk|pk)_(live|test)_[[:alnum:]]{16,}'
     or v_patch_text ~* '(^|[^[:alnum:]_-])sk-[[:alnum:]_-]{16,}'
     or v_patch_text ~* '(^|[^[:alnum:]_])gh[pousr]_[[:alnum:]]{20,}'
     or v_patch_text ~ '(^|[^[:alnum:]])AKIA[0-9A-Z]{16}([^[:alnum:]]|$)'
     or v_patch_text ~ '(^|[^[:alnum:]])AIza[0-9A-Za-z_-]{30,}'
     or v_patch_text ~* '(^|[^[:alnum:]_])xox[baprs]-[[:alnum:]-]{20,}'
     or v_patch_text ~* '(^|[^[:alnum:]_])Bearer[[:space:]]+[[:alnum:]._~+/=-]{20,}'
     or v_patch_text ~* '(api[ _-]?key|access[ _-]?token|client[ _-]?secret|password)[[:space:]]*[:=][[:space:]]*[^[:space:]]{12,}' then
    raise exception 'secret-like content cannot enter a document patch';
  end if;
  if v_patch_text ~* '(ignore|disregard|override|forget|bypass).{0,80}(instruction|prompt|policy|rule|message|above|previous|prior|system|developer)'
     or v_patch_text ~* '(system prompt|developer message|jailbreak|prompt injection)'
     or v_patch_text ~* '(call|invoke|execute|run).{0,40}(tool|command|instruction)'
     or v_patch_text ~* '(return|emit|output|produce|create).{0,40}(json|candidate|tool call)' then
    raise exception 'prompt-injection content cannot enter a document patch';
  end if;

  v_request_hash := encode(digest(
    concat_ws(
      E'\n',
      p_organization_id,
      p_candidate_id::text,
      p_replacements::text
    ),
    'sha256'
  ), 'hex');

  select role, department_id
  into v_reviewer_role, v_reviewer_department_id
  from brain_memberships
  where organization_id = p_organization_id
    and user_id = p_reviewer_user_id
    and active
    and role in ('org_admin', 'knowledge_steward')
  for share;
  if not found then
    raise exception 'knowledge steward access required';
  end if;

  select *
  into v_policy
  from brain_learning_policies
  where organization_id = p_organization_id
  for share;
  if not found then
    raise exception 'controlled-learning policy not found';
  end if;

  select *
  into v_candidate
  from brain_learning_candidates
  where organization_id = p_organization_id
    and id = p_candidate_id
  for update;
  if not found then
    raise exception 'learning candidate not found';
  end if;
  if v_candidate.candidate_type <> 'document_patch'
     or v_candidate.proposed_action <> 'update'
     or v_candidate.target_doc_id is null then
    raise exception 'candidate is not an exact document patch';
  end if;
  if v_reviewer_role = 'knowledge_steward'
     and v_candidate.department_id is not null
     and v_candidate.department_id is distinct from v_reviewer_department_id then
    raise exception 'knowledge stewards may promote only permitted department or organization-wide scope';
  end if;
  if v_candidate.risk = 'critical' and v_reviewer_role <> 'org_admin' then
    raise exception 'critical learning candidates require an organization admin';
  end if;

  select *
  into v_doc
  from brain_docs
  where organization_id = p_organization_id
    and id = v_candidate.target_doc_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'document patch target is no longer available';
  end if;
  if v_doc.department_id is distinct from v_candidate.department_id
     or v_doc.project_id is distinct from v_candidate.project_id then
    raise exception 'document patch target differs from the exact candidate scope';
  end if;

  if v_candidate.status = 'proposed'
     and v_candidate.proposal_kind = 'knowledge'
     and v_candidate.proposal_id is not null then
    select *
    into v_proposal
    from brain_knowledge_proposals
    where organization_id = p_organization_id
      and id = v_candidate.proposal_id
      and target_doc_id = v_doc.id
    for share;
    if not found then
      raise exception 'document patch candidate references a missing proposal';
    end if;
    if v_candidate.proposed_change->>'patchRequestHash' <> v_request_hash then
      raise exception 'document patch candidate was already promoted with different replacements';
    end if;
    return jsonb_build_object(
      'candidateId', v_candidate.id,
      'proposalId', v_proposal.id,
      'status', v_proposal.status,
      'targetDocId', v_doc.id,
      'targetPath', v_doc.path,
      'targetBaseVersion', (v_candidate.proposed_change->>'targetBaseVersion')::integer,
      'replacementCount', jsonb_array_length(v_candidate.proposed_change->'patchOperations'),
      'replayed', true
    );
  end if;

  if v_policy.mode not in ('review', 'auto_low_risk') then
    raise exception 'document patch promotion requires review or auto-low-risk mode';
  end if;
  if v_candidate.status not in ('detected', 'queued', 'batched') then
    raise exception 'document patch candidate cannot be promoted from its current status';
  end if;
  if v_candidate.risk in ('material', 'critical')
     and btrim(v_review_note) = '' then
    raise exception 'material and critical document patches require a review note';
  end if;

  select
    count(*)::integer,
    count(*) filter (where evidence.doc_id = v_doc.id)::integer,
    count(distinct evidence.source_version) filter (
      where evidence.doc_id = v_doc.id
    )::integer,
    min(evidence.source_version) filter (
      where evidence.doc_id = v_doc.id
    )
  into
    v_total_evidence_count,
    v_target_evidence_count,
    v_target_version_count,
    v_base_version
  from brain_learning_evidence evidence
  where evidence.organization_id = p_organization_id
    and evidence.candidate_id = p_candidate_id;

  if v_total_evidence_count = 0 then
    raise exception 'document patch promotion requires persisted evidence';
  end if;
  if v_total_evidence_count > 50 then
    raise exception 'document patch evidence exceeds the bounded promotion limit';
  end if;
  if v_target_evidence_count = 0 or v_target_version_count <> 1 then
    raise exception 'document patch requires one immutable target document version';
  end if;
  if v_doc.current_version <> v_base_version then
    raise exception 'document changed after the learning evidence was captured';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'learningEvidenceId', evidence.id,
        'sourceContextRunId', evidence.source_context_run_id,
        'contextEvidenceId', evidence.context_evidence_id,
        'docId', evidence.doc_id,
        'sourceVersion', evidence.source_version,
        'claimId', evidence.claim_id,
        'role', evidence.evidence_role,
        'authority', evidence.authority
      ))
      order by evidence.created_at, evidence.id
    ),
    '[]'::jsonb
  )
  into v_evidence
  from brain_learning_evidence evidence
  where evidence.organization_id = p_organization_id
    and evidence.candidate_id = p_candidate_id;

  v_proposed_content := v_doc.content;
  for v_operation in select value from jsonb_array_elements(p_replacements)
  loop
    v_find := v_operation->>'find';
    v_replace := v_operation->>'replace';
    v_occurrences := (
      length(v_proposed_content)
      - length(replace(v_proposed_content, v_find, ''))
    ) / length(v_find);
    if v_occurrences <> 1 then
      raise exception 'each document patch find value must occur exactly once in sequence';
    end if;
    v_proposed_content := replace(v_proposed_content, v_find, v_replace);
  end loop;
  if v_proposed_content = v_doc.content then
    raise exception 'document patch makes no change';
  end if;

  v_change := jsonb_build_object(
    'content', v_proposed_content,
    'targetBaseVersion', v_base_version,
    'patchOperations', p_replacements,
    'patchRequestHash', v_request_hash
  );

  insert into brain_knowledge_proposals (
    organization_id,
    operation,
    target_doc_id,
    target_path,
    proposed_change,
    evidence,
    rationale,
    status,
    proposed_by
  ) values (
    p_organization_id,
    'update',
    v_doc.id,
    v_doc.path,
    v_change,
    v_evidence,
    coalesce(nullif(v_candidate.summary, ''), v_candidate.title),
    'pending',
    p_reviewer_user_id
  )
  returning * into v_proposal;

  update brain_learning_candidates
  set status = 'proposed',
      proposed_change = v_change,
      proposal_kind = 'knowledge',
      proposal_id = v_proposal.id,
      reviewed_by = p_reviewer_user_id,
      review_note = v_review_note,
      reviewed_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_candidate_id;

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
    'learning.document_patch.promoted',
    'learning_candidate',
    p_candidate_id::text,
    jsonb_build_object(
      'proposalId', v_proposal.id,
      'targetDocId', v_doc.id,
      'targetPath', v_doc.path,
      'targetBaseVersion', v_base_version,
      'replacementCount', v_replacement_count,
      'requestHash', v_request_hash
    )
  );

  return jsonb_build_object(
    'candidateId', p_candidate_id,
    'proposalId', v_proposal.id,
    'status', v_proposal.status,
    'targetDocId', v_doc.id,
    'targetPath', v_doc.path,
    'targetBaseVersion', v_base_version,
    'replacementCount', v_replacement_count,
    'replayed', false
  );
end;
$$;

revoke all on table brain_learning_assessments
  from public, anon, authenticated, service_role;
grant select on table brain_learning_assessments to service_role;

revoke all on table brain_learning_latest_assessments
  from public, anon, authenticated, service_role;
grant select on table brain_learning_latest_assessments to service_role;

revoke all on table brain_learning_operations_metrics
  from public, anon, authenticated, service_role;
grant select on table brain_learning_operations_metrics to service_role;

revoke all on function brain_reject_learning_assessment_mutation()
  from public, anon, authenticated, service_role;
revoke all on function brain_assess_learning_candidate(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function brain_create_learning_batch(
  text,
  text,
  text,
  text,
  uuid[],
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function brain_transition_learning_batch(
  text,
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function brain_promote_learning_document_patch(
  text,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;

grant execute on function brain_assess_learning_candidate(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
) to service_role;
grant execute on function brain_create_learning_batch(
  text,
  text,
  text,
  text,
  uuid[],
  text,
  text
) to service_role;
grant execute on function brain_transition_learning_batch(
  text,
  uuid,
  text,
  text,
  text,
  text
) to service_role;
grant execute on function brain_promote_learning_document_patch(
  text,
  uuid,
  text,
  text,
  jsonb
) to service_role;

commit;
