-- Production compatibility and access hardening for SolitudeScan.
-- Safe to re-run: all policy and bucket changes are idempotent.

begin;

-- Views should respect the caller's RLS policies instead of the view owner.
alter view if exists public.works_with_ratings
  set (security_invoker = true);

-- Apply a deterministic search_path to every application function in public.
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
      'alter function %s set search_path = public, pg_catalog',
      fn.signature
    );
  end loop;
end
$$;

-- These routines are internal jobs/triggers and must not be callable by
-- browser roles. Their trigger/job callers continue to work as owners.
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
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
      and (
        p.proname in (
          'enviar_email',
          'verificar_vips_expirando',
          'publicar_capitulos_agendados',
          'rls_auto_enable',
          'handle_new_user',
          'handle_new_user_solitude',
          'recalc_work_rating'
        )
        or p.proname like 'protect_%'
        or p.proname like 'trigger_%'
      )
  loop
    execute format(
      'revoke execute on function %s from anon, authenticated',
      fn.signature
    );
  end loop;
end
$$;

-- VIP access is enforced at the database boundary, not by localStorage.
drop policy if exists solitude_chapters_public_read on public.chapters;
create policy solitude_chapters_public_read
  on public.chapters
  for select
  to anon, authenticated
  using (
    (
      is_published = true
      and exists (
        select 1
        from public.works w
        where w.id = chapters.work_id
          and w.is_published = true
          and w.deleted_at is null
      )
      and (
        coalesce(is_vip, false) = false
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.is_vip = true
            and (p.vip_expires_at is null or p.vip_expires_at > now())
        )
      )
    )
    or public.is_admin()
  );

drop policy if exists solitude_pages_public_read on public.pages;
create policy solitude_pages_public_read
  on public.pages
  for select
  to anon, authenticated
  using (
    (
      exists (
        select 1
        from public.chapters c
        join public.works w on w.id = c.work_id
        where c.id = pages.chapter_id
          and c.is_published = true
          and w.is_published = true
          and w.deleted_at is null
          and (
            coalesce(c.is_vip, false) = false
            or exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and p.is_vip = true
                and (p.vip_expires_at is null or p.vip_expires_at > now())
            )
          )
      )
    )
    or public.is_admin()
  );

-- Chapter files must be signed. Existing image_url values can be either a
-- public URL or a path; the frontend normalizes both before signing.
update storage.buckets
set public = false
where id in ('chapters', 'pages', 'backups', 'icons', 'logos', 'thumbnails');

drop policy if exists solitude_storage_public_read on storage.objects;
drop policy if exists solitude_storage_public_media_read on storage.objects;
create policy solitude_storage_public_media_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id in ('covers', 'banners', 'avatars'));

drop policy if exists solitude_storage_chapters_read on storage.objects;
create policy solitude_storage_chapters_read
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'chapters'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.pages pg
        join public.chapters c on c.id = pg.chapter_id
        join public.works w on w.id = c.work_id
        where split_part(storage.objects.name, '/', 2) = c.id::text
          and c.is_published = true
          and w.is_published = true
          and w.deleted_at is null
          and coalesce(c.is_vip, false) = false
      )
      or exists (
        select 1
        from public.pages pg
        join public.chapters c on c.id = pg.chapter_id
        join public.works w on w.id = c.work_id
        join public.profiles p on p.id = auth.uid()
        where split_part(storage.objects.name, '/', 2) = c.id::text
          and c.is_published = true
          and w.is_published = true
          and w.deleted_at is null
          and c.is_vip = true
          and p.is_vip = true
          and (p.vip_expires_at is null or p.vip_expires_at > now())
      )
    )
  );

commit;