begin;

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in (
  'hold_text', 'confirmation', 'manual_booking', 'no_reply_escalation',
  'cold_escalation', 'follow_up', 'digest', 'estimate_send', 'estimate_reminder',
  'job_confirmation', 'invoice_send', 'invoice_reminder', 'invoice_customer_email',
  'confirmation_final', 'payment_owner_receipt', 'payment_customer_receipt', 'deposit_owner_receipt'
));

-- The appointment, cancellation of old reminders, and outgoing notice commit
-- together. Repeating the same save does not create another text.
create or replace function public.book_lead_appointment_locked(
  p_lead_id uuid,
  p_appointment_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_confirmed_at timestamptz;
  v_key text;
  v_task_id uuid;
  v_changed boolean;
begin
  if p_appointment_at is null or not isfinite(p_appointment_at) then
    raise exception 'Invalid appointment time';
  end if;
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;

  v_changed := v_lead.appointment_at is distinct from p_appointment_at
    or v_lead.status <> 'confirmed' or v_lead.confirmed_at is null;
  -- This timestamp is also the message revision. Keep it distinct when two
  -- reschedules land in the same clock tick, including a move back to a slot.
  v_confirmed_at := case when v_changed then greatest(
    clock_timestamp(), coalesce(v_lead.confirmed_at, '-infinity'::timestamptz) + interval '1 millisecond'
  ) else v_lead.confirmed_at end;
  v_key := 'manual_booking:' || p_lead_id || ':' || extract(epoch from v_confirmed_at);

  update leads set appointment_at = p_appointment_at, status = 'confirmed',
    confirmed_at = v_confirmed_at, last_activity_at = now()
  where id = p_lead_id;

  update tasks set status = 'canceled'
  where lead_id = p_lead_id and status in ('pending', 'sending')
    and kind in ('hold_text', 'confirmation', 'confirmation_final', 'no_reply_escalation', 'manual_booking')
    and dedupe_key <> v_key;

  if v_changed then
    insert into events (lead_id, kind, detail, data) values (
      p_lead_id, 'appointment',
      'Estimate visit confirmed by owner for ' || to_char(p_appointment_at at time zone 'America/New_York', 'Mon DD, YYYY HH12:MI AM') || ' ET',
      jsonb_build_object('appointment_at', p_appointment_at, 'confirmed_by', 'owner')
    );
  end if;

  if v_lead.phone is null or v_lead.opted_out or p_appointment_at <= now() then
    return jsonb_build_object('outcome', 'booked', 'task_id', null,
      'sms', case when v_lead.phone is null then 'no_phone' when v_lead.opted_out then 'opted_out' else 'past' end);
  end if;

  insert into tasks (lead_id, kind, dedupe_key, scheduled_for, payload)
  values (p_lead_id, 'manual_booking', v_key, now(),
    jsonb_build_object('appointment_at', p_appointment_at, 'confirmed_at', v_confirmed_at))
  on conflict (dedupe_key) do nothing;
  select id into v_task_id from tasks where dedupe_key = v_key;
  return jsonb_build_object('outcome', 'booked', 'task_id', v_task_id, 'sms', 'queued');
end;
$$;

revoke all on function public.book_lead_appointment_locked(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.book_lead_appointment_locked(uuid, timestamptz) to service_role;

-- Use the database clock for due checks: freshly committed notices may have
-- sub-millisecond timestamps ahead of a JS client's rounded clock.
create or replace function public.claim_lead_message_task(p_task_id uuid)
returns setof public.tasks
language sql
security invoker
set search_path = public
as $$
  update tasks set status = 'sending', scheduled_for = clock_timestamp()
  where id = p_task_id and status = 'pending' and scheduled_for <= clock_timestamp()
    and kind in ('hold_text', 'confirmation', 'manual_booking')
  returning *;
$$;
revoke all on function public.claim_lead_message_task(uuid) from public, anon, authenticated;
grant execute on function public.claim_lead_message_task(uuid) to service_role;

-- Additive defaults preserve other saved templates and any custom wording.
insert into public.settings (key, value) values ('templates', '{}'::jsonb) on conflict (key) do nothing;
update public.settings
set value = value || jsonb_build_object('manual_booking',
  'Hi{name}, Canes Pressure Washing will see you {when}. If anything changes, reply here. Reply STOP to opt out.'), updated_at = now()
where key = 'templates' and not (value ? 'manual_booking');
update public.settings
set value = jsonb_set(value, '{hold_text}', to_jsonb(
  'Hi{name}, it''s Sebastian with Canes Pressure Washing. I got your virtual quote request for our exterior services. What were you looking to get done? Reply STOP to opt out.'::text)), updated_at = now()
where key = 'templates' and (
  not (value ? 'hold_text') or value->>'hold_text' in (
    'Hi{name}! This is Canes Pressure Washing. We got your request and Sebastian will call you in just a few minutes. Reply STOP to opt out.',
    'Hi{name}! This is Canes Pressure Washing. You are now opted in to text updates about your request - we got it, and Sebastian will call you in just a few minutes. Msg & data rates may apply, msg frequency varies. Reply HELP for help or STOP to opt out.'
  )
);

notify pgrst, 'reload schema';
commit;
