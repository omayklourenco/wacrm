# Arquitetura — estado atual

**Ciclo:** 000-R

## Fluxo

```
Browser
  ↓
Next.js 16 (App Router)
  ↓
Server Components / Route Handlers / (poucas) client mutations
  ↓
Supabase Auth (cookies SSR via @supabase/ssr)
  ↓
PostgreSQL + RLS (is_account_member)
  ↓
Storage / Meta Graph / AI providers / Webhooks outbound
```

## Clientes Supabase

| Cliente | Arquivo | Key | Uso |
|---------|---------|-----|-----|
| Browser | `src/lib/supabase/client.ts` | anon | UI autenticada |
| Server SSR | `src/lib/supabase/server.ts` | anon + cookies | RSC / rotas com sessão |
| Service role | `lib/*/admin-client.ts`, webhook, api-keys store | `SUPABASE_SERVICE_ROLE_KEY` | engines, webhook, API key lookup |

## Sessão

1. Login Supabase Auth no client.
2. Cookies lidos por `createServerClient`.
3. `middleware.ts` redireciona páginas dashboard sem user.
4. APIs usam `requireRole` / `getCurrentAccount` (`src/lib/auth/account.ts`).
5. Tenant = `profiles.account_id` (sem switch multi-org).

## Middleware / proxy

- Protege subset de paths dashboard + `/api/whatsapp/*` (exceto webhook).
- `/flows`, `/agents`, `/notifications` dependem também de `dashboard-shell`.
- `/api/v1` e crons **não** passam por middleware de sessão — auth própria.

## Resolução de tenant

| Caminho | Como resolve account |
|---------|----------------------|
| UI / API sessão | `profiles.account_id` |
| Webhook Meta | `whatsapp_config.phone_number_id` → `account_id` |
| API pública | `api_keys.account_id` da key |
| Cron | varre multi-tenant com service role + filtros por row |

## Tokens Meta

- Persistidos em `whatsapp_config` via AES-256-GCM (`ENCRYPTION_KEY`).
- Nunca enviados ao browser no GET de config (mascarados).
- Decrypt só em server routes / webhook.

## Diagrama lógico de dados

```
Platform (instância self-host)
└── Account
    ├── Profiles (members + account_role)
    ├── Invitations
    ├── WhatsApp config (1 por account)
    ├── Contacts / Conversations / Messages
    ├── Pipelines / Deals
    ├── Broadcasts / Templates
    ├── Automations / Flows
    ├── AI config + Knowledge
    ├── API keys / Webhook endpoints
    └── Storage paths account-<uuid>/
```
