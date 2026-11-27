-- SolitudeScan — RLS completo, auditoria de segurança e limites de abuso.
-- Migração idempotente: pode ser executada mais de uma vez sem efeitos colaterais.
-- Cobre as tabelas que estavam SEM política de Row Level Security no repositório
-- (comments, favorites, ratings, likes, reports, notifications, user_lists,
--  user_list_items, genres, work_genres, works) além de endurecer perfis,
-- pagamentos e uploads.

-- ============================================================
-- 0) Helper de administrador (recriado com search_path fixo)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ============================================================
-- 1) Auditoria de eventos de segurança (requisito 32/34/40)
-- ============================================================
create table if not exists public.security_events (
  id bigserial primary key,
  user_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx on public.security_events (created_at desc);

alter table if exists public.security_events enable row level security;

drop policy if exists security_events_admin_read on public.security_events;
create policy security_events_admin_read
  on public.security_events
  for select
  to authenticated
  using (public.is_admin());

-- Somente leitura para administradores; ninguém escreve direto (apenas via função).
revoke insert, update, delete, truncate on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;

create or replace function public.log_security_event(p_event text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.security_events (user_id, event, detail)
  values (auth.uid(), left(coalesce(p_event, 'evento'), 80), coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function public.log_security_event(text, jsonb) from public;
grant execute on function public.log_security_event(text, jsonb) to authenticated;

-- ============================================================
-- 2) Limite de frequência de comentários + validação de conteúdo
-- ============================================================
create or replace function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recentes integer;
begin
  new.content := btrim(coalesce(new.content, ''));

  if length(new.content) < 1 then
    raise exception 'conteudo_vazio: o comentário não pode ficar em branco' using errcode = '22023';
  end if;

  if length(new.content) > 2000 then
    raise exception 'conteudo_longo: o comentário excede 2000 caracteres' using errcode = '22023';
  end if;

  select count(*) into v_recentes
  from public.comments
  where user_id = new.user_id
    and created_at > now() - interval '5 minutes';

  if v_recentes >= 8 then
    raise exception 'rate_limit: aguarde alguns minutos antes de comentar novamente' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_comments_rate_limit on public.comments;
create trigger trg_comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

-- ============================================================
-- 3) Impedir adulteração de campos protegidos do perfil
--    (auto-promoção a admin, auto-VIP, troca de e-mail)
-- ============================================================
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
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
    raise exception 'campo_protegido: alteração não permitida' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ============================================================
-- 4) Impedir adulteração de requisições de pagamento
--    Usuário só pode marcar a própria solicitação como expirada;
--    valor, plano, e-mail e confirmação são exclusivos do admin.
-- ============================================================
create or replace function public.protect_payment_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.amount is distinct from old.amount
     or new.plan is distinct from old.plan
     or new.user_id is distinct from old.user_id
     or new.email is distinct from old.email
     or new.pix_key is distinct from old.pix_key
     or new.proof_url is distinct from old.proof_url
     or new.confirmed_at is distinct from old.confirmed_at
     or new.rejected_at is distinct from old.rejected_at then
    raise exception 'campo_protegido: dados do pagamento não podem ser alterados' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status <> 'expirado' then
    raise exception 'transicao_invalida: somente a equipe pode aprovar ou rejeitar pagamentos' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_payment_request_fields on public.payment_requests;
create trigger trg_protect_payment_request_fields
  before update on public.payment_requests
  for each row execute function public.protect_payment_request_fields();

-- ============================================================
-- 5) RLS + políticas por tabela
-- ============================================================

-- CATÁLOGO: works
alter table if exists public.works enable row level security;

drop policy if exists works_public_read on public.works;
create policy works_public_read
  on public.works for select to anon, authenticated
  using ((is_published and deleted_at is null) or public.is_admin());

drop policy if exists works_admin_write on public.works;
create policy works_admin_write
  on public.works for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- GÊNEROS
alter table if exists public.genres enable row level security;

drop policy if exists genres_public_read on public.genres;
create policy genres_public_read
  on public.genres for select to anon, authenticated
  using (true);

drop policy if exists genres_admin_write on public.genres;
create policy genres_admin_write
  on public.genres for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table if exists public.work_genres enable row level security;

drop policy if exists work_genres_public_read on public.work_genres;
create policy work_genres_public_read
  on public.work_genres for select to anon, authenticated
  using (true);

drop policy if exists work_genres_admin_write on public.work_genres;
create policy work_genres_admin_write
  on public.work_genres for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- CAPÍTULOS E PÁGINAS: leitura pública somente de obra publicada
alter table if exists public.chapters enable row level security;

drop policy if exists chapters_admin_write on public.chapters;
create policy chapters_admin_write
  on public.chapters for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table if exists public.pages enable row level security;

drop policy if exists pages_admin_write on public.pages;
create policy pages_admin_write
  on public.pages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- PERFIS: leitura autenticada (necessária para admin e para o próprio perfil)
alter table if exists public.profiles enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated
  on public.profiles for select to authenticated
  using (true);

drop policy if exists profiles_read_anon on public.profiles;
create policy profiles_read_anon
  on public.profiles for select to anon
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- Minimização de dados (LGPD): visitante anônimo só enxerga colunas públicas.
-- O e-mail e o telefone deixam de ser legíveis sem autenticação.
revoke select on public.profiles from anon;
grant select (id, username, display_name, avatar_url, is_admin, is_vip, created_at)
  on public.profiles to anon;

