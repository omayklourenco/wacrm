# Gaps SaaS — readiness

**Ciclo:** 000-R (sem implementar billing)

## Capabilidades

| Capacidade | Suportada hoje? |
|------------|-----------------|
| Múltiplas organizações na instância | Sim (muitas accounts) |
| Múltiplos membros por org | Sim |
| Usuário em múltiplas orgs | **Sim** (002-R) |
| Múltiplos números WhatsApp / account | **Não** (1 config) |
| Plan / Subscription / Entitlements | Placeholders apenas (003-R) |
| Usage metering (parcial) | AI usage log only |
| Limits por plano | **Não** |
| Trials / Suspension | Suspensão org **Sim** (003-R); trial **Não** |
| Billing status | **Não** |
| Platform administration | **Sim** (003-R `/super-admin`) |
| Auditoria plataforma | **Sim** (`platform_audit_logs`) |

## Limites futuros desejados

Usuários, equipes, números WA, contatos, mensagens, campanhas, automações, funis, IA, API, storage — **todos exigem camada nova** de entitlements.

## Rate limit atual

In-memory por processo — inadequado para multi-instância SaaS sem Redis/Upstash (só quando necessário operacionalmente).
