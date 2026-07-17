# Ciclo 001-R — Blindagem multiempresa e isolamento service-role

**Data:** 2026-07-17  
**Caminho:** **B** (blindagem principal concluída; membership multi-account documentada) + testes RLS dinâmicos **OK**

## Diretório / repo

- Executado em `D:\SISTEMAS\wacrm`
- `omayklourenco/wacrm` ← upstream `ArnasDon/wacrm`
- Branch: `security/multitenancy-hardening-cycle-001-r` (baseada em `stabilization/wacrm-adoption-cycle-000-r`)
- Base 000-R **não** mergeada em `main` (main ainda em `b24aa79`)

## Correções

1. **Meta status** — resolve `phone_number_id` → account **antes** de updates; messages/broadcast_recipients filtrados por `account_id`.
2. **Media proxy** — exige sessão + mensagem com `media_url` na account do caller; 404 genérico; cache private.
3. **Signup órfão** — `handle_new_user` sem `EXCEPTION WHEN OTHERS`; falha aborta o insert em `auth.users`.
4. **Repair** — `repair_orphan_user_account(uuid)` só `service_role`.
5. **DEFINER grants** — `record_webhook_failure`, `recompute_broadcast_counts`, `touch_presence` endurecidos.
6. **Table GRANTs** — `authenticated`/`service_role` recebem DML necessário (local reset estava sem SELECT).
7. **Invite Host** — `resolveInviteBaseUrl` + `ALLOWED_APP_ORIGINS`; Host malicioso rejeitado.
8. **`requireAccountContext`** — valida `requestedAccountId` vs membership.
9. **Flows admin writes** — `.eq('account_id', accountId)` em update/delete service-role.
10. **ADR-0002** — multi-account membership adiada ao 002-R.

## Migration

`supabase/migrations/037_multitenancy_service_role_hardening.sql` — aplicada com `supabase db reset` local.

## Testes

- Vitest: **671** passed (70 files)
- RLS smoke: `scripts/rls-cross-account-smoke.sql`
  - user A vê 1 contato
  - user A **não** vê contato B
  - update cross-account = 0 rows; nome B intacto
- Catálogo local: **36** tabelas RLS on, **0** off, **102** policies

## Riscos remanescentes

- Membership ainda 1:1 (ADR-0002)
- Rate limit in-memory
- Storage flow/chat público by design
- Alguns engines service-role ainda dependem de disciplina de filtros (defense-in-depth melhorada, não reescrita total)

## Próximo ciclo

**002-R — Onboarding SaaS e organizações (membership N:N)**
