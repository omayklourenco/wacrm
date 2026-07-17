# Desenvolvimento local — Oslou Flow (base WACRM)

**Ciclo:** 000-R

## Requisitos

- Node.js **20+** (auditado: 24.15.0)
- npm 10+
- Conta/projeto Supabase (local via CLI **ou** projeto cloud de dev)
- Docker (recomendado para Supabase local)

## Neste host (2026-07-17)

| Ferramenta | Status |
|------------|--------|
| Node/npm | OK |
| Docker | Presente |
| Supabase CLI | **Não instalado** |
| `gh` CLI | **Não instalado** |

## Setup

```bash
cd D:/SISTEMAS/wacrm
cp .env.local.example .env.local
# Preencher NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY,
# ENCRYPTION_KEY, META_APP_SECRET

npm ci
```

### Opção A — Supabase local (preferida)

```bash
npm i -g supabase   # ou use o binário oficial
supabase start
supabase db reset   # aplica migrations 001–036
npm run dev
```

### Opção B — Supabase cloud de desenvolvimento

1. Criar projeto separado (nunca produção).
2. Rodar SQL das migrations em ordem.
3. Preencher `.env.local`.
4. `npm run dev`

## Scripts

| Script | Função |
|--------|--------|
| `npm run dev` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run build` | Build produção |

## Meta local

- Usar `WHATSAPP_TEMPLATES_DRY_RUN=true`
- Não conectar número real de cliente
- Webhook: ngrok/cloudflare tunnel + HMAC com `META_APP_SECRET` de app de teste

## Cron local

```bash
curl -H "x-cron-secret: $AUTOMATION_CRON_SECRET" http://localhost:3000/api/automations/cron
```
