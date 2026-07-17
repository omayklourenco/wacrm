# Gaps SaaS — readiness

**Ciclo:** 000-R (sem implementar billing)

## Capabilidades

| Capacidade | Suportada hoje? |
|------------|-----------------|
| Múltiplas organizações na instância | Sim (muitas accounts) |
| Múltiplos membros por org | Sim |
| Usuário em múltiplas orgs | **Não** |
| Múltiplos números WhatsApp / account | **Não** (1 config) |
| Plan / Subscription / Entitlements | **Não** |
| Usage metering (parcial) | AI usage log only |
| Limits por plano | **Não** |
| Trials / Suspension | **Não** |
| Billing status | **Não** |
| Platform administration | **Não** |
| Auditoria plataforma | **Não** |

## Limites futuros desejados

Usuários, equipes, números WA, contatos, mensagens, campanhas, automações, funis, IA, API, storage — **todos exigem camada nova** de entitlements.

## Rate limit atual

In-memory por processo — inadequado para multi-instância SaaS sem Redis/Upstash (só quando necessário operacionalmente).
