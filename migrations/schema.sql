-- SolitudeScan: compatibility, authorization and RLS hardening migration.
-- This migration is idempotent and intentionally changes only objects that
-- are required by the current frontend and security model.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'cancelled')),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_user_idx
  on public.account_deletion_requests(user_id, requested_at desc);

alter table public.payment_requests
  add column if not exists confirmed_at timestamptz,
  add column if not exists rejected_at timestamptz;

-- Administrative authority is the profile flag only. Email is never an
-- authorization source.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_username text;
begin
  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
  v_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'));

  insert into public.profiles (id, username, display_name, email, is_admin, role)
  values (
    new.id,
    v_username || left(replace(gen_random_uuid()::text, '-', ''), 4),
    v_nome,
    new.email,
    false,
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Keep regular users from changing privilege or billing fields through the
-- profile update policy. Administrators can still manage these fields.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    if new.is_admin is distinct from old.is_admin
      or new.role is distinct from old.role
      or new.is_vip is distinct from old.is_vip
      or new.vip_plan is distinct from old.vip_plan
      or new.vip_expires_at is distinct from old.vip_expires_at then
      raise exception 'Only administrators can change privileged profile fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_protect_profile_privileged_fields on public.profiles;
create trigger trigger_protect_profile_privileged_fields
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

-- A user may only move their own payment request through the client-side
-- waiting/expired states. Approval, rejection and billing fields are admin
-- operations.
create or replace function public.protect_payment_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    if new.user_id is distinct from old.user_id
      or new.email is distinct from old.email
      or new.nome is distinct from old.nome
      or new.plano is distinct from old.plano
      or new.valor is distinct from old.valor
      or new.metodo is distinct from old.metodo
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'Only administrators can change payment ownership or review fields';
    end if;

    if new.status not in ('pendente', 'aguardando_confirmacao', 'expirado') then
      raise exception 'Only administrators can approve or reject payments';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_protect_payment_request_fields on public.payment_requests;
create trigger trigger_protect_payment_request_fields
before update on public.payment_requests
for each row execute function public.protect_payment_request_fields();

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_requests_insert on public.account_deletion_requests;
create policy account_deletion_requests_insert
on public.account_deletion_requests
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists account_deletion_requests_read on public.account_deletion_requests;
create policy account_deletion_requests_read
on public.account_deletion_requests
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists account_deletion_requests_admin on public.account_deletion_requests;
create policy account_deletion_requests_admin
on public.account_deletion_requests
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- A profile owner may edit profile presentation fields, but the trigger above
-- prevents privilege escalation. Admins retain full access.
drop policy if exists solitude_profiles_owner_write on public.profiles;
drop policy if exists solitude_profiles_owner_update on public.profiles;
create policy solitude_profiles_owner_update
on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Public chapter/page access requires the parent work to be published too.
drop policy if exists solitude_chapters_public_read on public.chapters;
create policy solitude_chapters_public_read
on public.chapters
for select to anon, authenticated
using (
  (
    is_published = true
    and exists (
      select 1 from public.works w
      where w.id = chapters.work_id
        and w.is_published = true
        and w.deleted_at is null
    )
  )
  or public.is_admin()
);

drop policy if exists solitude_pages_public_read on public.pages;
create policy solitude_pages_public_read
on public.pages
for select to anon, authenticated
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
    )
  )
  or public.is_admin()
);

-- Anonymous payment creation is allowed for checkout, but only as a pending
-- request belonging to the current user (or no user for guest checkout).
drop policy if exists solitude_payment_insert on public.payment_requests;
create policy solitude_payment_insert
on public.payment_requests
for insert to anon, authenticated
with check (
  status = 'pendente'
  and (user_id is null or user_id = auth.uid())
);

drop policy if exists solitude_payment_update on public.payment_requests;
create policy solitude_payment_update
on public.payment_requests
for update to authenticated
using (public.is_admin() or user_id = auth.uid() or lower(email) = lower(auth.jwt()->>'email'))
with check (
  public.is_admin()
  or (
    (user_id = auth.uid() or lower(email) = lower(auth.jwt()->>'email'))
    and status in ('pendente', 'aguardando_confirmacao', 'expirado')
  )
);