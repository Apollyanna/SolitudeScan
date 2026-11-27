-- SolitudeScan — Plataforma: cargos, permissões, suporte, progresso, auditoria e notificações.
-- MIGRAÇÃO ADITIVA E IDEMPOTENTE. Não apaga tabelas, colunas, linhas ou políticas existentes.
-- Seguro para executar mais de uma vez no SQL Editor do Supabase.

-- ---------------------------------------------------------------------------
-- 1. CARGOS E STATUS DE CONTA
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists role text default 'leitor';
alter table public.profiles add column if not exists status text default 'ativo';
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists moderation_note text;
alter table public.profiles add column if not exists notification_prefs jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Normaliza valores legados sem destruir dados.
update public.profiles set role = 'admin' where coalesce(is_admin, false) = true and coalesce(role, 'leitor') not in ('admin');
update public.profiles set role = 'leitor' where role is null or role not in ('admin', 'cooperador', 'leitor');
update public.profiles set status = 'ativo' where status is null;

-- Ajusta a constraint de role (se existir) para aceitar os três cargos.
do $$
declare
  v_nome text;
begin
  for v_nome in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', v_nome);
  end loop;
  alter table public.profiles
    add constraint profiles_role_check check (role in ('leitor', 'cooperador', 'admin'));
exception when others then
  raise notice 'Não foi possível reescrever a constraint de role: %', sqlerrm;
end $$;

alter table public.profiles alter column role set default 'leitor';
alter table public.profiles alter column status set default 'ativo';

-- ---------------------------------------------------------------------------
-- 2. FUNÇÕES DE AUTORIZAÇÃO (fonte única de verdade no banco)
-- ---------------------------------------------------------------------------
create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
    when coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then 'admin'
    else coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'leitor')
  end;
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.meu_papel() = 'admin';
$$;

create or replace function public.eh_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.meu_papel() in ('admin', 'cooperador');
$$;