-- FAVORITOS: cada usuário gerencia apenas os próprios
alter table if exists public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own
  on public.favorites for select to authenticated
  using (user_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own
  on public.favorites for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own
  on public.favorites for delete to authenticated
  using (user_id = auth.uid());

-- AVALIAÇÕES: leitura pública da nota, escrita apenas do próprio voto
alter table if exists public.ratings enable row level security;

drop policy if exists ratings_public_read on public.ratings;
create policy ratings_public_read
  on public.ratings for select to anon, authenticated
  using (true);

drop policy if exists ratings_insert_own on public.ratings;
create policy ratings_insert_own
  on public.ratings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ratings_update_own on public.ratings;
create policy ratings_update_own
  on public.ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ratings_delete_own on public.ratings;
create policy ratings_delete_own
  on public.ratings for delete to authenticated
  using (user_id = auth.uid());

-- COMENTÁRIOS: leitura pública, escrita e edição apenas do autor
alter table if exists public.comments enable row level security;

drop policy if exists comments_public_read on public.comments;
create policy comments_public_read
  on public.comments for select to anon, authenticated
  using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
  on public.comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists comments_delete_own_or_admin on public.comments;
create policy comments_delete_own_or_admin
  on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- CURTIDAS
alter table if exists public.likes enable row level security;

drop policy if exists likes_public_read on public.likes;
create policy likes_public_read
  on public.likes for select to anon, authenticated
  using (true);

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own
  on public.likes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own
  on public.likes for delete to authenticated
  using (user_id = auth.uid());

-- DENÚNCIAS: autor vê as próprias; equipe vê e trata todas
alter table if exists public.reports enable row level security;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
  on public.reports for insert to anon, authenticated
  with check (reporter_id is null or reporter_id = auth.uid());

drop policy if exists reports_select_own_or_admin on public.reports;
create policy reports_select_own_or_admin
  on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin
  on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists reports_delete_admin on public.reports;
create policy reports_delete_admin
  on public.reports for delete to authenticated
  using (public.is_admin());

-- NOTIFICAÇÕES: usuário lê e marca as suas; equipe cria para os usuários
alter table if exists public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_insert_admin on public.notifications;
create policy notifications_insert_admin
  on public.notifications for insert to authenticated
  with check (public.is_admin());

drop policy if exists notifications_delete_admin on public.notifications;
create policy notifications_delete_admin
  on public.notifications for delete to authenticated
  using (public.is_admin());

-- LISTAS PESSOAIS
alter table if exists public.user_lists enable row level security;

drop policy if exists user_lists_select_own_or_public on public.user_lists;
create policy user_lists_select_own_or_public
  on public.user_lists for select to authenticated
  using (user_id = auth.uid() or is_public);

drop policy if exists user_lists_insert_own on public.user_lists;
create policy user_lists_insert_own
  on public.user_lists for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_lists_update_own on public.user_lists;
create policy user_lists_update_own
  on public.user_lists for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_lists_delete_own on public.user_lists;
create policy user_lists_delete_own
  on public.user_lists for delete to authenticated
  using (user_id = auth.uid());

alter table if exists public.user_list_items enable row level security;

drop policy if exists user_list_items_select on public.user_list_items;
create policy user_list_items_select
  on public.user_list_items for select to authenticated
  using (exists (
    select 1 from public.user_lists l
    where l.id = user_list_items.list_id
      and (l.user_id = auth.uid() or l.is_public)
  ));

drop policy if exists user_list_items_write_own on public.user_list_items;
create policy user_list_items_write_own
  on public.user_list_items for all to authenticated
  using (exists (
    select 1 from public.user_lists l
    where l.id = user_list_items.list_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.user_lists l
    where l.id = user_list_items.list_id and l.user_id = auth.uid()
  ));

-- PAGAMENTOS: usuário acompanha a própria solicitação; equipe aprova
alter table if exists public.payment_requests enable row level security;

drop policy if exists payment_requests_select_own_or_admin on public.payment_requests;
create policy payment_requests_select_own_or_admin
  on public.payment_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists payment_requests_insert_own on public.payment_requests;
create policy payment_requests_insert_own
  on public.payment_requests for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists payment_requests_update_own_or_admin on public.payment_requests;
create policy payment_requests_update_own_or_admin
  on public.payment_requests for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- SOLICITAÇÕES DE EXCLUSÃO DE CONTA
alter table if exists public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_select_own_or_admin on public.account_deletion_requests;
create policy account_deletion_select_own_or_admin
  on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists account_deletion_insert_own on public.account_deletion_requests;
create policy account_deletion_insert_own
  on public.account_deletion_requests for insert to authenticated
  with check (user_id = auth.uid());

-- ============================================================
-- 6) Privilégios mínimos em tabelas e sequências
-- ============================================================
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ============================================================
-- 7) Limites de upload por bucket (tipo e tamanho)
-- ============================================================
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

-- ============================================================
-- 8) Registro de auditoria da própria migração
-- ============================================================
insert into public.security_events (user_id, event, detail)
values (null, 'migracao_rls_completo', jsonb_build_object('aplicada_em', now()));
