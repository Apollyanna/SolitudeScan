-- ============================================================================
-- SolitudeScan - endurecimento de seguranca (pagamentos, VIP e perfis)
-- Idempotente: pode rodar mais de uma vez sem quebrar nada.
-- Rode no SQL Editor do Supabase DEPOIS das migracoes anteriores.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Colunas usadas pelo fluxo de Pix (garante compatibilidade)
-- ---------------------------------------------------------------------------
alter table public.payment_requests
  add column if not exists expires_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists reviewed_by uuid;

alter table public.payment_requests enable row level security;

-- ---------------------------------------------------------------------------
-- 1) Preco oficial do plano vive no banco, nunca no navegador.
--    (Antes o proprio cliente enviava "valor" na cobranca Pix.)
-- ---------------------------------------------------------------------------
create table if not exists public.plan_prices (
  plan text primary key,
  amount_cents integer not null check (amount_cents > 0),
  duration_days integer not null check (duration_days > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.plan_prices enable row level security;

drop policy if exists plan_prices_public_read on public.plan_prices;
create policy plan_prices_public_read
  on public.plan_prices
  for select to anon, authenticated
  using (active = true);

revoke insert, update, delete, truncate on public.plan_prices from anon, authenticated;

insert into public.plan_prices (plan, amount_cents, duration_days) values
  ('VIP Mensal',     1490,  30),
  ('VIP Trimestral', 3990,  90),
  ('VIP Anual',     14990, 365)
on conflict (plan) do update
  set amount_cents  = excluded.amount_cents,
      duration_days = excluded.duration_days,
      active        = true,
      updated_at    = now();

create or replace function public.plan_price(p_plan text)
returns numeric
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select round(amount_cents / 100.0, 2)
  from public.plan_prices
  where plan = p_plan
    and active = true;
$$;

-- ---------------------------------------------------------------------------
-- 2) Criacao de cobranca Pix: valor, status, dono e e-mail definidos aqui.
--    O navegador nao consegue mais escolher preco, se autoconceder VIP,
--    nem gerar cobranca em nome de outra pessoa.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_payment_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_preco numeric;
  v_email text;
  v_recentes integer;
begin
  select round(amount_cents / 100.0, 2)
    into v_preco
  from public.plan_prices
  where plan = new.plano
    and active = true;

  if v_preco is null then
    raise exception 'Plano invalido' using errcode = '22023';
  end if;

  new.status      := 'pendente';
  new.valor       := v_preco;
  new.metodo      := 'pix';
  new.approved_at := null;
  new.rejected_at := null;
  new.confirmed_at := null;
  new.reviewed_by := null;

  if auth.uid() is not null then
    new.user_id := auth.uid();
    select u.email into v_email from auth.users u where u.id = auth.uid();
    if v_email is not null then
      new.email := v_email;
    end if;
  else
    new.user_id := null;
    new.email := lower(trim(coalesce(new.email, '')));
  end if;

  if new.email is null
     or new.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'E-mail invalido' using errcode = '22023';
  end if;

  new.expires_at := least(
    coalesce(new.expires_at, now() + interval '5 minutes'),
    now() + interval '15 minutes'
  );

  -- Limite simples contra spam de cobrancas (3 por 10 minutos).
  select count(*) into v_recentes
  from public.payment_requests pr
  where pr.created_at > now() - interval '10 minutes'
    and (
      (new.user_id is not null and pr.user_id = new.user_id)
      or lower(pr.email) = lower(new.email)
    );

  if v_recentes >= 3 then
    raise exception 'Muitas solicitacoes em pouco tempo. Aguarde alguns minutos.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_enforce_payment_request_insert on public.payment_requests;
create trigger trigger_enforce_payment_request_insert
before insert on public.payment_requests
for each row execute function public.enforce_payment_request_insert();

revoke execute on function public.enforce_payment_request_insert() from anon, authenticated;
revoke execute on function public.plan_price(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Aprovacao/rejeicao continua sendo operacao exclusiva de admin
--    (reforca o trigger existente; nao substitui o das migracoes antigas).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4) VIP aplicado na leitura (idempotente).
--    Corrige a regressao em que migrations/schema.sql recriava as policies
--    de capitulos/paginas SEM a checagem de VIP, liberando conteudo pago.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) Perfil: usuario comum nao altera privilegio nem cobranca
--    (reforca a funcao para o caso de a migracao antiga nao ter rodado).
-- ---------------------------------------------------------------------------
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

-- search_path deterministico na criacao de perfil
alter function public.handle_new_user() set search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 6) Indices para o painel e para a checagem de e-mail
-- ---------------------------------------------------------------------------
create index if not exists payment_requests_status_idx
  on public.payment_requests (status, created_at desc);
create index if not exists payment_requests_email_idx
  on public.payment_requests (lower(email));

commit;
