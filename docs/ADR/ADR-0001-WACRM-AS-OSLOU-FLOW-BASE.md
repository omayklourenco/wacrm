# ADR-0001 — WACRM como base técnica do Oslou Flow

## Status

Aceito — Ciclo 000-R (2026-07-17)

## Contexto

O Oslou Flow legado (`omayklourenco/oslou-flow`) evoluiu como monorepo Next.js + NestJS + Postgres + Redis + WhatsApp Cloud + Baileys. Em paralelo, o fork `omayklourenco/wacrm` (upstream `ArnasDon/wacrm`) oferece um CRM WhatsApp maduro sobre Next.js 16 + Supabase, alinhado à API oficial da Meta.

Manter duas arquiteturas e tentar fundi-las aumenta custo e risco. A decisão é adotar o WACRM como fundação e tratar o monorepo anterior como legado.

## Decisão

1. O fork **`omayklourenco/wacrm`** passa a ser a **nova fundação técnica** do Oslou Flow.
2. O projeto anterior **não** será fundido diretamente nesta base.
3. A arquitetura anterior fica preservada como **legado e referência** (tag `legacy/pre-wacrm`).
4. Funcionalidades específicas do legado podem ser migradas **futuramente**, se não existirem no WACRM.
5. MVP segue a arquitetura **nativa WACRM** (Next.js + Supabase Auth/Postgres/Storage/RLS).
6. Integração WhatsApp principal = **API oficial Meta** (sem Baileys/QR na linha principal).
7. NestJS / Redis / workers externos só com **necessidade operacional comprovada**.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|-------------|--------------------|
| Continuar só no monorepo legado | Baileys + Redis + Nest aumentam complexidade para MVP Meta-first |
| Merge arquitetural legado ↔ WACRM | Alto risco, baixo aproveitamento |
| Reescrever do zero | Desperdício da maturidade WACRM (inbox, Meta, RLS, API, MCP) |

## Consequências

### Positivas

- Stack unificada e alinhada à Meta Cloud API.
- RLS + `account_id` como isolamento nativo.
- Tempo menor para MVP operacional (inbox, contatos, pipelines, broadcasts).

### Negativas / trabalho necessário

- Membership 1 conta por usuário (sem multi-org switch) — gap SaaS.
- Sem Super Admin, planos, billing, units.
- Features legado (QR, Redis, Stripe) precisam ser reavaliadas ciclo a ciclo.
- Rebranding gradual (identidade Oslou Flow sem quebrar IDs técnicos `wacrm_*`).

## Legado

Ver `docs/LEGACY_OSLOU_FLOW_PRESERVATION.md`.

## Licença

WACRM é **MIT** (Copyright Arnas Donauskas). O aviso e o arquivo `LICENSE` devem ser preservados. Uso comercial permitido com preservação do copyright notice.

## Estratégia de evolução

1. Ciclo 000-R — auditoria e adoção (este ADR).
2. Blindagem multiempresa / gaps de isolamento.
3. Onboarding SaaS (organizações / membership N:N se necessário).
4. Planos, limites, Super Admin, billing.
5. Migração seletiva de diferenciais do legado.
