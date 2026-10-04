alter table public.leads add column if not exists first_contacted_at timestamptz;

-- Pipeline edits and automatic replies are not evidence of human outreach.
update public.leads l set first_contacted_at = (
  select min(created_at) from (
    select peer_phone, created_at from public.messages
    where direction = 'out' and automated = false
      and delivery_status in ('queued', 'sending', 'sent', 'delivered', 'read')
    union all
    select peer_phone, created_at from public.calls where direction = 'out'
  ) activity where activity.peer_phone = l.phone and activity.created_at >= l.created_at
)
where l.first_contacted_at is null;

create or replace function public.record_manual_lead_contact(p_phone text)
returns void language sql security invoker set search_path = public
as $$
  update public.leads
  set first_contacted_at = coalesce(first_contacted_at, now()),
      status = case when status = 'new' then 'contacted' else status end,
      last_activity_at = now()
  where phone = p_phone;
$$;
revoke all on function public.record_manual_lead_contact(text) from public, anon, authenticated;
grant execute on function public.record_manual_lead_contact(text) to service_role;
