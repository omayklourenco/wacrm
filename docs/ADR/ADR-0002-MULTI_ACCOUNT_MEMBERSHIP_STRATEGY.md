# ADR-0002 — Estratégia de membership multi-account

## Status

Aceito (documentado) — Ciclo 001-R (2026-07-17)

## Contexto

O WACRM usa **one-account-per-user**: `profiles.account_id` NOT NULL + unique `accounts.owner_user_id`. Convites **movem** o usuário para outra account. O modelo Oslou Flow deseja membership N:N (um usuário em várias organizações com troca de contexto).

Alterar o schema neste ciclo de blindagem aumentaria risco sem entregar UI/experiência completa.

## Decisão

**Caminho documentado (não estrutural neste ciclo):**

1. Manter membership 1:1 operacional.
2. **Não** remover unique constraints neste ciclo.
3. **Não** criar tabela `account_members` neste ciclo.
4. Blindagens de isolamento (service-role, Meta status, media, signup) usam `profiles.account_id` da sessão via `requireAccountContext` / `requireRole`.
5. Implementar membership N:N no **Ciclo 002-R** (onboarding SaaS / organizações).

## Alternativas

| Opção | Motivo |
|-------|--------|
| Remover unique agora sem UI | Meia migração; queries e RLS ainda assumem 1:1 |
| Introduzir `account_members` completo agora | Fora do escopo 001-R; risco alto |

## Consequências

- Isolamento multiempresa **entre accounts** é reforçado agora.
- Usuário ainda **não** participa de várias orgs simultaneamente.
- `AccountContext.membershipId` é surrogate (`userId`) até existir tabela de membership.

## Próximo passo

Ciclo 002-R: desenhar `account_members` (ou equivalente), policies, switch de contexto, migração de dados, onboarding idempotente multi-org.
