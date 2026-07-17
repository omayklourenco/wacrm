# Auditoria RLS

**Ciclo:** 000-R  
**Método:** revisão estática das migrations (Supabase CLI **não instalado** neste host — catálogo `pg_policies` não consultado dinamicamente).

## Matriz (síntese)

| Tabela | RLS | SELECT | INSERT | UPDATE | DELETE | Risco |
|--------|-----|--------|--------|--------|--------|-------|
| accounts | Sim | member | (trigger/RPC) | admin+ | — | Baixo |
| profiles | Sim | self/colegas | self | self+trigger 034 | — | Baixo pós-034 |
| account_invitations | Sim | admin+ | admin+ | admin+ | admin+ | Baixo |
| contacts | Sim | member | agent+ | agent+ | agent+ | Baixo |
| conversations/messages | Sim | member | agent+ / join | agent+ | agent+ | Médio (service role webhook) |
| whatsapp_config | Sim | member | admin+ | admin+ | admin+ | Baixo |
| pipelines/deals | Sim | member | admin/agent | … | … | Baixo |
| broadcasts | Sim | member | agent+ | agent+ | agent+ | Baixo |
| automations/flows | Sim | member | agent+ | agent+ | agent+ | Baixo |
| api_keys / webhook_endpoints | Sim | viewer+ | admin+ | admin+ | admin+ | Baixo |
| ai_* | Sim | viewer+/admin | admin+ | admin+ | admin+ | Baixo pós-032 |
| automation_pending_executions | Sim | sem policy client | — | — | — | Intencional |
| storage flow/chat | Sim | **público** | member path | member | member | Médio (URL leak) |

## Policies críticas (histórico)

| Finding | Status |
|---------|--------|
| Escalação `profiles.account_role` / `account_id` via UPDATE | **Mitigado em 034** |
| KB RPCs DEFINER com `p_account_id` arbitrário | **Mitigado em 032** (INVOKER) |
| Helper `is_account_member` DEFINER | OK com search_path |

## Testes mínimos (status)

| # | Cenário | Status neste ciclo |
|---|---------|-------------------|
| 1–10 | Cross-account / roles / invite / API | **Não executados em Supabase local** (CLI ausente) |
| Unit | HMAC, encrypt, RBAC, API key hash | **Adicionados** em `src/lib/security/isolation-guards.test.ts` |

## Cross-tenant

- **Via RLS autenticado:** não confirmado vazamento após 032/034 (revisão estática).
- **Via service-role:** riscos residuais documentados em `SERVICE_ROLE_AUDIT.md` e `META_WHATSAPP_AUDIT.md` (status update por `message_id`; media proxy).

## Quantidades (estimativa estática)

- Tabelas public de domínio com RLS: **~30+**
- Policies: dezenas (padrão 4 por tabela parent + joins)
- Tabelas sensíveis sem RLS: **nenhuma** nas migrations finais (pending executions sem policies = deny authenticated)

## Ciclo 003-R — Platform control plane

- Tabelas novas: `platform_admins`, `platform_audit_logs` (RLS deny-by-default para authenticated).
- `accounts.platform_status` — suspensão de organização.
- Após `db reset` local (039): **39** tabelas com RLS, **105** policies.
- Tenant **não** lê platform tables; audit append-only.
- Smoke: `scripts/rls-platform-admin-smoke.sql` + regressão multi-account.
