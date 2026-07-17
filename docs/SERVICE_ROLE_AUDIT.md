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

## Ciclo 003-R

| Arquivo | Operação | Auth | Classificação |
|---------|----------|------|---------------|
| `api/super-admin/*` | list/suspend/activate/admins | Platform Admin + service | SAFE após `requirePlatformAdminContext` |
| `lib/platform/organizations.ts` | queries globais | service após auth platform | SAFE |
| `api/whatsapp/webhook` | inbound suspensa | HMAC | SAFE — persiste; pula automations/AI |
| `api/whatsapp/send` | outbound | sessão + account | SAFE — bloqueia se suspensa |
| `lib/auth/api-context` | API key | Bearer | SAFE — 403 se account suspensa |
