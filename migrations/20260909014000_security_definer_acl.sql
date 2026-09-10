-- Reduce the exposed RPC surface while preserving the routines used by the
-- current application and by RLS policies.

begin;

-- Read-only RPCs do not need owner privileges; caller RLS should apply.
alter function public.search_works(text, integer)
  security invoker;
alter function public.get_related_works(uuid, integer)
  security invoker;
alter function public.get_homepage_sections()
  security invoker;
alter function public.get_continue_reading(uuid)
  security invoker;

-- Remove the default PUBLIC EXECUTE grant from every application
-- SECURITY DEFINER function. Owners and service_role retain ownership.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn.signature
    );
  end loop;
end
$$;

-- Intentional API surface:
-- * is_admin() is required by RLS policies.
-- * the next three routines require a signed-in caller.
-- * view counters are intentionally callable anonymously.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.criar_denuncia(text, uuid, text, text)
  to authenticated;
grant execute on function public.excluir_propria_conta()
  to authenticated;
grant execute on function public.toggle_like(text, uuid)
  to authenticated;
grant execute on function public.increment_work_views(uuid)
  to anon, authenticated;
grant execute on function public.increment_chapter_views(uuid)
  to anon, authenticated;

-- Public read helpers remain available, but now execute under caller RLS.
grant execute on function public.search_works(text, integer)
  to anon, authenticated;
grant execute on function public.get_related_works(uuid, integer)
  to anon, authenticated;
grant execute on function public.get_homepage_sections()
  to anon, authenticated;
grant execute on function public.get_continue_reading(uuid)
  to authenticated;

commit;