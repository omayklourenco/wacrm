# Backlog de rebuild — Oslou Flow sobre WACRM

**Ciclo origem:** 000-R  
**Ordem reordenada pelos findings** (segurança antes de feature SaaS).

> **Status após 002-R:** 001-R (blindagem) e 002-R (membership N:N, onboarding,
> troca de contexto) concluídos. **Próximo ciclo recomendado: 003-R — Planos,
> limites e billing (module gating)**; alternativa: limpeza do espelho legado
> `profiles.account_id/account_role` + UI de gestão de membros/convites multi-org.

---

## Ciclo 001-R — Blindagem multiempresa e isolamento service-role

- **Objetivo:** eliminar riscos residuais cross-tenant (status Meta, media proxy, GRANTs DEFINER, middleware).
- **Dependências:** 000-R
- **Risco:** Alto se ignorado em produção multi-tenant
- **Aceite:** updates de status escopados; media autorizada por conta; testes RLS locais; sem IDOR óbvio
- **Fora:** billing, Super Admin, redesign UI

## Ciclo 002-R — Onboarding SaaS e organizações

- **Objetivo:** onboarding idempotente; decisão membership N:N; criação org controlada
- **Dependências:** 001-R
- **Risco:** Médio (migração de modelo)
- **Aceite:** signup sem órfãos; convites sólidos; doc de tenant
- **Fora:** units completas, billing

## Ciclo 003-R — WhatsApp Meta onboarding e canais

- **Objetivo:** Embedded Signup / onboarding canal seguro; multi-número se necessário
- **Dependências:** 001-R
- **Risco:** Médio (Meta app review)
- **Aceite:** conectar test number sandbox; tokens só GCM; HMAC OK
- **Fora:** Baileys

## Ciclo 004-R — Super Admin da plataforma

- **Objetivo:** operador Oslou (orgs, suspensão, suporte)
- **Dependências:** 002-R
- **Risco:** Alto (privilégio global)
- **Aceite:** SA isolado de tenant RLS; audit log
- **Fora:** billing completo

## Ciclo 005-R — Planos, limites e entitlements

- **Objetivo:** Plan, limits, usage hooks
- **Dependências:** 002-R, 004-R
- **Risco:** Médio
- **Aceite:** enforce server-side por entitlement
- **Fora:** Stripe checkout (pode ser 006)

## Ciclo 006-R — Billing

- **Objetivo:** subscription / trial / suspension billing status
- **Dependências:** 005-R
- **Fora:** redesenho produto

## Ciclo 007-R — Inbox e operação multiatendente

- **Objetivo:** endurecer presença, assignment, UX Oslou
- **Dependências:** 001-R

## Ciclo 008-R — CRM, contatos e pipelines

- **Objetivo:** adaptação comercial Oslou

## Ciclo 009-R — Automações e webhooks

- **Objetivo:** UI webhooks; cron confiável; SSRF contínuo

## Ciclo 010-R — Campanhas e templates

- **Objetivo:** fix TODO upsert templates; campanhas estáveis

## Ciclo 011-R — IA e knowledge

- **Objetivo:** limites por plano; observabilidade custo

## Ciclo 012-R — API pública e MCP

- **Objetivo:** rate limit multi-instância; audit; scopes Oslou

## Ciclo 013-R — Auditoria, observabilidade e LGPD

## Ciclo 014-R — Staging e deploy controlado

---

## Próximo ciclo recomendado

**002-R — Onboarding SaaS e organizações (membership N:N)** — ver ADR-0002.

Status 001-R: concluído em `security/multitenancy-hardening-cycle-001-r` (ver `OSLOU_FLOW_CYCLE_001_R_MULTITENANCY_HARDENING_RESULTS.md`).
