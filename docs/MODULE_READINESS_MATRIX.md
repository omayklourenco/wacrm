# Matriz de readiness dos módulos

**Ciclo:** 000-R  
**Critério:** READY exige backend real + persistência + autorização + isolamento + fluxo completo — não apenas tela.

| Módulo | Status | Evidência | Risco | Ação recomendada |
|--------|--------|-----------|-------|------------------|
| Autenticação | READY | Supabase Auth + middleware + pages | Médio (sem Google OAuth) | Manter; adicionar providers depois |
| Onboarding | PARTIAL | Trigger `handle_new_user`; sem wizard WhatsApp | Alto se trigger falhar silenciosamente | Hardening trigger + wizard |
| Contas / accounts | READY | `accounts`, APIs members/invites | Médio (1 user ↔ 1 account) | Evoluir membership N:N |
| Usuários / profiles | READY | `profiles` + RLS 034 | Baixo pós-034 | Monitorar |
| Equipes (teams) | UNUSED | Sem entidade team | — | Avaliar units/teams no backlog |
| Papéis | READY | owner/admin/agent/viewer + RLS | Baixo | Documentar matriz RBAC |
| Inbox | READY | UI + realtime Supabase + send API | Baixo | Operacional MVP |
| Conversas | READY | Schema + dedup 036 | Baixo | — |
| Mensagens | READY | insert webhook + send | Médio (status por message_id) | Escopar status por account |
| Contatos | READY | CRUD + CSV + dedupe | Baixo | — |
| Etiquetas | READY | tags + contact_tags | Baixo | — |
| Campos personalizados | READY | custom_fields | Baixo | — |
| Funil / Kanban | READY | pipelines + deals | Baixo | — |
| Campanhas / broadcasts | READY | broadcast-core + Meta templates | Médio (rate Meta) | — |
| Templates Meta | PARTIAL | Stack completa; TODO upsert user_id | Médio multi-membro | Corrigir conflito account |
| Automações | READY | engine + cron | Médio (cron externo) | Documentar cron staging |
| Flows | PARTIAL | Engine + UI; soft-GA; middleware incompleto | Médio | Incluir `/flows` no middleware |
| Webhooks outbound | PARTIAL | API v1 + deliver; sem UI Settings | Médio | UI + audit |
| Dashboard | READY | queries agregadas | Baixo escala | — |
| IA | READY | draft/auto-reply BYO key | Médio custo | Limites por plano |
| Base de conhecimento | READY | FTS + embeddings opcional | Baixo pós-032 | — |
| API pública | READY | `/api/v1` + scopes | Médio (disciplina accountId) | Testes IDOR contínuos |
| MCP | READY | mcp-server read-only default | Médio (key no env) | Flags writes restritas |
| Configurações | READY | settings tabs | Baixo | — |
| WhatsApp Meta | READY | Cloud API + HMAC + encrypt | Médio (media proxy) | Blindar media por conta |
| Storage | READY | 3 buckets | Médio (público flow/chat) | Signed URLs futuras |
| Auditoria | PARTIAL | logs por domínio; sem SA audit | Alto SaaS | Ciclo auditoria |
| Limites / planos | UNUSED | rate-limit in-memory | Alto SaaS | Ciclo entitlements |
| Billing | UNUSED | — | — | Ciclo billing |
| Admin plataforma | UNUSED | — | — | Ciclo Super Admin |

## Resumo

- **READY:** autenticação, accounts, users, roles, inbox, conversas, mensagens, contatos, tags, custom fields, pipelines, broadcasts, automations, dashboard, AI, knowledge, public API, MCP, settings, WhatsApp Meta, storage
- **PARTIAL:** onboarding, teams (como members), templates Meta, flows, webhooks outbound, audit, limits (técnico)
- **MOCKED:** nenhum módulo de produto inteiro mockado
- **BROKEN:** nenhum bloqueio total no código estático; gates locais OK após fix de testes locale
- **UNUSED:** billing, Super Admin, teams como entidade, Baileys
