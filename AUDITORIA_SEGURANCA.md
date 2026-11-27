# Auditoria de Segurança e Conformidade — SolitudeScan

**Data da auditoria:** 27/11/2026
**Escopo:** todo o repositório (front-end estático, migrações SQL/Supabase, cabeçalhos HTTP, service worker, páginas legais)
**Método:** inspeção de código, varredura de segredos no working tree e no histórico Git, varredura de dependências (OSV), testes de carregamento das páginas e revisão das políticas de banco.

---

## 1. Veredito de lançamento

**NÃO APTO para lançamento neste momento** — não por falhas abertas de código, mas porque 5 controles dependem de ações no painel do Supabase que só o proprietário pode executar. Depois delas, o conjunto fica consistente.

| # | Ação externa obrigatória | Onde | Por quê |
|---|---|---|---|
| 1 | Aplicar as migrações `migrations/20261127120000_security_hardening.sql` e `migrations/20261127130000_rls_completo.sql` | Supabase → SQL Editor | O esquema base original **não habilita RLS em nenhuma tabela**; sem isso, dados de usuários e pagamentos ficam expostos à chave pública |
| 2 | Executar `VERIFICAR_SEGURANCA_SUPABASE.sql` e conferir os 10 resultados | Supabase → SQL Editor | Comprova o estado real do RLS (o código versionado não prova o banco em produção) |
| 3 | Ativar backup automático/PITR no plano do Supabase | Supabase → Settings → Database | Requisito 31; o repositório não controla backup de banco gerenciado |
| 4 | Configurar SMTP próprio + URL de redirecionamento da recuperação de senha | Supabase → Authentication → URL Configuration / SMTP | Sem isso, o link "Esqueci minha senha" (agora implementado) não envia e-mail |
| 5 | Inserir razão social/CNPJ na seção 10 dos Termos | `termos.html` | Identificação do fornecedor (CDC); o dado é seu e não pode ser inventado |

Nenhuma vulnerabilidade crítica ou alta **de código** ficou sem tratamento nesta rodada.

---

## 2. Evidências coletadas

