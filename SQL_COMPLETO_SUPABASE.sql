-- ============================================================================
-- SolitudeScan — SCRIPT ÚNICO DE BANCO DE DADOS (Supabase)
--
-- COMO USAR: Supabase -> SQL Editor -> New query -> cole TUDO -> RUN.
--
-- * Pode rodar quantas vezes quiser: tudo é idempotente (não duplica nada).
-- * Não apaga obras, capítulos, usuários, comentários nem pagamentos.
-- * Só cria o que falta e reforça as regras de segurança.
-- * Cobre RLS, permissões, preços oficiais, VIP, uploads e auditoria.
--
-- Ordem: 1 funções -> 2 tabelas/colunas -> 3 preços -> 4 triggers
--        -> 5 RLS/políticas -> 6 privilégios -> 7 storage -> 8 admin
--        -> 9 verificação -> 10 limpeza
-- ============================================================================


-- ============================================================================
-- 1) FUNÇÃO BASE DE ADMINISTRADOR
--    Fonte única de verdade: profiles.is_admin. E-mail NUNCA dá admin.
-- ============================================================================
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


-- ============================================================================
-- 2) TABELAS E COLUNAS QUE FALTAM
-- ============================================================================

-- 2.1 Solicitações de exclusão de conta (direito do titular / LGPD)
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

-- 2.2 Colunas do fluxo Pix usadas pelo site
alter table public.payment_requests
  add column if not exists expires_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists reviewed_by uuid;

alter table public.payment_requests enable row level security;

