begin;

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'meta_intro', 'confirmation', 'manual_booking', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest', 'estimate_send', 'estimate_reminder',
  'job_confirmation', 'invoice_send', 'invoice_reminder', 'invoice_customer_email',
  'confirmation_final', 'payment_owner_receipt', 'payment_customer_receipt', 'deposit_owner_receipt'
));

create unique index if not exists tasks_meta_intro_opportunity_uidx
  on public.tasks (lead_id, (payload->>'opportunity_started_at')) where kind = 'meta_intro';

-- Activation is separate from deployment so no historical submissions are texted.
insert into public.settings (key, value) values
  ('meta_intro_enabled', 'false'::jsonb),
  ('meta_intro_enabled_since', 'null'::jsonb)
on conflict (key) do nothing;

insert into public.settings (key, value) values ('templates', '{}'::jsonb) on conflict (key) do nothing;
update public.settings set value = value || jsonb_build_object('meta_intro',
  'Hey{name}, it''s Sebastian from Canes Pressure Washing! Just saw your {request}. When''s a good time to call? Also, you can reply STOP anytime to opt out.'), updated_at = now()
where key = 'templates' and not (value ? 'meta_intro');

-- Replace the stock opt-out sentence while retaining each saved template's wording.
update public.settings set value = (
  select jsonb_object_agg(k, replace(replace(v,
    'Reply STOP to opt out.', 'Also, you can reply STOP anytime to opt out.'),
    'Reply HELP for help or STOP to opt out.', 'Reply HELP for help. You can reply STOP anytime to opt out.'))
  from jsonb_each_text(value) as template(k, v)
), updated_at = now() where key = 'templates' and jsonb_typeof(value) = 'object';
update public.settings set value = to_jsonb(replace(value #>> '{}',
  'Reply STOP to opt out.', 'Also, you can reply STOP anytime to opt out.')), updated_at = now()
where key in ('job_confirmation_template', 'confirmation_final_template') and jsonb_typeof(value) = 'string';

create or replace function public.queue_meta_intro(
  p_lead_id uuid,
  p_leadgen_id text,
  p_submitted_at timestamptz default null
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_received_at timestamptz;
  v_submitted_at timestamptz;
  v_enabled_since timestamptz;
  v_task_id uuid;
begin
  if not exists (select 1 from settings where key = 'automations_enabled' and value = 'true'::jsonb)
    or not exists (select 1 from settings where key = 'meta_intro_enabled' and value = 'true'::jsonb)
  then return null; end if;
  select (value #>> '{}')::timestamptz into v_enabled_since from settings where key = 'meta_intro_enabled_since';
  if v_enabled_since is null or not isfinite(v_enabled_since) then return null; end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if not found or v_lead.meta_leadgen_id is distinct from p_leadgen_id
    or v_lead.source <> 'meta_ads' or v_lead.type <> 'cold' or v_lead.status <> 'new'
    or v_lead.phone is null or v_lead.opted_out or v_lead.first_contacted_at is not null
    or v_lead.created_at < v_enabled_since then return null; end if;
  select created_at into v_received_at from meta_leadgen_receipts where leadgen_id = p_leadgen_id;
  if v_received_at is null or v_received_at < v_enabled_since then return null; end if;
  v_submitted_at := case when p_submitted_at is not null and isfinite(p_submitted_at)
    then least(p_submitted_at, v_received_at) else v_received_at end;
  if v_submitted_at < v_enabled_since then return null; end if;

  insert into tasks (lead_id, kind, dedupe_key, scheduled_for, payload)
  values (v_lead.id, 'meta_intro', 'meta_intro:' || p_leadgen_id, v_submitted_at + interval '5 minutes',
    jsonb_build_object('meta_leadgen_id', p_leadgen_id, 'submitted_at', v_submitted_at,
      'phone', v_lead.phone, 'service', v_lead.service,
      'opportunity_started_at', coalesce(v_lead.opportunity_started_at, v_lead.created_at)))
  on conflict do nothing;
  select id into v_task_id from tasks where dedupe_key = 'meta_intro:' || p_leadgen_id;
  return v_task_id;
end;
$$;
revoke all on function public.queue_meta_intro(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.queue_meta_intro(uuid, text, timestamptz) to service_role;

create or replace function public.meta_intro_is_eligible(p_task_id uuid)
returns boolean language sql security invoker set search_path = public
as $$
  select exists (
    select 1 from tasks t join leads l on l.id = t.lead_id
    join settings s on s.key = 'meta_intro_enabled_since'
    where t.id = p_task_id and t.kind = 'meta_intro' and t.status in ('pending', 'sending')
      and exists (select 1 from settings where key = 'automations_enabled' and value = 'true'::jsonb)
      and exists (select 1 from settings where key = 'meta_intro_enabled' and value = 'true'::jsonb)
      and (t.payload->>'submitted_at')::timestamptz >= (s.value #>> '{}')::timestamptz
      and l.source = 'meta_ads' and l.type = 'cold' and l.status = 'new' and not l.opted_out
      and l.first_contacted_at is null
      and l.meta_leadgen_id = t.payload->>'meta_leadgen_id'
      and l.phone = t.payload->>'phone'
      and coalesce(l.opportunity_started_at, l.created_at) = (t.payload->>'opportunity_started_at')::timestamptz
      and not exists (
        select 1 from messages m where m.peer_phone = l.phone and m.created_at >= l.created_at
          and (m.direction = 'in' or m.delivery_status is null or m.delivery_status not in ('failed', 'undelivered'))
      )
      and not exists (select 1 from calls c where c.peer_phone = l.phone and c.created_at >= l.created_at)
  );
$$;
revoke all on function public.meta_intro_is_eligible(uuid) from public, anon, authenticated;
grant execute on function public.meta_intro_is_eligible(uuid) to service_role;

create or replace function public.claim_lead_message_task(p_task_id uuid)
returns setof public.tasks
language sql security invoker set search_path = public
as $$
  update tasks set status = 'sending', scheduled_for = clock_timestamp()
  where id = p_task_id and status = 'pending' and scheduled_for <= clock_timestamp()
    and kind in ('hold_text', 'meta_intro', 'confirmation', 'manual_booking')
  returning *;
$$;
revoke all on function public.claim_lead_message_task(uuid) from public, anon, authenticated;
grant execute on function public.claim_lead_message_task(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
