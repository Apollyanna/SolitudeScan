"""Contrato de navegacao responsiva do SolitudeScan.

O menu inferior (.bottom-nav) e a navegacao mobile; a partir de 900px ele e
substituido pela .navbar. Estes testes garantem que essa regra continue
intencional e coerente, para que uma checagem em viewport de desktop nunca
trate o menu inferior como elemento quebrado.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HTML = (RAIZ / "index.html").read_text(encoding="utf-8")
CSS = (RAIZ / "style.css").read_text(encoding="utf-8")
JS = (RAIZ / "script.js").read_text(encoding="utf-8")


def corpo_do_bloco(texto, inicio):
    """Retorna o conteudo interno do bloco que comeca em `inicio` (com a chave)."""
    pos = texto.index(inicio) + len(inicio) - 1
    assert texto[pos] == "{", f"bloco nao abre com chave: {inicio}"
    nivel = 0
    for i in range(pos, len(texto)):
        if texto[i] == "{":
            nivel += 1
        elif texto[i] == "}":
            nivel -= 1
            if nivel == 0:
                return texto[pos + 1:i]
    raise AssertionError(f"bloco nao fechado: {inicio}")


def test_menu_inferior_existe_com_as_abas_principais():
    nav = re.search(r'<nav class="bottom-nav".*?</nav>', HTML, re.S)
    assert nav, "menu inferior ausente no index.html"
    bloco = nav.group(0)
    for aba in ("tab-home", "tab-vip", "tab-profile"):
        assert f'data-tab="{aba}"' in bloco, f"menu inferior sem a aba {aba}"
    assert "btnAdminNav" in bloco, "menu inferior sem o atalho administrativo"
    assert bloco.count("switchTab(") >= 3


def test_menu_inferior_visivel_no_mobile():
    base = corpo_do_bloco(CSS, ".bottom-nav {")
    assert "display: grid" in base, "menu inferior precisa aparecer no mobile"
    assert "display: none" not in base
    assert "position: fixed" in base


def test_menu_inferior_oculto_no_desktop():
    desktop = corpo_do_bloco(CSS, "@media (min-width: 900px) {")
    assert re.search(r"\.bottom-nav\s*\{\s*display:\s*none;", desktop), (
        "acima de 900px o menu inferior deve ser ocultado"
    )
    assert re.search(r"\.nav-links\s*\{\s*display:\s*flex;", desktop), (
        "acima de 900px a navegacao do topo deve assumir"
    )


def test_desktop_nao_mantem_espaco_reservado_do_menu_inferior():
    desktop = corpo_do_bloco(CSS, "@media (min-width: 900px) {")
    assert re.search(r"body\s*\{\s*padding-bottom:\s*0;", desktop), (
        "o espaco do menu inferior precisa ser removido no desktop"
    )


def test_switchtab_sincroniza_as_duas_navegacoes():
    corpo = corpo_do_bloco(JS, "function switchTab(tabId, el) {")
    assert ".tab-content" in corpo, "troca de aba precisa alternar as secoes"
    assert ".nav-item" in corpo, "troca de aba precisa atualizar os dois menus"
    assert "classList.toggle('active'" in corpo
    assert "renderizarMinhaAssinatura" in corpo, "aba VIP precisa carregar dados reais"
    assert "renderizarAbasPerfil" in corpo, "aba Perfil precisa carregar dados reais"
