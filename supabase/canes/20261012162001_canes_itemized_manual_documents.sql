-- Parent and lines commit together so a partial write cannot create an empty bill.
create function create_canes_manual_job(p_job jsonb,p_items jsonb) returns uuid
language plpgsql security invoker set search_path=public as $$
declare job_uuid uuid;
begin
 if jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Add service lines.';end if;
 insert into jobs(lead_id,contact_id,status,customer_name,customer_phone,customer_email,job_name,job_address,total_cents,subtotal_cents,deposit_cents,scheduled_at,ends_at,duration_minutes,crew_id,assigned_to,creation_notification_crew_id,creation_notification_scheduled_at,notes,service_area,service_area_selected)
 values((p_job->>'lead_id')::uuid,(p_job->>'contact_id')::uuid,p_job->>'status',p_job->>'customer_name',p_job->>'customer_phone',p_job->>'customer_email',p_job->>'job_name',p_job->>'job_address',(p_job->>'total_cents')::int,(p_job->>'total_cents')::int,0,(p_job->>'scheduled_at')::timestamptz,(p_job->>'ends_at')::timestamptz,(p_job->>'duration_minutes')::int,(p_job->>'crew_id')::uuid,p_job->>'assigned_to',(p_job->>'creation_notification_crew_id')::uuid,(p_job->>'creation_notification_scheduled_at')::timestamptz,p_job->>'notes',p_job->>'service_area',coalesce((p_job->>'service_area_selected')::boolean,false)) returning id into job_uuid;
 insert into job_items(job_id,position,name,description,service_category,quantity,unit_price_cents,discount_mode,discount_value,discount_cents,line_total_cents,taxable)
 select job_uuid,r.position,r.name,r.description,r.service_category,r.quantity,r.unit_price_cents,r.discount_mode,r.discount_value,r.discount_cents,r.line_total_cents,r.taxable
 from jsonb_to_recordset(p_items) r(position int,name text,description text,service_category text,quantity numeric,unit_price_cents int,discount_mode text,discount_value int,discount_cents int,line_total_cents int,taxable boolean);
 return job_uuid;
end $$;
revoke all on function create_canes_manual_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function create_canes_manual_job(jsonb,jsonb) to service_role;

create function initialize_canes_itemized_invoice(p_document jsonb,p_items jsonb)
returns table(outcome text,invoice_id uuid,invoice_number text)
language plpgsql security invoker set search_path=public as $$
declare created record;replaced record;
begin
 select * into created from initialize_manual_invoice_locked((p_document->>'contact_id')::uuid,p_document->>'customer_name',p_document->>'customer_phone',p_document->>'customer_email',p_document->>'job_address',p_document->>'job_name',(p_document->>'total_cents')::int,p_document->>'message_to_customer',p_document->>'terms',p_document->>'public_token',p_document->'reward_offers');
 if created.outcome<>'ready' then return query select created.outcome,created.invoice_id,created.invoice_number;return;end if;
 select * into replaced from replace_invoice_items_locked(created.invoice_id,p_items,'draft',(p_document->>'total_cents')::int,0,null,null);
 if replaced.outcome<>'saved' then raise exception 'Invoice lines could not be saved.';end if;
 return query select 'ready',created.invoice_id,created.invoice_number;
end $$;
revoke all on function initialize_canes_itemized_invoice(jsonb,jsonb) from public,anon,authenticated;
grant execute on function initialize_canes_itemized_invoice(jsonb,jsonb) to service_role;
