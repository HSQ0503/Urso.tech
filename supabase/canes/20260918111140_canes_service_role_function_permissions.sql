begin;

-- Supabase grants client roles EXECUTE explicitly by default; revoking only
-- PUBLIC does not remove those grants. These RPCs are server-only operations.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
