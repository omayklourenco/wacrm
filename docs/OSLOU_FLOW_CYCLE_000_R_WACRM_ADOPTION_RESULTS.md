# Ciclo 000-R — Resultados da adoção WACRM como base Oslou Flow

**Data:** 2026-07-17  
**Caminho escolhido:** **B** (base adotável com blindagem obrigatória) + aspectos de **C** (módulos SaaS incompletos) e **D** (Supabase local / `gh` indisponíveis)

## 1. Estado inicial

- Workspace Cursor aberto em `D:\SISTEMAS\oslou-flow` = **legado** NestJS/Redis/Baileys (`19b5b11`), **não** o fork WACRM.
- Working tree legado sujo (preservado, não revertido).
- Fork WACRM clonado para `D:\SISTEMAS\wacrm`.

## 2. Fork / upstream

| Item | Valor |
|------|--------|
| Auditado | `omayklourenco/wacrm` |
| Upstream | `ArnasDon/wacrm` (remote `upstream` adicionado) |
| Legado | `omayklourenco/oslou-flow` |

## 3. Commit base

`b24aa794b56468764100c8d5ecc3c2a270df44c6` — **confirma HEAD de `origin/main`** (igual à referência do briefing).

## 4. Stack real

Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind 4, Supabase, Vitest, Node >=20 (local v24.15.0), npm + `package-lock.json`.

## 5–6. Arquitetura / inventário

Ver `ARCHITECTURE_CURRENT_STATE.md`, `ARCHITECTURE_INVENTORY.md`.

## 7–10. Módulos

Ver `MODULE_READINESS_MATRIX.md`.

- READY: auth, accounts, roles, inbox, messages, contacts, tags, fields, pipelines, broadcasts, automations, dashboard, AI, KB, API, MCP, settings, WhatsApp Meta, storage
- PARTIAL: onboarding, templates Meta, flows, webhooks UI, audit, limits técnicos
- MOCKED: nenhum módulo principal
- BROKEN: nenhum bloqueio estrutural; testes locale corrigidos
- UNUSED: billing, Super Admin, teams entity, Baileys

## 11. Multiempresa

`account` = tenant básico; **não** multi-org por usuário; sem units/planos. Ver `MULTITENANCY_GAP_ANALYSIS.md`.

## 12–13. RLS / service-role

RLS majoritariamente correto pós-017/032/034. Service-role não no frontend. Riscos: status Meta sem account scope; media proxy; GRANTs DEFINER.

## 14–16. Auth / RBAC / Meta

Ver docs dedicados. HMAC Meta **fail-closed**. Tokens **GCM**. Sem Embedded Signup.

## 17–19. Crypto / Storage / API-MCP

Ver docs. Storage flow/chat público by design.

## 20–21. Ambiente

`LOCAL_DEVELOPMENT.md`, `ENVIRONMENT_STRATEGY.md`. Supabase CLI e `gh` ausentes neste host.

## 22. Rebranding

Metadata `Oslou Flow` em `layout.tsx`; README com cabeçalho Oslou; **sem** alterar `LICENSE`, prefixes `wacrm_live_`, package name, migrations.

## 23. Licença

MIT preservada.

## 24–25. Gaps SaaS / legado

Ver `SAAS_READINESS_GAP_ANALYSIS.md`, `LEGACY_FEATURE_MIGRATION_MATRIX.md`.

## 26. Testes

- Vitest: **645+** passando após fix locale/timezone + novos isolation guards.
- RLS dinâmico: **não** (sem Supabase local).

## 27. Gates locais

| Gate | Resultado |
|------|-----------|
| npm ci | OK |
| lint | OK (39 warnings, 0 errors) |
| typecheck | OK |
| test | OK após correções |
| build | (executado no fechamento do ciclo) |
| git diff --check | (executado no fechamento) |

## 28. CI remoto

Workflow `.github/workflows/ci.yml` = lint+typecheck+test+build.  
**`gh` CLI não instalado** — runs remotos não consultados via API neste host. Consultar manualmente: https://github.com/omayklourenco/wacrm/actions

## 29. Correções executadas

1. Testes `currency` / `date-utils` tolerantes a locale/timezone.
2. Testes `isolation-guards.test.ts`.
3. Rebrand metadata + README.
4. Documentação completa do ciclo.
5. Tag legado `legacy/pre-wacrm` em `oslou-flow`.
6. Remote `upstream` no clone WACRM.
7. `.env.example` espelhando `.env.local.example`.

## 30. Findings críticos / altos

1. Signup trigger pode engolir erro → user sem account.
2. Webhook status update por `message_id` sem `account_id`.
3. Media proxy sem binding conta/conversa.
4. Membership 1:1 impede SaaS multi-org Oslou.

## 31. Riscos restantes

- Rate limit in-memory
- Storage URLs públicas
- Invite Host header sem allowlist
- Sem Super Admin / billing / plans

## 32. Backlog

`OSLOU_FLOW_REBUILD_BACKLOG.md` — **próximo: 001-R blindagem**.

## 33. Próximo ciclo

**001-R — Blindagem multiempresa e isolamento service-role**

## Nota operacional

O código auditado e documentado vive em **`D:\SISTEMAS\wacrm`**. O workspace Cursor `oslou-flow` permanece o legado. Cutover de workspace/remoto fica para decisão explícita do operador.
