-- ============================================================================
-- SolitudeScan — campos opcionais de pesquisa
-- Migração ADITIVA e IDEMPOTENTE. Não remove, não altera e não apaga dados.
-- Execute no SQL Editor do Supabase quando quiser habilitar busca por título
-- alternativo, tags e filtro por demografia com dados próprios.
-- Sem esta migração o site continua funcionando: a busca usa título, autor,
-- gêneros, sinopse, tipo e status, que já existem na tabela public.works.
-- ============================================================================

alter table public.works add column if not exists alternative_title text;
alter table public.works add column if not exists tags text[];
alter table public.works add column if not exists demographic text;

comment on column public.works.alternative_title is 'Título alternativo usado na pesquisa';
comment on column public.works.tags is 'Tags livres usadas na pesquisa';
comment on column public.works.demographic is 'Demografia: Shounen, Shoujo, Seinen, Josei';

-- Índices simples (não bloqueiam a leitura e não exigem extensões)
create index if not exists works_demographic_idx on public.works (demographic);
create index if not exists works_tags_gin_idx on public.works using gin (tags);

-- Índices de busca textual tolerante (opcionais).
-- pg_trgm é usado apenas se estiver disponível; qualquer falha é registrada
-- como aviso e a migração segue sem interromper a execução.
do $$
begin
  begin
    create extension if not exists pg_trgm with schema extensions;
  exception when others then
    raise notice 'pg_trgm indisponivel (%): indice de busca textual ignorado', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'works' and column_name = 'title') then
      execute 'create index if not exists works_title_trgm_idx on public.works using gin (title gin_trgm_ops)';
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'works' and column_name = 'alternative_title') then
      execute 'create index if not exists works_alt_title_trgm_idx on public.works using gin (alternative_title gin_trgm_ops)';
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'works' and column_name = 'author') then
      execute 'create index if not exists works_author_trgm_idx on public.works using gin (author gin_trgm_ops)';
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'works' and column_name = 'synopsis') then
      execute 'create index if not exists works_synopsis_trgm_idx on public.works using gin (synopsis gin_trgm_ops)';
    end if;
  end if;
end $$;

-- As políticas RLS existentes em public.works continuam valendo para as novas
-- colunas: leitura pública segue as regras já configuradas e escrita continua
-- restrita a administradores.
