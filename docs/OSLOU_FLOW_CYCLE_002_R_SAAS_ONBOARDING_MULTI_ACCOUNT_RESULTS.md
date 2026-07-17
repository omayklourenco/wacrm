# Oslou Flow — Ciclo 002-R — Resultados

## SaaS onboarding, organizações multi-account e troca segura de contexto

- Diretório: `D:\SISTEMAS\wacrm`
- Repositório: `omayklourenco/wacrm` (upstream `ArnasDon/wacrm`)
- Branch: `feature/saas-multi-account-onboarding-cycle-002-r` (a partir de `main`)
- Caminho: **B** — modelo + segurança completos; UI de switcher/onboarding mínima e funcional.

## Pré-condição

- PR #2 mergeada (squash) — merge commit `67adb445d4a9fd55f6f50113203191b35495c3f5`.
- `main` atualizada e branch 002-R criada a partir dela (HEAD inicial `67adb44`).

## Modelo N:N (migration 038)

`supabase/migrations/038_multi_account_membership_onboarding.sql` — aplicada
localmente com `supabase db reset` (todas as migrations 001→038 aplicam limpo).

- Nova tabela `account_members(account_id, user_id, role, status, invited_by, joined_at)`
  com `UNIQUE(account_id, user_id)`; enum `membership_status_enum`
  (`active|invited|suspended|removed`).
- Novo `profiles.active_account_id` (conta ativa; sempre validada contra membership).
- Índice 1:1 `idx_accounts_one_per_owner` removido.
- Backfill: uma membership ativa por profile existente + `active_account_id`
  semeado do `account_id` legado. Dados preservados, owners preservados.
- `is_account_member()` reescrita para ler `account_members` **escopada pela
  conta ativa** → toda a RLS vira N:N sem editar nenhuma policy.
- Novas RPCs `SECURITY DEFINER`: `get_user_accounts`, `get_active_account`,
  `set_active_account`, `get_account_members`, `has_account_role`,
  `create_account_with_owner`.
- Signup trigger e RPCs de membro/convite reescritos sobre `account_members`.
  `redeem_invitation` agora **adiciona** membership (mantém as existentes).
- `profiles.account_id`/`account_role` mantidos como espelho legado da conta ativa.

## Conta ativa

- Estratégia: **Opção C** (perfil + cookie). Fonte de verdade:
  `profiles.active_account_id`. Cookie `oslou_active_account` apenas hint de UI
  (não autoritativo). Servidor sempre valida membership. Ver ADR-0003.

## Backend / rotas

- `src/lib/auth/account.ts`: `getCurrentAccount()` resolve conta ativa + papel
  via `get_user_accounts`, com fallback + reparo do ponteiro ativo; expõe
  `availableAccounts`; novo `NoActiveAccountError`. `requireAccountContext`
  valida `requestedAccountId` contra a conta ativa.
- `GET/POST /api/account/active`: lista organizações e troca a ativa (valida via RPC).
- `POST /api/onboarding`: cria a primeira organização (idempotente).
- `GET /api/account/members`: agora via `get_account_members` (N:N).
- Convites: `redeem_invitation` N:N; host allowlist preservada.

## UI

- `components/layout/organization-switcher.tsx` no header: mostra org ativa,
  lista organizações, papel por org, troca com validação e reload.
- `/onboarding` (page + layout) para usuário sem organização.
- Gate de onboarding no `dashboard-shell` + `/onboarding` protegida no middleware.
- `use-auth` expõe `availableAccounts`, `accountsLoading`, `switchAccount`;
  papel/conta derivados da membership ativa (papel por organização).

## Testes

- Unitários: 671 testes passando (70 arquivos). `account.test.ts` e
  `require-account-context.test.ts` reescritos para o modelo N:N (resolução via
  RPC, seleção de membership ativa, fallback, papel por org).
- RLS dinâmico (`scripts/rls-multi-account-smoke.sql`, contra Supabase local):
  14 checagens, todas conforme esperado — usuário A vê A não B/C; troca A→B;
  troca para C (não membro) negada; agent em B não escreve settings; owner em A
  escreve; membership suspensa/removida perdem acesso; convite pendente não
  concede acesso. RLS: 37 tabelas, 103 policies.
- Cross-account (`scripts/rls-cross-account-smoke.sql`, atualizado p/ N:N):
  isolamento e bloqueio de update cross confirmados.
- Consistência (`scripts/audit-membership-consistency.sql`): 0 inconsistências
  (0 órfãos, 0 contas sem owner, 0 owners duplicados, 0 duplicatas).

## API pública / MCP / Meta

- API keys permanecem vinculadas à conta da chave (`api-context.ts` inalterado);
  trocar a org na UI não afeta a chave. Meta webhook continua resolvendo conta
  por `phone_number_id` (inalterado). Sem alterações na integração oficial.

## Gates

- Lint: 0 errors, 40 warnings (pré-existentes/cosméticos; +1 unused-disable em
  arquivo não tocado). Typecheck: OK. Testes: 671 OK. Build: OK
  (rotas `/onboarding` e `/api/onboarding` presentes).

## Riscos restantes

- `profiles.account_id`/`account_role` continuam como espelho legado — remover
  em ciclo futuro após confirmar que nenhum consumidor os usa para autorização.
- Cross-account exige troca de contexto por design (RLS escopada à conta ativa).
- Sem billing/planos/limites/unidades/Super Admin (fora de escopo).

## Próximo ciclo recomendado

**003-R — Planos, limites e billing (module gating)**, ou alternativamente
limpeza do espelho legado `profiles.account_id/account_role` + UI de
gerenciamento de membros/convites multi-org.
