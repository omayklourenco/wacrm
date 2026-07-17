# Inventário de arquitetura — WACRM / Oslou Flow

**Ciclo:** 000-R  
**Repositório auditado:** `omayklourenco/wacrm` @ `b24aa794b56468764100c8d5ecc3c2a270df44c6`  
**Upstream:** `ArnasDon/wacrm`

## Stack confirmada

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 16.2.6 (App Router) |
| UI | React 19.2.4, Tailwind CSS 4, Base UI / shadcn |
i18n | next-intl (en, ko) |
| Auth/DB/Storage | Supabase (Auth, Postgres, RLS, Storage) |
| Testes | Vitest |
| MCP | Pacote `mcp-server/` (cliente HTTP `/api/v1`) |
| Node | engines `>=20` (local auditado: v24.15.0) |
| Package manager | npm (`package-lock.json`) |

## Estrutura de alto nível

```
wacrm/
├── src/app/(auth)          login, signup, forgot-password
├── src/app/(dashboard)     inbox, contacts, pipelines, broadcasts, automations, flows, agents, settings, notifications
├── src/app/api             account, whatsapp, v1, ai, flows, automations, invitations, contacts, quick-replies
├── src/app/join/[token]    aceite de convite
├── src/components          UI por domínio
├── src/lib                 auth, whatsapp, automations, flows, ai, api-keys, webhooks, storage
├── src/middleware.ts       proteção de rotas
├── supabase/migrations     001–036
├── mcp-server/             MCP stdio
├── messages/               i18n
└── docs/                   public-api, mcp + auditorias 000-R
```

## Rotas públicas

| Rota | Função |
|------|--------|
| `/login`, `/signup`, `/forgot-password` | Auth UI |
| `/join/[token]` | Convite |
| `/api/whatsapp/webhook` | Meta verify + inbound |
| `/api/invitations/[token]/peek` | Preview convite |

## Rotas autenticadas (dashboard)

`/dashboard`, `/inbox`, `/contacts`, `/pipelines`, `/broadcasts`, `/automations`, `/flows`, `/agents`, `/settings`, `/notifications`

## Rotas administrativas (papel admin+)

Settings: WhatsApp, templates, members, invitations, API keys, AI config, knowledge.  
APIs: `/api/account/*`, `/api/whatsapp/config`, templates submit/sync, AI config/knowledge.

## API routes (principais)

| Prefixo | Auth |
|---------|------|
| `/api/account/*` | Sessão + role |
| `/api/whatsapp/*` | Sessão (exceto webhook) |
| `/api/v1/*` | Bearer API key |
| `/api/automations/cron`, `/api/flows/cron` | `AUTOMATION_CRON_SECRET` |
| `/api/ai/*` | Sessão + role |
| `/api/invitations/*/redeem` | Sessão |

## Server actions

Padrão dominante: **Route Handlers** (`route.ts`), não Server Actions massivas.

## Integrações externas

- Meta Graph / WhatsApp Cloud API
- OpenAI / Anthropic (BYO key por account)
- Supabase
- Webhooks outbound assinados (`X-Wacrm-Signature`)

## Cron / jobs

- `GET /api/automations/cron` — drain de waits
- `GET /api/flows/cron` — runs ativos
- Requer secret compartilhado; **não** há worker Redis nativo

## Migrations / seeds

- 36 migrations SQL em `supabase/migrations/`
- Sem seed oficial de demo no repositório (signup cria account via trigger)

## Edge Functions

Nenhuma Edge Function Supabase no repositório; lógica em Next.js Route Handlers.

## Storage buckets

`avatars`, `flow-media`, `chat-media` (ver `docs/STORAGE_SECURITY_AUDIT.md`)

## Testes

~66 arquivos Vitest; forte em `lib/whatsapp`, `lib/ai`, `lib/auth`; fraco em E2E/UI.

## Mocks / demo

- Flow templates pré-canned (`lib/flows/templates.ts`)
- `WHATSAPP_TEMPLATES_DRY_RUN` para CI/local
- Sem módulo de produto inteiramente fake
