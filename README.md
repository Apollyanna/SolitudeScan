# SolitudeScan

Plataforma de leitura de manhwas, mangás e manhuás: catálogo, leitor de capítulos, favoritos, histórico, comentários, avaliações, planos VIP via Pix e painel administrativo.

Site estático (HTML + CSS + JavaScript) com Supabase como backend (autenticação, banco Postgres com RLS e storage de imagens).

## Estrutura

```
index.html                 aplicação principal (SPA de página única)
style.css                  identidade visual
script.js                  lógica do app (Supabase, leitor, admin, Pix)
vendor/                    dependências fixadas localmente (supabase-js)
termos.html                Termos de Uso
privacidade.html           Política de Privacidade
contato.html               Contato
denuncia.html              Canal de denúncia (DMCA/abuso)
404.html                   Página de erro
sw.js                      Service worker (PWA, cache versionado)
_headers / netlify.toml    Cabeçalhos de segurança, HTTPS e URLs limpas
migrations/                SQL versionado (RLS, triggers, auditoria)
VERIFICAR_SEGURANCA_SUPABASE.sql   verificação somente leitura do banco
AUDITORIA_SEGURANCA.md     auditoria dos 40 requisitos e 20 testes
SEGURANCA_OPERACIONAL.md   backups, retenção, incidentes, vulnerabilidades
```

## Configuração

O app usa apenas a chave **pública** (`anon`) do Supabase em `script.js` — ela é protegida por RLS. A chave `service_role` nunca deve entrar no repositório.

## Ordem de aplicação no Supabase

Execute no **SQL Editor**, nesta ordem:

1. `migrations/20261127120000_security_hardening.sql` — pagamentos, preços no banco, RLS de cobranças.
2. `migrations/20261127130000_rls_completo.sql` — RLS e políticas de todas as tabelas, `security_events`, proteção de campos e limites de upload.
3. `VERIFICAR_SEGURANCA_SUPABASE.sql` — confira que **nenhuma** tabela aparece sem RLS.

Depois, em **Authentication → URL Configuration**, cadastre o domínio do site e o `redirectTo` usado na recuperação de senha; configure SMTP para os e-mails saírem.

## Funcionalidades verificadas

- Cadastro, login, logout e **recuperação de senha** (link por e-mail → nova senha)
- Catálogo, busca, filtros por gênero/tipo/status
- Leitor de capítulos (imagens e PDF) com navegação e progresso
- Favoritos, biblioteca pessoal e histórico de leitura
- Comentários (com spoiler e respostas), avaliações e curtidas
- Denúncias e notificações
- Painel administrativo: obras, capítulos, páginas, usuários, pagamentos e denúncias
- Planos VIP via Pix com valor definido no banco e aprovação manual

## Segurança

- RLS em todas as tabelas; admin verificado no banco por `is_admin()`
- Preço, dono e status do pagamento definidos por trigger — o navegador não decide valor
- Triggers impedem alteração de `is_admin`, `is_vip`, `vip_expires_at` e status de pagamento
- Conteúdo de usuário escapado (`escaparHtml`) e URLs de imagem validadas
- CSP, HSTS, `X-Frame-Options`, `nosniff` e `Permissions-Policy`
- Trava de tentativas de login e limite de comentários por usuário
- Dependência de CDN do Supabase removida (vendorizada)

Relatório completo e pendências externas: `AUDITORIA_SEGURANCA.md`.

## Desenvolvimento local

```bash
python3 -m http.server 3000
# abra http://127.0.0.1:3000
```
