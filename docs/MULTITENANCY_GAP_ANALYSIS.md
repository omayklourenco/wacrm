# Análise de gaps — multiempresa

**Ciclo:** 000-R

## Modelo atual (WACRM)

```
Platform
└── Account
    ├── Members (via profiles.account_id + account_role)
    ├── (sem Teams)
    ├── WhatsApp numbers (1 config / account; phone_number_id UNIQUE global)
    ├── Contacts / Conversations / Messages
    ├── Pipelines / Automations / Broadcasts / Flows
    ├── AI / Knowledge / API keys / Webhooks
```

**Não existe** tabela `account_members`. Membership = coluna em `profiles`.

Design explícito (migration 017): **one-account-per-user**.

## Modelo desejado (Oslou)

```
Oslou Platform
└── Organization
    ├── Units
    ├── WhatsApp channels
    ├── Teams
    ├── Members (N:N)
    ├── Contacts / Conversations / …
    ├── Plans / Limits
```

## Respostas objetivas

| Pergunta | Resposta |
|----------|----------|
| `account` pode ser renomeado para `organization`? | Sim, como rename lógico futuro; **não** neste ciclo (quebra migrations/APIs). |
| `account` já funciona como tenant? | **Sim** para isolamento de dados via `account_id` + RLS. |
| Relações sem `account_id`? | Filhos isolados via JOIN ao pai (`messages`, `contact_tags`, …). |
| Units sem reescrita? | **Não** — exigiriam nova entidade e escopo. |
| Usuário em várias organizações? | **Não** hoje; convite **move** o usuário. |
| Papéis por org ou globais? | Por account (`account_role`). |
| Owner único? | Sim (`accounts.owner_user_id` + unique por owner). |
| Convites vinculados à org? | Sim (`account_invitations.account_id`). |
| WhatsApp isolado? | Sim; número globalmente único. |
| Contatos vazam entre accounts? | RLS + `account_id` — **não esperado**; vazamento só via bugs service-role. |
| API pública respeita account? | Sim se rotas filtram `ctx.accountId`. |
| MCP respeita account? | Sim via API key da conta. |
| IA respeita account? | Sim (`ai_configs.account_id`, KB scoped). |

## Gaps prioritários

1. Membership N:N + troca de organização
2. Units / teams
3. Plans / entitlements / suspension
4. Super Admin da plataforma
5. Rename/mapeamento Organization (cosmético + docs)

## Veredito

`account` **serve como tenant SaaS básico**, mas **não** cobre o modelo Oslou completo (multi-org, units, planos).