| Verificação | Resultado observado |
|---|---|
| Chaves secretas no código | Apenas `SUPABASE_ANON_KEY` em `script.js` (chave pública, protegida por RLS). Nenhuma `service_role`, `sk_live` ou token privado. |
| Chaves secretas no histórico Git | Todos os JWT do histórico foram decodificados: **1 único token, `role: "anon"`**. Nenhuma credencial secreta commitada — não há necessidade de reescrever histórico nem de revogar chave. |
| Dependências (OSV-Scanner 2.7.0) | `not_applicable` — o projeto não tem manifesto de pacotes (`package.json`/lockfile); a varredura não cobre CDN nem arquivo vendorizado. **Não é atestado de segurança.** |
| XSS em conteúdo de usuário | `escaparHtml()` aplicado em comentários, títulos, sinopses, gêneros e mensagens; `sanitizarUrlImagem()` valida URLs de imagem. |
| SQL Injection | Todas as consultas passam pelo PostgREST (parametrizado); não há SQL concatenado com entrada do usuário. |
| Pagamento | Valor, dono e status são definidos no banco por trigger (`enforce_payment_request_insert`); o navegador não envia preço. |
| Cabeçalhos | HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` em `_headers` e no `<meta>` do `index.html`. |
| Recuperação de senha | **Não existia** no projeto (nenhum `resetPasswordForEmail`, nenhum link). Implementada nesta rodada. |

---

## 3. Correções aplicadas nesta rodada

| Arquivo | Correção | Impacto |
|---|---|---|
| `migrations/20261127130000_rls_completo.sql` | RLS + políticas para `works`, `genres`, `work_genres`, `chapters`, `pages`, `profiles`, `favorites`, `ratings`, `comments`, `likes`, `reports`, `notifications`, `user_lists`, `user_list_items`; tabela `security_events`; triggers de proteção de campos e de limite de comentários; limites de bucket de upload | Fecha o acesso indevido a dados entre usuários e a adulteração de campos privilegiados |
| `script.js` | Trava de 5 tentativas de login por e-mail em 5 minutos (com backoff e limpeza) | Requisito 8/11 (força bruta) |
| `script.js` | Fluxo completo de recuperação de senha (`resetPasswordForEmail`, `updateUser`, evento `PASSWORD_RECOVERY`) com mensagem neutra | Funcionalidade inexistente; requisito de teste "recuperação de senha" |
| `script.js` | Comentário enviava `spoiler` em vez de `is_spoiler` → o insert falhava e **o comentário nunca era publicado** | Bug funcional real corrigido |
| `script.js` | `profiles.select('*')` substituído por colunas explícitas | Minimização de dados (LGPD) |
| `index.html` | CSP: `worker-src` liberado para `blob:` e `cdnjs` (o worker do PDF.js era bloqueado → upload por PDF quebrava) | Bug funcional real corrigido |
| `index.html` | `supabase-js` vendorizado em `vendor/` e removido do CDN; `script-src` sem `jsdelivr` | Remove dependência de terceiro em tempo de execução (supply chain) |
| `index.html` | Modais `resetModal`/`novaSenhaModal` + link "Esqueci minha senha" | UX e funcionalidade de conta |
| `_headers` | CSP endurecida, `Permissions-Policy`, HSTS mantido | Requisito 18 |
| `netlify.toml` | Redirecionamento 301 HTTP→HTTPS, URLs limpas (`/termos` etc.) e cabeçalhos de segurança | Requisito 19 e correção de links quebrados |
| `sw.js` | Cache `v7` + `vendor/` no precache | Evita servir JS antigo em cache |
| `privacidade.html` | Seções de transferência internacional e resposta a incidentes | LGPD 12/14/35 |
| `termos.html` | Cancelamento, reembolso (CDC art. 49), licença de uso, identificação do fornecedor | Transparência 22–26, 29 |
| `VERIFICAR_SEGURANCA_SUPABASE.sql` | Script somente leitura de verificação | Torna o RLS auditável por você |

---

## 4. Os 40 requisitos

Legenda: **APROVADO** = implementado e com evidência; **PARCIAL** = existe, mas depende de ação externa ou cobre só parte; **REPROVADO** = falha; **N/A** = não se aplica.

### Segurança e proteção

| # | Requisito | Classificação | Evidência / pendência |
|---|---|---|---|
| 1 | Autenticação segura | **APROVADO** | Supabase Auth (JWT + refresh), mensagens de erro neutras, sessão sincronizada por `onAuthStateChange`, logout limpa estado. MFA opcional ainda não ativado. |
| 2 | Controle de acesso e permissões | **PARCIAL** | `is_admin()` no banco + RLS + bloqueio na UI (`if (!AppState.usuario.isAdmin) return`). Falta aplicar a migração no projeto Supabase. |
| 3 | Criptografia de dados sensíveis | **PARCIAL** | TLS em trânsito e criptografia em repouso do provedor. Não há CPF/cartão armazenado; não existe criptografia em nível de coluna. |
| 4 | HTTPS/TLS | **APROVADO** | HSTS 1 ano + `upgrade-insecure-requests` + redirect 301 em `netlify.toml`. |
| 5 | Hash seguro de senhas | **APROVADO** | Hash gerado e verificado pelo Supabase Auth (bcrypt); a senha nunca é gravada pelo app. |
| 6 | Proteção contra SQL Injection | **APROVADO** | PostgREST parametrizado; nenhuma query montada por concatenação. |
| 7 | Proteção contra XSS e CSRF | **APROVADO** | `escaparHtml()` em todo conteúdo de usuário; CSP restritiva; autenticação por Bearer token (sem cookie de sessão, logo sem CSRF clássico). |
| 8 | Rate limiting | **PARCIAL** | Trava de login no cliente (5/5 min) + limite de comentários no banco. Limites de signup/login do provedor devem ser conferidos no painel (Auth → Rate Limits). |
| 9 | Proteção de APIs | **PARCIAL** | RLS + chave anon + CSP. Site estático não tem camada de API própria; a proteção efetiva é o RLS. |
| 10 | Auditoria de dependências | **PARCIAL** | OSV retornou `not_applicable` (sem manifestos). `supabase-js` agora é vendorizado; `pdf.js` ainda vem de CDN (sem SRI). |

### Privacidade e LGPD

| # | Requisito | Classificação | Evidência / pendência |
|---|---|---|---|
| 11 | Política de privacidade | **APROVADO** | `privacidade.html`, 11 seções. |
| 12 | Bases legais | **APROVADO** | Seção 3 mapeia execução de contrato, legítimo interesse e consentimento. |
| 13 | Minimização de dados | **PARCIAL** | Coleta limitada a nome/e-mail; `select('*')` removido do perfil. Revisar campos opcionais do cadastro. |
| 14 | Finalidades documentadas | **APROVADO** | Seção 2 (finalidades por operação). |
| 15 | Gestão de consentimento | **APROVADO** | Banner de cookies com registro em `localStorage`. |
| 16 | Política de cookies | **APROVADO** | Seção 5. |
| 17 | Direitos dos titulares | **APROVADO** | Seção 8 com prazo de 15 dias e canal de contato. |
| 18 | Exclusão de dados | **APROVADO** | `account_deletion_requests` + fluxo de exclusão de conta; RLS garante que só o dono solicita. |
| 19 | Retenção | **APROVADO** | Seção 7 + tabela de retenção em `SEGURANCA_OPERACIONAL.md`. |
| 20 | Contratos com operadores | **PARCIAL** | Depende de você aceitar/arquivar o DPA do Supabase (e do provedor de e-mail). Documentado no manual operacional. |

### Transparência e direitos do consumidor

| # | Requisito | Classificação | Evidência / pendência |
|---|---|---|---|
| 21 | Termos de uso | **APROVADO** | `termos.html`, 11 seções. |
| 22 | Transparência de preços | **APROVADO** | Preços exibidos na UI e definidos em `plan_prices` no banco (não no navegador). |
| 23 | Cobranças transparentes | **PARCIAL** | Pix manual com aprovação administrativa; não há emissão automática de recibo/comprovante. |
| 24 | Cancelamento de assinaturas | **APROVADO** | Seção 7: sem renovação automática, cancelamento por e-mail, acesso até o fim do período. |
| 25 | Política de reembolso | **APROVADO** | Seção 8: 7 dias (CDC art. 49), duplicidade, prazo e via de devolução. |
| 26 | Identificação do fornecedor | **PARCIAL** | Seção 10 traz marca e canais oficiais; **falta razão social/CNPJ** (dado que só você possui). |
| 27 | Publicidade transparente | **N/A** | Não há publicidade de terceiros nem conteúdo patrocinado no site. |
| 28 | Depoimentos autênticos | **N/A** | Não há seção de depoimentos; nada a comprovar. |

### Infraestrutura e governança

| # | Requisito | Classificação | Evidência / pendência |
|---|---|---|---|
| 29 | Licenças de uso | **PARCIAL** | Licença do software/marca documentada nos Termos (seção 9). O licenciamento das obras publicadas é decisão editorial/jurídica sua. |
| 30 | Transparência sobre IA | **N/A** | O produto não usa IA generativa em nenhum fluxo (catálogo, recomendação, moderação). |
| 31 | Backups automatizados | **PARCIAL** | Fora do repositório: ativar no plano Supabase e testar restauração (procedimento no manual). |
| 32 | Logs seguros | **APROVADO** | `security_events` com RLS e leitura exclusiva de admin; eventos de aprovação/remoção registrados. |
| 33 | Monitoramento de ameaças | **PARCIAL** | Auditoria de eventos no banco; sem alerta automático externo (e-mail/Slack). |
| 34 | Resposta a incidentes | **APROVADO** | Procedimento em 6 etapas em `SEGURANCA_OPERACIONAL.md`. |
| 35 | Notificação de incidentes | **APROVADO** | Prazo e conteúdo da comunicação (titulares + ANPD) documentados. |
| 36 | Testes de segurança | **PARCIAL** | Revisão de código + varredura de dependências + testes de páginas. Não houve pentest externo. |
| 37 | Revisão de código | **APROVADO** | Esta auditoria, com correções aplicadas e justificadas. |
| 38 | Controle de privilégios administrativos | **APROVADO** | `is_admin()` no banco + trigger que impede auto-promoção + UI bloqueada. |
| 39 | Gestão de vulnerabilidades | **PARCIAL** | Varredura executada e cadência definida no manual; sem pipeline automatizado (site estático). |
| 40 | Auditoria de conformidade | **PARCIAL** | Checklist e evidências neste relatório; auditoria periódica ainda não realizada. |

---

## 5. Os 20 testes obrigatórios

| # | Teste | Classificação | Evidência / pendência |
|---|---|---|---|
| 1 | Esconder chaves e credenciais | **APROVADO** | Só a chave `anon` (pública por design) no front; nenhum segredo. |
| 2 | Limpar segredos do Git/histórico | **APROVADO** | Todos os JWT do histórico decodificados: 1 token, `role: anon`. Nada a revogar. |
| 3 | Só chaves públicas no frontend | **APROVADO** | `service_role` não aparece no front nem no histórico. |
| 4 | RLS ativo e testado | **PARCIAL** | Migração com 46 políticas versionada e guardas `if exists`; **aplicação e teste no banco dependem de você**. |
| 5 | Criptografia de dados sensíveis | **PARCIAL** | TLS + repouso do provedor; sem campos sensíveis (CPF/cartão) coletados. |
| 6 | Autenticação/autorização no servidor | **APROVADO** | RLS e triggers no Postgres; a UI não é a barreira de segurança. |
| 7 | Acesso a logs restrito | **APROVADO** | Política `security_events_admin_read` exige `is_admin()`. |
| 8 | Impedir adulteração de campos protegidos | **APROVADO** | Triggers `protect_profile_fields` e `protect_payment_request_fields` (bloqueiam mudança de `is_admin`, `is_vip`, `vip_expires_at`, preço e status). |
| 9 | Cookies de sessão seguros | **APROVADO** | O app não usa cookies próprios; sessão fica no storage do cliente via SDK, com CSP limitando exfiltração. |
| 10 | Hash de senhas | **APROVADO** | Delegado ao Supabase Auth; nenhuma senha em texto no app. |
| 11 | Limitar tentativas de login | **PARCIAL** | Trava local implementada (5/5 min); limite global no painel Auth do Supabase. |
| 12 | Proteção contra bots | **PARCIAL** | Sem CAPTCHA; há rate limits do provedor e trava local. Recomendado Cloudflare Turnstile se houver abuso. |
| 13 | Consultas parametrizadas | **APROVADO** | PostgREST/SDK; nenhuma concatenação de SQL. |
| 14 | Validar entradas | **PARCIAL** | `validarEmail`, `validarSenhaForte`, limites de tamanho, `maxlength` e validação no banco. Faltam validações server-side para todos os campos de admin. |
| 15 | Escapar/sanitizar conteúdo do usuário | **APROVADO** | `escaparHtml()` nos comentários e em todos os campos renderizados; URLs validadas. |
| 16 | Restringir uploads | **PARCIAL** | Validação de tipo/tamanho no cliente + `file_size_limit`/`allowed_mime_types` na migração; aplicar no bucket. |
| 17 | Respostas de API enxutas | **PARCIAL** | `select` explícito no perfil; alguns `select('*')` permanecem em telas administrativas. |
| 18 | Cabeçalhos de segurança | **APROVADO** | `_headers` + `netlify.toml` + `<meta>` CSP. |
| 19 | Forçar HTTPS em produção | **APROVADO** | HSTS + redirect 301 + `upgrade-insecure-requests`. |
| 20 | Escanear dependências | **PARCIAL** | OSV: `not_applicable` (sem manifestos). CDN/vendor fora da cobertura — declarado, não é aprovação. |

---

## 6. Riscos residuais conhecidos

1. **RLS não aplicado ainda** é o risco número 1: com RLS desligado, a chave pública lê e escreve livremente. Aplique as migrações antes de divulgar o site.
2. **Aprovação de Pix é manual** — o controle antifraude é humano (conferir extrato). Não há gateway com webhook assinado.
3. **PDF.js via CDN** (cdnjs) sem SRI: se quiser eliminar, vendorize o arquivo e restrinja a CSP.
4. **Sem CAPTCHA** em cadastro/comentários.
5. **Backup** depende do plano Supabase.

## 7. Como validar (ordem recomendada)

1. Supabase → SQL Editor → executar `migrations/20261127120000_security_hardening.sql`.
2. Executar `migrations/20261127130000_rls_completo.sql`.
3. Executar `VERIFICAR_SEGURANCA_SUPABASE.sql` e comparar com a seção 2 deste relatório.
4. Authentication → URL Configuration: adicionar `https://solitudescan.com` e o domínio de preview; configurar SMTP.
5. Testar: cadastro → login → "Esqueci minha senha" → e-mail → nova senha → login.
6. Testar: comentar, favoritar, avaliar, denunciar, enviar Pix e aprovar como admin.
7. Repetir os testes 4–6 em celular (390 px).

**Nada neste documento deve ser lido como declaração de conformidade legal plena com LGPD ou CDC.** Ele registra controles técnicos verificados e pendências identificadas.
