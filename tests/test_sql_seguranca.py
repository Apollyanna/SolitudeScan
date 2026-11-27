"""Validação dos scripts SQL do SolitudeScan para o Supabase.

Rode com:  pytest -q
Estes testes verificam o SQL que você cola no Supabase SQL Editor:
estrutura, idempotência, RLS, e (quando o parser oficial do PostgreSQL
estiver instalado) a sintaxe real de cada bloco.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SQL_PRINCIPAL = RAIZ / "SQL_COMPLETO_SUPABASE.sql"
SQL_VERIFICACAO = RAIZ / "VERIFICAR_SEGURANCA_SUPABASE.sql"

TABELAS_COM_RLS = [
    "profiles",
    "works",
    "chapters",
    "pages",
    "comments",
    "favorites",
    "ratings",
    "likes",
    "reports",
    "notifications",
    "payment_requests",
    "user_lists",
    "user_list_items",
]


def ler(caminho: Path) -> str:
    assert caminho.is_file(), f"arquivo ausente: {caminho.name}"
    texto = caminho.read_text(encoding="utf-8")
    assert len(texto) > 500, f"{caminho.name} parece vazio ou truncado"
    return texto


@pytest.fixture(scope="module")
def principal() -> str:
    return ler(SQL_PRINCIPAL)


@pytest.fixture(scope="module")
def verificacao() -> str:
    return ler(SQL_VERIFICACAO)


def test_arquivos_sql_existem(principal: str, verificacao: str) -> None:
    assert "create table" in principal.lower()
    assert "select" in verificacao.lower()


def test_blocos_dollar_quote_fechados(principal: str, verificacao: str) -> None:
    """Cada $$ precisa de um par: bloco aberto e nunca fechado quebra o script."""
    for nome, texto in (
        (SQL_PRINCIPAL.name, principal),
        (SQL_VERIFICACAO.name, verificacao),
    ):
        total = texto.count("$$")
        assert total % 2 == 0, f"{nome}: {total} ocorrências de $$ (número ímpar)"


def test_criacao_idempotente(principal: str) -> None:
    """Rodar o script duas vezes não pode dar erro."""
    sem_protecao = re.findall(r"create\s+table\s+(?!if\s+not\s+exists)", principal, re.I)
    assert not sem_protecao, f"{len(sem_protecao)} create table sem IF NOT EXISTS"

    sem_protecao = re.findall(
        r"create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists|concurrently\s+if)", principal, re.I
    )
    assert not sem_protecao, f"{len(sem_protecao)} create index sem IF NOT EXISTS"

    colunas_sem_guarda = re.findall(
        r"alter\s+table\s+public\.\w+\s+add\s+(?!column\s+)?(?!if\s+not\s+exists)", principal, re.I
    )
    assert not colunas_sem_guarda, f"{len(colunas_sem_guarda)} ALTER TABLE ADD sem IF NOT EXISTS"


def test_rls_ativo_nas_tabelas_principais(principal: str) -> None:
    minusculo = principal.lower()
    faltando = [
        t
        for t in TABELAS_COM_RLS
        if f"alter table public.{t} enable row level security" not in minusculo
    ]
    assert not faltando, f"RLS não ativado em: {', '.join(faltando)}"


def test_politicas_sao_recriadas_com_drop(principal: str) -> None:
    """create policy sem drop antes falha na segunda execução."""
    criadas = set(re.findall(r"create\s+policy\s+\"?(\w+)\"?\s+on\s+public\.", principal, re.I))
    removidas = set(re.findall(r"drop\s+policy\s+if\s+exists\s+\"?(\w+)\"?\s+on\s+public\.", principal, re.I))
    sem_drop = criadas - removidas
    assert not sem_drop, f"políticas criadas sem DROP IF EXISTS: {', '.join(sorted(sem_drop))}"


def test_funcoes_security_definer_fixam_search_path(principal: str) -> None:
    """security definer sem search_path fixo permite sequestro de schema."""
    for m in re.finditer(r"security\s+definer", principal, re.I):
        trecho = principal[m.start(): m.start() + 400].lower()
        assert "set search_path" in trecho, (
            "função SECURITY DEFINER sem SET search_path em "
            f"{principal[: m.start()].count(chr(10)) + 1}"
        )


def test_helper_ss_policy_centraliza_politicas(principal: str) -> None:
    assert re.search(r"create\s+or\s+replace\s+function\s+public\.ss_policy", principal, re.I)


def test_verificacao_sem_colunas_inexistentes(verificacao: str) -> None:
    """Regressão: a versão antiga consultava colunas que não existem e dava erro."""
    minusculo = verificacao.lower()
    for coluna in ("criado_em", "ator_id", "detalhe", "preco_centavos"):
        assert coluna not in minusculo, f"coluna inexistente referenciada: {coluna}"


def test_sem_segredo_exposto_nos_sql(principal: str, verificacao: str) -> None:
    padroes = [
        r"eyJ[A-Za-z0-9_\-]{20,}",  # JWT / chave anon ou service_role
        r"service_role\s*[:=]\s*['\"]",
        r"postgres(?:ql)?://[^\s'\"]+:[^\s'\"]+@",
    ]
    for nome, texto in ((SQL_PRINCIPAL.name, principal), (SQL_VERIFICACAO.name, verificacao)):
        for padrao in padroes:
            assert not re.search(padrao, texto), f"{nome}: segredo aparente ({padrao})"


# ---------------------------------------------------------------- parser real


def test_sintaxe_aceita_pelo_postgresql(principal: str) -> None:
    pglast = pytest.importorskip("pglast", reason="pglast não instalado neste ambiente")
    pglast.parse_sql(principal)


def test_corpos_plpgsql_validos(principal: str) -> None:
    pglast = pytest.importorskip("pglast", reason="pglast não instalado neste ambiente")
    from pglast.parser import parse_plpgsql

    corpos = re.findall(r"language\s+plpgsql[\s\S]*?as\s+\$\$([\s\S]*?)\$\$", principal, re.I)
    corpos += re.findall(r"\bdo\s+\$\$([\s\S]*?)\$\$", principal, re.I)
    assert corpos, "nenhum corpo plpgsql encontrado para validar"
    for i, corpo in enumerate(corpos, start=1):
        parse_plpgsql(corpo)


def test_definicoes_de_politica_validas(principal: str) -> None:
    """As políticas são texto dentro de ss_policy(): validadas uma por uma."""
    pglast = pytest.importorskip("pglast", reason="pglast não instalado neste ambiente")
    achados = re.findall(
        r"select\s+public\.ss_policy\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*\);",
        principal,
        re.I | re.S,
    )
    assert achados, "nenhuma chamada ss_policy encontrada"
    for tabela, nome, definicao in achados:
        pglast.parse_sql(f"create policy {nome} on public.{tabela} {definicao.replace(chr(39) * 2, chr(39))}")
