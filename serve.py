#!/usr/bin/env python3
"""Servidor estático do SolitudeScan.

Responsabilidades:
1. Servir os arquivos do site sem depender de plataforma específica.
2. Resolver URLs limpas usadas nos links do site (/termos, /privacidade,
   /contato, /denuncia, /404) para os arquivos .html correspondentes.
3. Aplicar os cabeçalhos de segurança também na resposta HTTP (o arquivo
   _headers cobre apenas provedores que o interpretam, como a Netlify).
"""

import os
import posixpath
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.abspath(__file__))

CABECALHOS_SEGURANCA = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
        "img-src 'self' https: data: blob:; "
        "media-src 'self' https: blob:; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "worker-src 'self' blob: https://cdnjs.cloudflare.com; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    ),
}

# Rotas amigáveis -> arquivo real.
URLS_LIMPA = {
    "/termos": "termos.html",
    "/privacidade": "privacidade.html",
    "/contato": "contato.html",
    "/denuncia": "denuncia.html",
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        for nome, valor in CABECALHOS_SEGURANCA.items():
            self.send_header(nome, valor)
        # HTML e JS sempre revalidados; assets versionados podem cachear.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def translate_path(self, path):
        caminho = super().translate_path(path)
        if not os.path.exists(caminho) or os.path.isdir(caminho):
            alvo = URLS_LIMPA.get(path.split("?")[0].rstrip("/"))
            if alvo:
                return os.path.join(RAIZ, alvo)
            if os.path.isdir(caminho):
                indice = os.path.join(caminho, "index.html")
                if os.path.exists(indice):
                    return indice
        return caminho

    def _eh_pagina_404(self):
        return self.path.split("?")[0].rstrip("/") in ("/404", "/404.html")

    def do_GET(self):
        # A página de erro deve ser entregue com status 404 (e não 200),
        # tanto em acesso direto quanto como fallback de rota inexistente.
        if self._eh_pagina_404():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._eh_pagina_404():
            self.send_error(404)
            return
        super().do_HEAD()

    def log_message(self, formato, *args):
        # Não registra query strings nem IPs completos em produção.
        print("%s - %s" % (self.address_string(), formato % args), flush=True)

    def send_error(self, codigo, mensagem=None, explicacao=None):
        if codigo == 404:
            pagina = os.path.join(RAIZ, "404.html")
            if os.path.exists(pagina):
                with open(pagina, "rb") as arquivo:
                    corpo = arquivo.read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(corpo)
                return
        super().send_error(codigo, mensagem, explicacao)


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", "3000"))
    servidor = ThreadingHTTPServer(("0.0.0.0", porta), Handler)
    print("SolitudeScan servindo em 0.0.0.0:%d" % porta, flush=True)
    servidor.serve_forever()
