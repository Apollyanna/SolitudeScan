"""Testes do leitor ZIP/CBZ usado na publicação de capítulos.

Valida extração real (deflate e stored), ordem natural das páginas,
filtro de arquivos que não são imagem e recusa de arquivo inválido.
"""
import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
PROBE = Path(__file__).resolve().parent / "zip_probe.cjs"

NODE = shutil.which("node")

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40


def _roda(zip_path):
    resultado = subprocess.run(
        [NODE, str(PROBE), str(zip_path)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return resultado, json.loads(resultado.stdout or "{}")


def _sha(dados):
    return hashlib.sha256(dados).hexdigest()


pytestmark = pytest.mark.skipif(NODE is None, reason="node indisponível para a sonda")


def test_extrai_imagens_em_ordem_natural(tmp_path):
    conteudos = {
        "10.png": PNG + b"pagina-dez",
        "2.png": PNG + b"pagina-dois",
        "1.png": PNG + b"pagina-um",
        "sub/3.jpg": PNG + b"pagina-tres",
        "leiame.txt": b"nao e imagem",
    }
    caminho = tmp_path / "capitulo.cbz"
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, dados in conteudos.items():
            z.writestr(nome, dados)

    resultado, saida = _roda(caminho)
    assert resultado.returncode == 0, resultado.stderr
    assert saida["ok"] is True

    nomes = [p["nome"] for p in saida["paginas"]]
    assert nomes == ["1.png", "2.png", "10.png", "sub/3.jpg"]
    assert "leiame.txt" not in nomes

    por_nome = {p["nome"]: p for p in saida["paginas"]}
    assert por_nome["1.png"]["sha"] == _sha(conteudos["1.png"])
    assert por_nome["10.png"]["sha"] == _sha(conteudos["10.png"])
    assert por_nome["sub/3.jpg"]["tipo"] == "image/jpeg"


def test_extrai_arquivos_sem_compressao(tmp_path):
    dados = PNG + b"stored"
    caminho = tmp_path / "sem-compressao.zip"
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_STORED) as z:
        z.writestr("pagina.png", dados)

    resultado, saida = _roda(caminho)
    assert resultado.returncode == 0, resultado.stderr
    assert saida["ok"] is True
    assert saida["paginas"][0]["sha"] == _sha(dados)


def test_recusa_zip_sem_imagens(tmp_path):
    caminho = tmp_path / "texto.zip"
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("leiame.txt", b"sem imagens")

    resultado, saida = _roda(caminho)
    assert resultado.returncode != 0
    assert saida["ok"] is False
    assert "imagens" in saida["erro"].lower()


def test_recusa_arquivo_invalido(tmp_path):
    caminho = tmp_path / "quebrado.cbz"
    caminho.write_bytes(b"isto nao e um zip")

    resultado, saida = _roda(caminho)
    assert resultado.returncode != 0
    assert saida["ok"] is False


def test_index_carrega_modulos_de_publicacao():
    html = (RAIZ / "index.html").read_text(encoding="utf-8")
    for arquivo in ("publicacao.css", "publicacao.js", "zip-leitor.js"):
        assert arquivo in html, f"{arquivo} não está referenciado no index.html"


def test_publicacao_envia_para_storage_e_tabelas():
    js = (RAIZ / "publicacao.js").read_text(encoding="utf-8")
    assert "storage.from('pages').upload" in js
    assert "from('chapters')" in js
    assert "from('pages')" in js
    assert "is_published" in js
    assert "ehStaff" in js


def test_service_worker_nao_cacheia_api():
    sw = (RAIZ / "sw.js").read_text(encoding="utf-8")
    assert "authorization" in sw
    assert "/^\\/(api|rest|auth|storage)\\//i" in sw
    assert "no-store" in sw
