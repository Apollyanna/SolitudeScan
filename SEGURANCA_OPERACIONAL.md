# Segurança operacional — SolitudeScan

Procedimentos que não vivem no código. Cada item indica **quem faz** (proprietário do projeto) e **como comprovar**.

---

## 1. Backups e recuperação (requisito 31)

| Item | Procedimento |
|---|---|
| Backup automático | Supabase → Settings → Database → Backups. No plano gratuito há backup diário com retenção curta; planos pagos oferecem PITR (restauração por ponto no tempo). |
| Frequência mínima | Diária. Para PITR, retenção ≥ 7 dias. |
| Teste de restauração | Trimestral: restaurar em um projeto de staging e conferir `profiles`, `works`, `chapters`, `payment_requests`. |
| Evidência | Guardar print da tela de backups com data e o registro do teste de restauração. |
| Arquivos de storage | Capas/páginas ficam no Storage; replicar o conteúdo periodicamente (`supabase storage cp`) para backup externo. |

**Nunca** teste restauração em produção.

---

## 2. Retenção de dados (requisito 19)

| Dado | Retenção | Ação ao fim do prazo |
|---|---|---|
| Conta, perfil, favoritos, histórico | Enquanto a conta existir | Excluir em cascade na exclusão da conta |
| Solicitações de exclusão | 30 dias após a conclusão | Anonimizar/expurgar |
| Comentários e avaliações | Enquanto a obra existir ou até o titular pedir remoção | Remover ou anonimizar autoria |
| Pagamentos (`payment_requests`) | 5 anos (obrigação fiscal/civil) | Expurgar dados pessoais mantendo o registro contábil |
| `security_events` (logs) | 12 meses | Expurgar rotineiramente |
| Denúncias (`reports`) | 12 meses após resolução | Expurgar |
| Mensagens de contato/denúncia | 12 meses | Expurgar |

Implementação sugerida (executar manualmente, revisando antes):

```sql
-- Exemplo: expurgar eventos de segurança com mais de 12 meses.
delete from public.security_events where criado_em < now() - interval '12 months';
```

---

## 3. Resposta a incidentes (requisitos 34 e 35)

1. **Detectar e conter** — identificar o vetor; se houver chave exposta, revogar no Supabase (Settings → API) e girar o segredo; se houver conta comprometida, forçar logout global (Auth → Users → Sign out all).
2. **Registrar** — abrir um registro com data/hora, sistemas afetados, dados envolvidos e ações. Registrar também em `security_events`.
3. **Avaliar risco** — dados pessoais? quantos titulares? risco de dano relevante?
4. **Notificar** — se houver risco relevante: comunicar titulares afetados e a ANPD em até **3 dias úteis**, com descrição do incidente, dados envolvidos, medidas técnicas adotadas e canais de contato (LGPD art. 48; Resolução CD/ANPD nº 15/2024).
5. **Corrigir** — aplicar a correção, rodar os testes e confirmar que o vetor está fechado.
6. **Aprender** — atualizar este documento e a lista de verificação de lançamento.

Contato de segurança: `solitudescanoficial@gmail.com`.

---

## 4. Gestão de vulnerabilidades (requisito 39)

| Cadência | Ação |
|---|---|
| A cada alteração de dependência | Rodar a varredura de dependências (OSV) e revisar achados altos/críticos |
| Mensal | Conferir advisories do Supabase e do `supabase-js`; revisar dependências de CDN |
| Trimestral | Reexecutar `VERIFICAR_SEGURANCA_SUPABASE.sql` e revisar políticas de RLS |
| Anual | Revisão completa dos 40 requisitos deste repositório (`AUDITORIA_SEGURANCA.md`) |

Prioridade: crítico → corrigir antes de qualquer publicação; alto → 7 dias; médio → 30 dias; baixo → próximo ciclo.

---

## 5. Privilégios administrativos (requisito 38)

- `is_admin` é concedido **somente** por SQL manual no Supabase, nunca pela interface.
- Trigger `protect_profile_fields` impede que o próprio usuário altere `is_admin`, `is_vip`, `vip_expires_at` e o plano.
- Revisar a lista de admins a cada 90 dias:

```sql
select id, display_name, created_at from public.profiles where is_admin = true;
```

- Toda concessão/revogação deve ser registrada em `security_events`.

---

## 6. Operadores de dados (requisito 20)

| Operador | Dados | Instrumento |
|---|---|---|
| Supabase | Conta, banco, imagens, logs de autenticação | Aceitar o DPA do Supabase na conta do projeto e arquivar a versão aceita |
| Provedor de e-mail (SMTP) | E-mail, mensagens transacionais | Contrato/termos com cláusula de tratamento de dados |
| Provedor de hospedagem do site | IPs, logs de acesso | Termos de hospedagem |

Sem esses instrumentos arquivados, o requisito 20 permanece **PARCIAL**, mesmo com a política publicada.

---

## 7. Checklist antes de cada publicação

- [ ] Migrações aplicadas e `VERIFICAR_SEGURANCA_SUPABASE.sql` sem tabela sem RLS
- [ ] Backup recente confirmado
- [ ] Cadastro, login, recuperação de senha e logout testados
- [ ] Comentário, favorito, avaliação e denúncia testados
- [ ] Pix: valor correto, aprovação só após conferir extrato, VIP expirando corretamente
- [ ] Páginas legais com data de atualização revisada
- [ ] Teste em celular (390 px) e desktop
- [ ] Nenhum segredo novo no repositório
