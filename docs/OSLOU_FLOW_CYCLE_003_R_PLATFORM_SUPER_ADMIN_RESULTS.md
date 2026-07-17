# Oslou Flow — Ciclo 003-R — Resultados

## Platform Super Admin, organizações e suspensões

- Diretório: `D:\SISTEMAS\wacrm`
- Repositório: `omayklourenco/wacrm`
- Branch: `feature/platform-super-admin-cycle-003-r`
- Caminho: **B** — backend + segurança + UI mínima funcional

## Pré-condição

- PR #3 (002-R) mergeada — `7224097964de10c31330fcc663ad2d2b86791b6d`
- Branch 003-R criada a partir da `main` atualizada

## Entregas

### Modelo

- Migration `039_platform_admin_control_plane.sql`
- `platform_admins`, `platform_audit_logs`
- `accounts.platform_status` (+ suspended_at/by/reason)
- Placeholders `plan_code` / `plan_status` (sem billing)
- Helpers SQL: `is_platform_admin`, `has_platform_role`,
  `get_platform_admin_profile`, `grant_platform_admin`, `revoke_platform_admin`
- `get_user_accounts` / `set_active_account` atualizados para suspensão

### Auth global

- `requirePlatformAdminContext` — **não** usa active account
- Seed local: `scripts/create-platform-admin.ts` via env

### Painel `/super-admin`

- Login, dashboard, organizações (lista/busca/filtro/paginação), detalhe,
  suspender/reativar (motivo obrigatório), admins, auditoria

### Bloqueios

- `getCurrentAccount` / `requireRole` / `requireAccountContext`
- API keys (`requireApiKey`) e MCP (via API pública)
- WhatsApp outbound (`/api/whatsapp/send`)
- Meta inbound: persiste; pula flows/automations/AI se suspensa
- Página `/organization-suspended` + switcher marca orgs suspensas

## Testes

- Unitários platform-admin, audit sanitize, suspension fallback
- Smoke: `scripts/rls-platform-admin-smoke.sql`
- Regressão: cross-account + multi-account + consistency

## Próximo ciclo

**004-R — Planos, limites e entitlements** (billing ainda opcional).
