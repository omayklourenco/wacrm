# Auditoria service-role (atualizado — Ciclo 001-R)

## Matriz

| Arquivo | Operação | Auth | Account | Papel | Classificação | Correção 001-R |
|---------|----------|------|---------|-------|---------------|----------------|
| `api/whatsapp/webhook/route.ts` | inbound + status | HMAC | phone_number_id | n/a | SAFE (após fix) | status scoped por account |
| `api/whatsapp/config/route.ts` | phone uniqueness | sessão | perfil | admin | SAFE | — |
| `api/whatsapp/media/[mediaId]` | proxy Meta | sessão | membership + message bind | member | SAFE (após fix) | binding mensagem/account |
| `lib/flows/admin-client.ts` | engines/CRUD | cron/sessão | account_id | agent+ | NEEDS_HARDENING→melhorado | flows update/delete + account_id |
| `lib/automations/admin-client.ts` | engines | cron/sessão | account_id | agent+ | SAFE com filtros | — |
| `lib/ai/admin-client.ts` | auto-reply | webhook | accountId | n/a | SAFE | — |
| `lib/auth/api-context.ts` | API keys | Bearer | key.account_id | scopes | SAFE | — |
| `quick-replies` routes | CRUD | sessão | account | agent | SAFE se filtrado | revisar contínuo |

## Helper

`requireAccountContext({ requestedAccountId?, allowedRoles? })` em `src/lib/auth/account.ts`.

## Frontend

Service-role **não** exposta ao browser.
