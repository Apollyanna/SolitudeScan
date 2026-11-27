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

    for corpo in re.findall(
        r"alter\s+table\s+(?:if\s+exists\s+)?public\.\w+([\s\S]*?);", principal, re.I
    ):
        total_add = len(re.findall(r"\badd\s+", corpo, re.I))
        guardados = len(re.findall(r"\badd\s+column\s+if\s+not\s+exists", corpo, re.I))
        assert total_add == guardados, (
            f"{total_add - guardados} cláusula(s) ADD sem 'column if not exists' em ALTER TABLE"
        )


def test_rls_ativo_nas_tabelas_principais(principal: str) -> None:
    """RLS ligado por comando direto ou pela lista do laço public.ss_rls()."""
    minusculo = principal.lower()
    bloco = re.search(r"unnest\(\s*array\[([\s\S]*?)\]\s*\)", principal, re.I)
    no_laco = set(re.findall(r"'([a-z_]+)'", bloco.group(1))) if bloco else set()

    faltando = []
    for tabela in TABELAS_COM_RLS:
        direto = f"alter table public.{tabela} enable row level security" in minusculo
        if not direto and tabela not in no_laco:
            faltando.append(tabela)
    assert not faltando, f"RLS não ativado em: {', '.join(faltando)}"


def test_politicas_sao_recriadas_com_drop(principal: str) -> None:
    """create policy sem drop antes falha na segunda execução."""
    criadas = set(re.findall(r"create\s+policy\s+\"?(\w+)\"?\s+on\s+public\.", principal, re.I))
    removidas = set(re.findall(r"drop\s+policy\s+if\s+exists\s+\"?(\w+)\"?\s+on\s+public\.", principal, re.I))
    sem_drop = criadas - removidas
    assert not sem_drop, f"políticas criadas sem DROP IF EXISTS: {', '.join(sorted(sem_drop))}"


def test_funcoes_security_definer_fixam_search_path(principal: str) -> None:
    """security definer sem search_path fixo permite sequestro de schema."""
    cabecalhos = re.findall(
        r"create\s+(?:or\s+replace\s+)?function[\s\S]*?as\s+\$\$", principal, re.I
    )
    assert cabecalhos, "nenhuma função encontrada no script"
    definer = [c for c in cabecalhos if re.search(r"security\s+definer", c, re.I)]
    assert definer, "nenhuma função SECURITY DEFINER encontrada"
    for cabecalho in definer:
        assert re.search(r"set\s+search_path", cabecalho, re.I), (
            "função SECURITY DEFINER sem SET search_path: "
            + " ".join(cabecalho.split())[:140]
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
    """O parser plpgsql do libpg_query recebe o statement completo, não o corpo solto."""
    pglast = pytest.importorskip("pglast", reason="pglast não instalado neste ambiente")

    funcoes = re.findall(
        r"create\s+(?:or\s+replace\s+)?function[\s\S]*?as\s+\$\$[\s\S]*?\$\$\s*;", principal, re.I
    )
    assert funcoes, "nenhuma função plpgsql encontrada"
    for funcao in funcoes:
        pglast.parse_plpgsql(funcao)

    blocos = re.findall(r"\bdo\s+\$\$[\s\S]*?\$\$\s*;", principal, re.I)
    for bloco in blocos:
        pglast.parse_plpgsql(bloco)


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
