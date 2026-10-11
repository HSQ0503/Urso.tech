begin;

do $$
declare target text;
begin
  foreach target in array array['addresses','estimates','jobs','invoices','recurring_plans'] loop
    execute format('alter table public.%I add column if not exists service_area text check (service_area in (''north'',''central'',''south''))', target);
    if target <> 'addresses' then
      execute format('alter table public.%I add column if not exists service_area_selected boolean not null default false', target);
    end if;
  end loop;
end;
$$;

-- Copy operational metadata at creation; later edits never move another document.
create or replace function public.inherit_canes_service_area()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare parent_area text;
begin
  if new.service_area_selected or new.service_area is not null then return new; end if;
  if tg_table_name = 'jobs' then
    select service_area into parent_area from recurring_plans where id = new.plan_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
    select service_area into parent_area from estimates where id = new.estimate_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
  elsif tg_table_name = 'invoices' then
    select service_area into parent_area from jobs where id = new.job_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
    select service_area into parent_area from estimates where id = new.estimate_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
  elsif tg_table_name = 'recurring_plans' then
    select service_area into parent_area from jobs where id = new.source_job_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
    select service_area into parent_area from invoices where id = new.source_invoice_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
    select service_area into parent_area from estimates where id = new.source_estimate_id;
    if found then new.service_area := parent_area; new.service_area_selected := true; return new; end if;
  end if;
  if parent_area is null and new.contact_id is not null and new.job_address is not null then
    select service_area into parent_area from addresses
      where contact_id = new.contact_id and lower(trim(line)) = lower(trim(new.job_address))
      order by is_primary desc, created_at desc limit 1;
  end if;
  new.service_area := parent_area;
  return new;
end;
$$;
revoke all on function public.inherit_canes_service_area() from public, anon, authenticated;
grant execute on function public.inherit_canes_service_area() to service_role;

do $$
declare target text;
begin
  foreach target in array array['estimates','jobs','invoices','recurring_plans'] loop
    execute format('drop trigger if exists inherit_service_area on public.%I', target);
    execute format('create trigger inherit_service_area before insert on public.%I for each row execute function public.inherit_canes_service_area()', target);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