create or replace function public.conta_ativa()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((select p.status = 'ativo' from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.meu_papel() to authenticated, anon;
grant execute on function public.eh_admin() to authenticated, anon;
grant execute on function public.eh_staff() to authenticated, anon;
grant execute on function public.conta_ativa() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. OBRAS: AUTORIA, APROVAÇÃO E DESTAQUE
-- ---------------------------------------------------------------------------
alter table public.works add column if not exists submitted_by uuid references public.profiles(id) on delete set null;
alter table public.works add column if not exists approval_status text default 'aprovado';
alter table public.works add column if not exists rejection_reason text;
alter table public.works add column if not exists is_featured boolean default false;
alter table public.works add column if not exists is_archived boolean default false;
alter table public.works add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.works add column if not exists reviewed_at timestamptz;

update public.works set approval_status = 'aprovado' where approval_status is null;
update public.works set is_featured = false where is_featured is null;
update public.works set is_archived = false where is_archived is null;

create index if not exists works_approval_idx on public.works(approval_status);
create index if not exists works_submitted_by_idx on public.works(submitted_by);

-- O cooperador só pode editar obras que enviou.
create or replace function public.pode_gerir_obra(p_work uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.eh_admin()
    or exists (
      select 1 from public.works w
      where w.id = p_work and w.submitted_by = auth.uid()
    );
$$;

grant execute on function public.pode_gerir_obra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. PROGRESSO DE LEITURA (persistente, por conta e por dispositivo)
-- ---------------------------------------------------------------------------
create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null,
  chapter_id uuid,
  page integer not null default 1,
  total_pages integer,
  percent numeric(5,2) default 0,
  chapter_number text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, work_id)
);

create index if not exists reading_progress_user_idx on public.reading_progress(user_id, updated_at desc);

alter table public.reading_progress enable row level security;

drop policy if exists reading_progress_own_select on public.reading_progress;
create policy reading_progress_own_select on public.reading_progress
  for select to authenticated using (user_id = auth.uid() or public.eh_admin());

drop policy if exists reading_progress_own_write on public.reading_progress;
create policy reading_progress_own_write on public.reading_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists reading_progress_own_update on public.reading_progress;
create policy reading_progress_own_update on public.reading_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reading_progress_own_delete on public.reading_progress;
create policy reading_progress_own_delete on public.reading_progress
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. SUPORTE (chamados + mensagens)
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  protocol text,
  category text not null default 'outro',
  subject text not null,
  message text not null,
  status text not null default 'aberto'
    check (status in ('aberto', 'em_analise', 'aguardando_usuario', 'resolvido', 'encerrado')),
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  related_work uuid,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  message text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_tickets_owner_select on public.support_tickets;
create policy support_tickets_owner_select on public.support_tickets
  for select to authenticated using (user_id = auth.uid() or public.eh_admin());

drop policy if exists support_tickets_owner_insert on public.support_tickets;
create policy support_tickets_owner_insert on public.support_tickets
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists support_tickets_owner_update on public.support_tickets;
create policy support_tickets_owner_update on public.support_tickets
  for update to authenticated
  using (user_id = auth.uid() or public.eh_admin())
  with check (user_id = auth.uid() or public.eh_admin());

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
  for select to authenticated using (
    public.eh_admin() or exists (
      select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages
  for insert to authenticated with check (
    author_id = auth.uid() and (
      public.eh_admin() or exists (
        select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()
      )
    )
  );

-- Protocolo legível gerado no servidor (não confia no cliente).
create or replace function public.gerar_protocolo_suporte()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.protocol is null or new.protocol = '' then
    new.protocol := 'SS-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_gerar_protocolo_suporte on public.support_tickets;
create trigger trigger_gerar_protocolo_suporte
before insert on public.support_tickets
for each row execute function public.gerar_protocolo_suporte();

-- ---------------------------------------------------------------------------
-- 6. AUDITORIA ADMINISTRATIVA
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb default '{}'::jsonb,
  ip_hint text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_admin_select on public.admin_audit_log;
create policy admin_audit_admin_select on public.admin_audit_log
  for select to authenticated using (public.eh_admin());

create or replace function public.registrar_auditoria(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem registrar auditoria';
  end if;
  insert into public.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

grant execute on function public.registrar_auditoria(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. NOTIFICAÇÕES: envio seguro pelo servidor
-- ---------------------------------------------------------------------------
create or replace function public.notificar(
  p_user uuid,
  p_type text,
  p_message text,
  p_link text default null,
  p_work uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_user is null or p_message is null or length(trim(p_message)) = 0 then
    return;
  end if;
  -- Respeita a preferência do usuário quando a coluna existir.
  begin
    if exists (
      select 1 from public.profiles p
      where p.id = p_user
        and coalesce((p.notification_prefs ->> p_type)::boolean, true) = false
    ) then
      return;
    end if;
  exception when others then
    null;
  end;

  insert into public.notifications(user_id, type, message, link, work_id, is_read)
  values (p_user, p_type, p_message, p_link, p_work, false);
end;
$$;

grant execute on function public.notificar(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPCs ADMINISTRATIVAS (validadas no servidor)
-- ---------------------------------------------------------------------------
create or replace function public.admin_definir_cargo(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_anterior text;
begin
  if not public.eh_admin() then
    raise exception 'Ação permitida apenas para administradores';
  end if;
  if p_role not in ('leitor', 'cooperador', 'admin') then
    raise exception 'Cargo inválido: %', p_role;
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'Você não pode rebaixar a própria conta de administrador';
  end if;

  select role into v_anterior from public.profiles where id = p_user;
  update public.profiles
     set role = p_role,
         is_admin = (p_role = 'admin')
   where id = p_user;

  insert into public.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'alterar_cargo', 'profile', p_user,
          jsonb_build_object('de', v_anterior, 'para', p_role));

  perform public.notificar(p_user, 'conta',
    case when p_role = 'admin' then 'Seu cargo agora é Administrador.'
         when p_role = 'cooperador' then 'Seu cargo agora é Cooperador. O painel de publicações está liberado.'
         else 'Seu cargo agora é Leitor.' end,
    'perfil', null);
end;
$$;

create or replace function public.admin_definir_status(p_user uuid, p_status text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.eh_admin() then
    raise exception 'Ação permitida apenas para administradores';
  end if;
  if p_status not in ('ativo', 'suspenso', 'banido') then
    raise exception 'Status inválido: %', p_status;
  end if;
  if p_user = auth.uid() and p_status <> 'ativo' then
    raise exception 'Você não pode suspender a própria conta';
  end if;

  update public.profiles
     set status = p_status,
         moderation_note = coalesce(p_nota, moderation_note)
   where id = p_user;

  insert into public.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'alterar_status', 'profile', p_user,
          jsonb_build_object('status', p_status, 'nota', p_nota));

  perform public.notificar(p_user, 'seguranca',
    case when p_status = 'ativo' then 'Sua conta foi reativada.'
         when p_status = 'suspenso' then 'Sua conta foi suspensa. Entre em contato com o suporte.'
         else 'Sua conta foi banida da plataforma.' end,
    'perfil', null);
end;
$$;

create or replace function public.admin_aprovar_obra(p_work uuid, p_aprovar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_dono uuid;
  v_titulo text;
begin
  if not public.eh_admin() then
    raise exception 'Ação permitida apenas para administradores';
  end if;

  select submitted_by, title into v_dono, v_titulo from public.works where id = p_work;
  if not found then
    raise exception 'Obra não encontrada';
  end if;

  update public.works
     set approval_status = case when p_aprovar then 'aprovado' else 'rejeitado' end,
         rejection_reason = case when p_aprovar then null else p_motivo end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_work;

  insert into public.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_aprovar then 'aprovar_obra' else 'rejeitar_obra' end,
          'work', p_work, jsonb_build_object('motivo', p_motivo));

  if v_dono is not null then
    perform public.notificar(v_dono, 'publicacao',
      case when p_aprovar then 'Sua obra "' || coalesce(v_titulo, '') || '" foi aprovada.'
           else 'Sua obra "' || coalesce(v_titulo, '') || '" foi rejeitada. ' || coalesce(p_motivo, '') end,
      'perfil', p_work);
  end if;
end;
$$;

grant execute on function public.admin_definir_cargo(uuid, text) to authenticated;
grant execute on function public.admin_definir_status(uuid, text, text) to authenticated;
grant execute on function public.admin_aprovar_obra(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. POLÍTICAS DE OBRAS/CAPÍTULOS PARA COOPERADOR
-- ---------------------------------------------------------------------------
drop policy if exists works_cooperador_insert on public.works;
create policy works_cooperador_insert on public.works
  for insert to authenticated
  with check (
    public.eh_admin()
    or (public.eh_staff() and submitted_by = auth.uid() and coalesce(approval_status, 'pendente') = 'pendente')
  );

drop policy if exists works_cooperador_update on public.works;
create policy works_cooperador_update on public.works
  for update to authenticated
  using (public.eh_admin() or (submitted_by = auth.uid() and public.conta_ativa()))
  with check (public.eh_admin() or submitted_by = auth.uid());

-- O cooperador não pode aprovar a própria obra.
create or replace function public.proteger_aprovacao_obra()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.eh_admin() then
    if new.approval_status is distinct from old.approval_status
       and new.approval_status = 'aprovado' then
      raise exception 'A aprovação de obras é uma ação administrativa';
    end if;
    if new.is_featured is distinct from old.is_featured then
      raise exception 'Destaque de obras é uma ação administrativa';
    end if;
    if new.is_archived is distinct from old.is_archived then
      raise exception 'Arquivamento de obras é uma ação administrativa';
    end if;
    if new.submitted_by is distinct from old.submitted_by then
      raise exception 'A autoria da obra não pode ser alterada';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_proteger_aprovacao_obra on public.works;
create trigger trigger_proteger_aprovacao_obra
before update on public.works
for each row execute function public.proteger_aprovacao_obra();

drop policy if exists chapters_staff_insert on public.chapters;
create policy chapters_staff_insert on public.chapters
  for insert to authenticated
  with check (public.eh_admin() or (public.eh_staff() and public.pode_gerir_obra(work_id)));

drop policy if exists chapters_staff_update on public.chapters;
create policy chapters_staff_update on public.chapters
  for update to authenticated
  using (public.eh_admin() or public.pode_gerir_obra(work_id))
  with check (public.eh_admin() or public.pode_gerir_obra(work_id));

drop policy if exists chapters_staff_delete on public.chapters;
create policy chapters_staff_delete on public.chapters
  for delete to authenticated
  using (public.eh_admin() or public.pode_gerir_obra(work_id));

-- ---------------------------------------------------------------------------
-- 10. GATILHOS DE NOTIFICAÇÃO (eventos reais, nada fictício)
-- ---------------------------------------------------------------------------
-- Novo capítulo -> quem favoritou a obra recebe aviso.
create or replace function public.notificar_novo_capitulo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_titulo text;
  v_num text;
  r record;
begin
  begin
    select title into v_titulo from public.works where id = new.work_id;
  exception when others then
    v_titulo := null;
  end;
  v_num := coalesce(new.number::text, new.chapter_number::text, '');

  for r in select user_id from public.favorites where work_id = new.work_id loop
    perform public.notificar(r.user_id, 'novo_capitulo',
      'Novo capítulo de ' || coalesce(v_titulo, 'sua obra favorita') || coalesce(' — cap. ' || v_num, '') || '.',
      'obra', new.work_id);
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chapters')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'favorites') then
    drop trigger if exists trigger_notificar_novo_capitulo on public.chapters;
    create trigger trigger_notificar_novo_capitulo
    after insert on public.chapters
    for each row execute function public.notificar_novo_capitulo();
  else
    raise notice 'chapters/favorites ausentes: gatilho de novo capítulo não criado';
  end if;
end $$;

-- Pagamento aprovado/recusado -> aviso ao usuário.
create or replace function public.notificar_status_pagamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('aprovado', 'aprovada', 'pago', 'confirmado') then
      perform public.notificar(new.user_id, 'pagamento',
        'Seu pagamento foi aprovado. O benefício VIP já está ativo.', 'vip', null);
    elsif new.status in ('rejeitado', 'recusado', 'cancelado') then
      perform public.notificar(new.user_id, 'pagamento',
        'Seu pagamento foi recusado. Veja os detalhes na área de assinatura.', 'vip', null);
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payment_requests') then
    drop trigger if exists trigger_notificar_status_pagamento on public.payment_requests;
    create trigger trigger_notificar_status_pagamento
    after update on public.payment_requests
    for each row execute function public.notificar_status_pagamento();
  end if;
end $$;

-- Resposta a comentário -> aviso ao autor do comentário original.
create or replace function public.notificar_resposta_comentario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_pai uuid;
  v_autor uuid;
begin
  begin
    v_pai := new.parent_id;
  exception when others then
    v_pai := null;
  end;
  if v_pai is null then
    return new;
  end if;

  select user_id into v_autor from public.comments where id = v_pai;
  if v_autor is not null and v_autor <> new.user_id then
    perform public.notificar(v_autor, 'resposta_comentario',
      'Alguém respondeu ao seu comentário.', 'obra', new.work_id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_id') then
    drop trigger if exists trigger_notificar_resposta_comentario on public.comments;
    create trigger trigger_notificar_resposta_comentario
    after insert on public.comments
    for each row execute function public.notificar_resposta_comentario();
  else
    raise notice 'comments.parent_id ausente: gatilho de resposta não criado';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. STORAGE: buckets e políticas de upload por dono
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('covers', 'covers', true)
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public)
    values ('pages', 'pages', false)
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists ss_covers_staff_write on storage.objects;
    create policy ss_covers_staff_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'covers' and public.eh_staff());

    drop policy if exists ss_covers_staff_update on storage.objects;
    create policy ss_covers_staff_update on storage.objects
      for update to authenticated
      using (bucket_id = 'covers' and public.eh_staff())
      with check (bucket_id = 'covers' and public.eh_staff());

    drop policy if exists ss_avatars_owner_write on storage.objects;
    create policy ss_avatars_owner_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists ss_avatars_owner_update on storage.objects;
    create policy ss_avatars_owner_update on storage.objects
      for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists ss_pages_staff_write on storage.objects;
    create policy ss_pages_staff_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'pages' and public.eh_staff());

    drop policy if exists ss_pages_staff_read on storage.objects;
    create policy ss_pages_staff_read on storage.objects
      for select to authenticated
      using (bucket_id = 'pages' and (public.eh_staff() or public.conta_ativa()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 12. VERIFICAÇÃO FINAL (retorna o estado real aplicado)
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.profiles where role = 'admin') as admins,
  (select count(*) from public.profiles where role = 'cooperador') as cooperadores,
  (select count(*) from public.profiles where status <> 'ativo') as contas_restritas,
  (select count(*) from public.works where approval_status = 'pendente') as obras_pendentes,
  (select count(*) from public.support_tickets) as chamados,
  (select count(*) from public.reading_progress) as progressos;
