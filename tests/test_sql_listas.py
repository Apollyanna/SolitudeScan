"""Regressão do erro 42703: coluna is_public inexistente em public.user_lists.

O script criava políticas que leem `is_public` sem garantir a coluna nem as
tabelas de listas, e o Supabase abortava com "column is_public does not exist".
Estes testes garantem que o DDL venha antes das políticas e cubra os campos
que o app realmente grava.
"""

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
COMPLETO = "SQL_COMPLETO_SUPABASE.sql"
MIGRACAO = "migrations/20261127130000_rls_completo.sql"
ARQUIVOS = (COMPLETO, MIGRACAO)


def ler(caminho):
    return (RAIZ / caminho).read_text(encoding="utf-8")


def bloco_parenteses(texto, inicio):
    """Conteúdo interno do primeiro parêntese que segue `inicio`."""
    pos = texto.index(inicio)
    abre = texto.index("(", pos)
    nivel = 0
    for i in range(abre, len(texto)):
        if texto[i] == "(":
            nivel += 1
        elif texto[i] == ")":
            nivel -= 1
            if nivel == 0:
                return texto[abre + 1:i]
    raise AssertionError(f"bloco não fechado: {inicio}")


def test_coluna_is_public_criada_antes_da_politica():
    for caminho in ARQUIVOS:
        sql = ler(caminho)
        assert "add column if not exists is_public" in sql, caminho
        assert sql.index("add column if not exists is_public") < sql.index(
            "user_lists_select_own_or_public"
        ), f"{caminho}: a coluna is_public precisa existir antes da política"


def test_tabelas_de_listas_criadas_antes_das_politicas():
    for caminho in ARQUIVOS:
        sql = ler(caminho)
        for tabela in ("public.user_lists", "public.user_list_items"):
            criacao = f"create table if not exists {tabela}"
            assert criacao in sql, f"{caminho}: falta {criacao}"
            assert sql.index(criacao) < sql.index("user_lists_select_own_or_public")


def test_colunas_gravadas_pelo_app_existem():
    sql = ler(COMPLETO)
    listas = bloco_parenteses(sql, "create table if not exists public.user_lists")
    for coluna in ("user_id", "name", "description", "is_default", "is_public", "created_at"):
        assert coluna in listas, f"user_lists sem a coluna {coluna}"

    itens = bloco_parenteses(sql, "create table if not exists public.user_list_items")
    for coluna in ("list_id", "work_id", "position", "status", "added_at"):
        assert coluna in itens, f"user_list_items sem a coluna {coluna}"


def test_listas_privadas_por_padrao():
    for caminho in ARQUIVOS:
        sql = ler(caminho)
        assert "is_public boolean not null default false" in sql, (
            f"{caminho}: listas devem nascer privadas"
        )


def test_permissoes_para_usuario_autenticado():
    for caminho in ARQUIVOS:
        sql = ler(caminho)
        for tabela in ("public.user_lists", "public.user_list_items"):
            assert (
                f"grant select, insert, update, delete on {tabela} to authenticated"
                in sql
            ), f"{caminho}: falta grant em {tabela}"