-- 2.3 Auditoria de eventos de segurança (logs restritos a admins)
create table if not exists public.security_events (
  id bigserial primary key,
  user_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx
  on public.security_events (created_at desc);

alter table public.security_events enable row level security;

-- 2.4 Índices de apoio ao painel administrativo
create index if not exists payment_requests_status_idx
  on public.payment_requests (status, created_at desc);
create index if not exists payment_requests_email_idx
  on public.payment_requests (lower(email));


-- ============================================================================
-- 3) PREÇOS OFICIAIS DOS PLANOS
--    O preço vive no banco. O navegador não escolhe mais quanto pagar.
-- ============================================================================
create table if not exists public.plan_prices (
  plan text primary key,
  amount_cents integer not null check (amount_cents > 0),
  duration_days integer not null check (duration_days > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.plan_prices enable row level security;

insert into public.plan_prices (plan, amount_cents, duration_days, active) values
  ('VIP Mensal',      1490,  30, true),
  ('VIP Trimestral',  3990,  90, true),
  ('VIP Anual',      14990, 365, true)
on conflict (plan) do update
  set amount_cents  = excluded.amount_cents,
      duration_days = excluded.duration_days,
      active        = true,
      updated_at    = now();


-- ============================================================================
-- 4) FUNÇÕES E TRIGGERS DE PROTEÇÃO
-- ============================================================================

-- 4.1 Preço oficial consultável pelo banco
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

-- 4.2 Criação de cobrança Pix: valor, dono, status e e-mail definidos aqui.
--     Bloqueia autoconcessão de VIP, preço adulterado e cobrança em nome
--     de terceiros. Limita 3 solicitações por 10 minutos (anti-spam).
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

  new.status       := 'pendente';
  new.valor        := v_preco;
  new.metodo       := 'pix';
  new.approved_at  := null;
  new.confirmed_at := null;
  new.rejected_at  := null;
  new.reviewed_by  := null;

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

-- 4.3 Somente a equipe aprova/rejeita. O usuário só pode expirar a própria
--     cobrança. ATENÇÃO: as colunas reais são valor/plano/metodo/nome.
create or replace function public.protect_payment_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.email is distinct from old.email
     or new.nome is distinct from old.nome
     or new.plano is distinct from old.plano
     or new.valor is distinct from old.valor
     or new.metodo is distinct from old.metodo
     or new.approved_at is distinct from old.approved_at
     or new.confirmed_at is distinct from old.confirmed_at
     or new.rejected_at is distinct from old.rejected_at
     or new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'campo_protegido: dados do pagamento nao podem ser alterados'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and new.status not in ('pendente', 'aguardando_confirmacao', 'expirado') then
    raise exception 'transicao_invalida: somente a equipe aprova ou rejeita pagamentos'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 4.4 Perfil: usuário comum não se promove a admin, não se dá VIP
--     e não troca o e-mail do cadastro.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.role is distinct from old.role
     or new.is_vip is distinct from old.is_vip
     or new.vip_plan is distinct from old.vip_plan
     or new.vip_expires_at is distinct from old.vip_expires_at
     or new.email is distinct from old.email then
    raise exception 'campo_protegido: alteracao nao permitida'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 4.5 Comentários: validação de conteúdo + limite de 8 por 5 minutos
create or replace function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_recentes integer;
begin
  new.content := btrim(coalesce(new.content, ''));

  if length(new.content) < 1 then
    raise exception 'conteudo_vazio: o comentario nao pode ficar em branco'
      using errcode = '22023';
  end if;

  if length(new.content) > 2000 then
    raise exception 'conteudo_longo: o comentario excede 2000 caracteres'
      using errcode = '22023';
  end if;

  select count(*) into v_recentes
  from public.comments
  where user_id = new.user_id
    and created_at > now() - interval '5 minutes';

  if v_recentes >= 8 then
    raise exception 'rate_limit: aguarde alguns minutos antes de comentar novamente'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- 4.6 Registro de evento de segurança (usado pelo app)
create or replace function public.log_security_event(
  p_event text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.security_events (user_id, event, detail)
  values (
    auth.uid(),
    left(coalesce(p_event, 'evento'), 80),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

-- 4.7 Criação automática do perfil no cadastro.
--     Monta o INSERT conforme as colunas que existem no seu banco,
--     para nunca quebrar o cadastro por causa de coluna ausente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_nome text;
  v_username text;
  v_cols text := '';
  v_vals text := '';
begin
  v_nome := coalesce(
    new.raw_user_meta_data->>'nome',
    split_part(new.email, '@', 1)
  );

  v_username := lower(regexp_replace(
    split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'
  )) || left(replace(gen_random_uuid()::text, '-', ''), 4);

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'role'
  ) then
    v_cols := v_cols || ', role';
    v_vals := v_vals || ', ''user''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'is_admin'
  ) then
    v_cols := v_cols || ', is_admin';
    v_vals := v_vals || ', false';
  end if;

  execute format(
    'insert into public.profiles (id, username, display_name, email%s)
     values ($1, $2, $3, $4%s)
     on conflict (id) do nothing',
    v_cols, v_vals
  ) using new.id, v_username, v_nome, new.email;

  return new;
end;
$$;

-- 4.8 Instalação dos triggers (com verificação de existência das tabelas)
do $$
begin
  if to_regclass('public.payment_requests') is not null then
    execute 'drop trigger if exists trigger_enforce_payment_request_insert on public.payment_requests';
    execute 'create trigger trigger_enforce_payment_request_insert
             before insert on public.payment_requests
             for each row execute function public.enforce_payment_request_insert()';

    execute 'drop trigger if exists trigger_protect_payment_request_fields on public.payment_requests';
    execute 'create trigger trigger_protect_payment_request_fields
             before update on public.payment_requests
             for each row execute function public.protect_payment_request_fields()';

    -- Remove o trigger antigo que usava colunas inexistentes
    -- (amount/plan/pix_key) e quebrava qualquer atualização de pagamento.
    execute 'drop trigger if exists trg_protect_payment_request_fields on public.payment_requests';
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'drop trigger if exists trigger_protect_profile_privileged_fields on public.profiles';
    execute 'create trigger trigger_protect_profile_privileged_fields
             before update on public.profiles
             for each row execute function public.protect_profile_privileged_fields()';

    -- Trigger duplicado de versão anterior: a regra já está acima.
    execute 'drop trigger if exists trg_protect_profile_fields on public.profiles';
  end if;

  if to_regclass('public.comments') is not null then
    execute 'drop trigger if exists trg_comments_rate_limit on public.comments';
    execute 'create trigger trg_comments_rate_limit
             before insert on public.comments
             for each row execute function public.enforce_comment_rate_limit()';
  end if;
end
$$;

-- 4.9 Perfil criado automaticamente quando alguém se cadastra
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 5) RLS E POLÍTICAS
--    Helpers que só criam a política se a tabela existir, para o script
--    nunca falhar por causa de uma tabela opcional ausente.
-- ============================================================================
create or replace function public.ss_rls(p_tabela text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if to_regclass('public.' || p_tabela) is not null then
    execute format('alter table public.%I enable row level security', p_tabela);
  end if;
end;
$$;

create or replace function public.ss_policy(
  p_tabela text,
  p_nome text,
  p_definicao text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if to_regclass('public.' || p_tabela) is null then
    raise notice 'ignorado: tabela % ausente (politica %)', p_tabela, p_nome;
    return;
  end if;
  execute format('drop policy if exists %I on public.%I', p_nome, p_tabela);
  execute format('create policy %I on public.%I %s', p_nome, p_tabela, p_definicao);
end;
$$;

-- 5.1 Liga RLS em todas as tabelas de dados
select public.ss_rls(t) from unnest(array[
  'works', 'genres', 'work_genres', 'chapters', 'pages', 'profiles',
  'favorites', 'ratings', 'comments', 'likes', 'reports', 'notifications',
  'user_lists', 'user_list_items', 'payment_requests',
  'account_deletion_requests', 'security_events', 'plan_prices'
]) as t;

-- 5.2 Catálogo
select public.ss_policy('works', 'works_public_read',
  'for select to anon, authenticated using ((is_published and deleted_at is null) or public.is_admin())');
select public.ss_policy('works', 'works_admin_write',
  'for all to authenticated using (public.is_admin()) with check (public.is_admin())');

select public.ss_policy('genres', 'genres_public_read',
  'for select to anon, authenticated using (true)');
select public.ss_policy('genres', 'genres_admin_write',
  'for all to authenticated using (public.is_admin()) with check (public.is_admin())');

select public.ss_policy('work_genres', 'work_genres_public_read',
  'for select to anon, authenticated using (true)');
select public.ss_policy('work_genres', 'work_genres_admin_write',
  'for all to authenticated using (public.is_admin()) with check (public.is_admin())');

-- 5.3 Capítulos: só obra publicada; capítulo VIP exige VIP ativo.
--     A checagem é no banco — localStorage nunca libera conteúdo pago.
select public.ss_policy('chapters', 'solitude_chapters_public_read',
  'for select to anon, authenticated using (
     (is_published = true
      and exists (select 1 from public.works w
                  where w.id = chapters.work_id
                    and w.is_published = true
                    and w.deleted_at is null)
      and (coalesce(is_vip, false) = false
           or exists (select 1 from public.profiles p
                      where p.id = auth.uid()
                        and p.is_vip = true
                        and (p.vip_expires_at is null or p.vip_expires_at > now()))))
     or public.is_admin())');
select public.ss_policy('chapters', 'chapters_admin_write',
  'for all to authenticated using (public.is_admin()) with check (public.is_admin())');

-- 5.4 Páginas: mesma regra do capítulo (inclusive VIP)
select public.ss_policy('pages', 'solitude_pages_public_read',
  'for select to anon, authenticated using (
     (exists (select 1 from public.chapters c
              join public.works w on w.id = c.work_id
              where c.id = pages.chapter_id
                and c.is_published = true
                and w.is_published = true
                and w.deleted_at is null
                and (coalesce(c.is_vip, false) = false
                     or exists (select 1 from public.profiles p
                                where p.id = auth.uid()
                                  and p.is_vip = true
                                  and (p.vip_expires_at is null or p.vip_expires_at > now())))))
     or public.is_admin())');
select public.ss_policy('pages', 'pages_admin_write',
  'for all to authenticated using (public.is_admin()) with check (public.is_admin())');

-- 5.5 Perfis
select public.ss_policy('profiles', 'profiles_read_authenticated',
  'for select to authenticated using (true)');
select public.ss_policy('profiles', 'profiles_read_anon',
  'for select to anon using (true)');
select public.ss_policy('profiles', 'profiles_update_own',
  'for update to authenticated using (id = auth.uid() or public.is_admin())
   with check (id = auth.uid() or public.is_admin())');
select public.ss_policy('profiles', 'profiles_admin_delete',
  'for delete to authenticated using (public.is_admin())');

-- 5.6 Favoritos (biblioteca pessoal)
select public.ss_policy('favorites', 'favorites_select_own',
  'for select to authenticated using (user_id = auth.uid())');
select public.ss_policy('favorites', 'favorites_insert_own',
  'for insert to authenticated with check (user_id = auth.uid())');
select public.ss_policy('favorites', 'favorites_delete_own',
  'for delete to authenticated using (user_id = auth.uid())');

-- 5.7 Avaliações
select public.ss_policy('ratings', 'ratings_public_read',
  'for select to anon, authenticated using (true)');
select public.ss_policy('ratings', 'ratings_insert_own',
  'for insert to authenticated with check (user_id = auth.uid())');
select public.ss_policy('ratings', 'ratings_update_own',
  'for update to authenticated using (user_id = auth.uid())
   with check (user_id = auth.uid())');
select public.ss_policy('ratings', 'ratings_delete_own',
  'for delete to authenticated using (user_id = auth.uid())');

-- 5.8 Comentários
select public.ss_policy('comments', 'comments_public_read',
  'for select to anon, authenticated using (true)');
select public.ss_policy('comments', 'comments_insert_own',
  'for insert to authenticated with check (user_id = auth.uid())');
select public.ss_policy('comments', 'comments_update_own',
  'for update to authenticated using (user_id = auth.uid())
   with check (user_id = auth.uid())');
select public.ss_policy('comments', 'comments_delete_own_or_admin',
  'for delete to authenticated using (user_id = auth.uid() or public.is_admin())');

-- 5.9 Curtidas
select public.ss_policy('likes', 'likes_public_read',
  'for select to anon, authenticated using (true)');
select public.ss_policy('likes', 'likes_insert_own',
  'for insert to authenticated with check (user_id = auth.uid())');
select public.ss_policy('likes', 'likes_delete_own',
  'for delete to authenticated using (user_id = auth.uid())');

-- 5.10 Denúncias
select public.ss_policy('reports', 'reports_insert_own',
  'for insert to anon, authenticated with check (reporter_id is null or reporter_id = auth.uid())');
select public.ss_policy('reports', 'reports_select_own_or_admin',
  'for select to authenticated using (reporter_id = auth.uid() or public.is_admin())');
select public.ss_policy('reports', 'reports_update_admin',
  'for update to authenticated using (public.is_admin()) with check (public.is_admin())');
select public.ss_policy('reports', 'reports_delete_admin',
  'for delete to authenticated using (public.is_admin())');

-- 5.11 Notificações
select public.ss_policy('notifications', 'notifications_select_own',
  'for select to authenticated using (user_id = auth.uid() or public.is_admin())');
select public.ss_policy('notifications', 'notifications_update_own',
  'for update to authenticated using (user_id = auth.uid())
   with check (user_id = auth.uid())');
select public.ss_policy('notifications', 'notifications_insert_admin',
  'for insert to authenticated with check (public.is_admin())');
select public.ss_policy('notifications', 'notifications_delete_admin',
  'for delete to authenticated using (public.is_admin())');

-- 5.12 Listas pessoais
select public.ss_policy('user_lists', 'user_lists_select_own_or_public',
  'for select to authenticated using (user_id = auth.uid() or is_public)');
select public.ss_policy('user_lists', 'user_lists_insert_own',
  'for insert to authenticated with check (user_id = auth.uid())');
select public.ss_policy('user_lists', 'user_lists_update_own',
  'for update to authenticated using (user_id = auth.uid())
   with check (user_id = auth.uid())');
select public.ss_policy('user_lists', 'user_lists_delete_own',
  'for delete to authenticated using (user_id = auth.uid())');

select public.ss_policy('user_list_items', 'user_list_items_select',
  'for select to authenticated using (exists (
     select 1 from public.user_lists l
     where l.id = user_list_items.list_id
       and (l.user_id = auth.uid() or l.is_public)))');
select public.ss_policy('user_list_items', 'user_list_items_write_own',
  'for all to authenticated
   using (exists (select 1 from public.user_lists l
                  where l.id = user_list_items.list_id and l.user_id = auth.uid()))
   with check (exists (select 1 from public.user_lists l
                       where l.id = user_list_items.list_id and l.user_id = auth.uid()))');

-- 5.13 Pagamentos: usuário vê a própria cobrança; equipe vê e aprova tudo.
--      Visitante pode gerar cobrança (checkout sem login), sempre pendente.
select public.ss_policy('payment_requests', 'payment_requests_select_own_or_admin',
  'for select to authenticated using (user_id = auth.uid() or public.is_admin())');
select public.ss_policy('payment_requests', 'payment_requests_insert_checkout',
  'for insert to anon, authenticated with check (
     status = ''pendente'' and (user_id is null or user_id = auth.uid()))');
select public.ss_policy('payment_requests', 'payment_requests_update_own_or_admin',
  'for update to authenticated using (user_id = auth.uid() or public.is_admin())
   with check (user_id = auth.uid() or public.is_admin())');
select public.ss_policy('payment_requests', 'payment_requests_delete_admin',
  'for delete to authenticated using (public.is_admin())');

-- 5.14 Exclusão de conta
select public.ss_policy('account_deletion_requests', 'account_deletion_select_own_or_admin',
  'for select to authenticated using (user_id = auth.uid() or public.is_admin())');
select public.ss_policy('account_deletion_requests', 'account_deletion_insert_own',
  'for insert to authenticated with check (user_id = auth.uid())');
select public.ss_policy('account_deletion_requests', 'account_deletion_admin',
  'for all to authenticated using (public.is_admin()) with check (public.is_admin())');

-- 5.15 Auditoria: só administrador lê. Ninguém escreve direto.
select public.ss_policy('security_events', 'security_events_admin_read',
  'for select to authenticated using (public.is_admin())');

-- 5.16 Preços: leitura pública dos planos ativos
select public.ss_policy('plan_prices', 'plan_prices_public_read',
  'for select to anon, authenticated using (active = true)');

-- 5.17 Views respeitam o RLS de quem consulta
do $$
begin
  if to_regclass('public.works_with_ratings') is not null then
    execute 'alter view public.works_with_ratings set (security_invoker = true)';
  end if;
end
$$;


-- ============================================================================
-- 6) PRIVILÉGIOS MÍNIMOS
-- ============================================================================

-- 6.1 Nada de TRUNCATE/REFERENCES/TRIGGER para o navegador
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

-- 6.2 Minimização de dados (LGPD): visitante não lê e-mail nem telefone.
--     Só as colunas públicas do perfil.
revoke select on public.profiles from anon;

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in (
      'id', 'username', 'display_name', 'avatar_url',
      'is_admin', 'is_vip', 'created_at'
    );

  if v_cols is not null then
    execute format('grant select (%s) on public.profiles to anon', v_cols);
  end if;
end
$$;

grant select on public.profiles to authenticated;

-- 6.3 Tabelas que o navegador nunca escreve direto
revoke insert, update, delete, truncate on public.plan_prices from anon, authenticated;
revoke insert, update, delete, truncate on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;

-- 6.4 search_path determinístico em todas as funções da aplicação
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
        select 1 from pg_depend d
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

-- 6.5 Reduz a superfície de RPC: revoga EXECUTE das funções SECURITY DEFINER
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
      and p.proname <> 'is_admin'
      and not exists (
        select 1 from pg_depend d
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

-- 6.6 Libera apenas a API realmente usada pelo site
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('public.is_admin()',                                'anon, authenticated'),
      ('public.criar_denuncia(text, uuid, text, text)',    'authenticated'),
      ('public.excluir_propria_conta()',                   'authenticated'),
      ('public.toggle_like(text, uuid)',                   'authenticated'),
      ('public.increment_work_views(uuid)',                'anon, authenticated'),
      ('public.increment_chapter_views(uuid)',             'anon, authenticated'),
      ('public.search_works(text, integer)',               'anon, authenticated'),
      ('public.get_related_works(uuid, integer)',          'anon, authenticated'),
      ('public.get_homepage_sections()',                   'anon, authenticated'),
      ('public.get_continue_reading(uuid)',                'authenticated'),
      ('public.log_security_event(text, jsonb)',           'authenticated')
    ) as t(fn, roles)
  loop
    if to_regprocedure(item.fn) is not null then
      execute format('grant execute on function %s to %s', item.fn, item.roles);
    end if;
  end loop;
end
$$;

-- 6.7 Helpers read-only devem rodar com o RLS do chamador
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.search_works(text, integer)',
    'public.get_related_works(uuid, integer)',
    'public.get_homepage_sections()',
    'public.get_continue_reading(uuid)'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s security invoker', fn);
    end if;
  end loop;
end
$$;


-- ============================================================================
-- 7) STORAGE (capas, avatares, páginas de capítulo)
-- ============================================================================

-- 7.1 Conteúdo pago não fica em bucket público
update storage.buckets
   set public = false
 where id in ('chapters', 'pages', 'backups', 'icons', 'logos', 'thumbnails');

-- 7.2 Limite de tamanho e tipo por bucket (bloqueia upload malicioso)
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'covers';

update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
 where id = 'chapters';

-- 7.3 Leitura pública apenas de mídia de vitrine
drop policy if exists solitude_storage_public_read on storage.objects;
drop policy if exists solitude_storage_public_media_read on storage.objects;
create policy solitude_storage_public_media_read
  on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('covers', 'banners', 'avatars'));

-- 7.4 Páginas de capítulo: só com capítulo publicado e regra de VIP
drop policy if exists solitude_storage_chapters_read on storage.objects;
create policy solitude_storage_chapters_read
  on storage.objects
  for select to anon, authenticated
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

-- 7.5 Escrita: administradores gerenciam; usuário sobe o próprio avatar
drop policy if exists solitude_storage_admin_write on storage.objects;
create policy solitude_storage_admin_write
  on storage.objects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists solitude_storage_avatar_write on storage.objects;
create policy solitude_storage_avatar_write
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- 8) ADMINISTRADOR DO PROJETO
--    Só este ID recebe admin. Nenhum e-mail promove ninguém.
-- ============================================================================
update public.profiles
   set is_admin = true, role = 'admin'
 where id = 'd4618bc4-518d-472a-99e0-647520435092';


-- ============================================================================
-- 9) REGISTRO DA APLICAÇÃO (auditoria)
-- ============================================================================
insert into public.security_events (user_id, event, detail)
values (null, 'migracao_sql_completo', jsonb_build_object('aplicada_em', now()));


-- ============================================================================
-- 10) LIMPEZA DOS HELPERS DESTE SCRIPT
-- ============================================================================
drop function if exists public.ss_policy(text, text, text);
drop function if exists public.ss_rls(text);


-- ============================================================================
-- 11) CONFERÊNCIA (somente leitura)
-- ============================================================================

-- 11.1 Tabelas SEM RLS — o esperado é NENHUMA linha.
select c.relname as tabela_sem_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;

-- 11.2 Tabelas com RLS ligado e nenhuma política (bloqueia tudo).
select c.relname as tabela_rls_sem_politica
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by 1;

-- 11.3 Quantidade de políticas por tabela.
select tablename, count(*) as politicas
from pg_policies
where schemaname = 'public'
group by tablename
order by politicas asc, tablename;

-- 11.4 Preços oficiais que o banco aplica na cobrança.
select plan as plano,
       round(amount_cents / 100.0, 2) as preco,
       duration_days as dias,
       active as ativo
from public.plan_prices
order by amount_cents;

-- 11.5 Pagamentos por status.
select status, count(*) as total, min(created_at) as mais_antigo
from public.payment_requests
group by status
order by total desc;

-- 11.6 Últimos eventos de segurança (tabela criada por este script).
select created_at, event, user_id, detail
from public.security_events
order by created_at desc
limit 20;
