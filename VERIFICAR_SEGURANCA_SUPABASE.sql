-- SolitudeScan — verificação de segurança somente leitura.
-- Execute no Supabase → SQL Editor e compare o resultado com o relatório
-- AUDITORIA_SEGURANCA.md. Nenhum comando abaixo altera dados.
-- Itens marcados com "ESPERADO" mostram o que deve aparecer.

-- 1) Tabelas do schema public SEM Row Level Security habilitado.
-- ESPERADO: nenhuma linha. Qualquer linha aqui é uma falha crítica de RLS.
select c.relname as tabela_sem_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;

-- 2) Quantidade de políticas por tabela.
-- ESPERADO: toda tabela de dados com pelo menos 1 política; 0 = acesso negado a todos.
select tablename, count(*) as politicas
from pg_policies
where schemaname = 'public'
group by tablename
order by politicas asc, tablename;

-- 3) Tabelas com RLS ligado mas sem política (bloqueia tudo — pode quebrar o site).
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

-- 4) Funções SECURITY DEFINER e quem pode executá-las.
-- ESPERADO: apenas is_admin() e rotinas de manutenção; nunca executáveis por anon
-- sem necessidade explícita.
select p.proname as funcao,
       pg_get_userbyid(p.proowner) as dono,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proacl, ' | '), 'ACL padrão') as permissoes
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 1;

-- 5) Políticas que usam is_admin(): confirma que o controle de admin é no banco.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') like '%is_admin%' or coalesce(with_check, '') like '%is_admin%')
order by 1, 2;

-- 6) Buckets de storage: público, limite de tamanho e tipos permitidos.
-- ESPERADO: covers/chapters/avatars com file_size_limit definido e
-- allowed_mime_types restrito a imagens (chapters também aceita PDF).
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- 7) Objetos de storage sem política (upload/leitura sem controle).
select b.id as bucket, count(p.policyname) as politicas_storage
from storage.buckets b
left join pg_policies p
  on p.schemaname = 'storage' and p.tablename = 'objects'
  and coalesce(p.qual, '') like '%' || b.id || '%'
group by b.id
order by politicas_storage asc;

-- 8) Últimos eventos de segurança registrados (se a migração nova já foi aplicada).
-- Colunas reais: created_at, event, user_id, detail.
select created_at, event, user_id, detail
from public.security_events
order by created_at desc
limit 20;

-- 9) Pagamentos pendentes antigos (possível acúmulo de fraude/tentativa).
select status, count(*) as total, min(created_at) as mais_antigo
from public.payment_requests
group by status
order by total desc;

-- 10) Confirma que preços vêm do banco (não do navegador).
-- Colunas reais: plan, amount_cents, duration_days, active.
select plan, amount_cents, duration_days, active
from public.plan_prices
order by plan;
