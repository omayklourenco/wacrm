# Auditoria Auth / Onboarding

**Ciclo:** 000-R

## Fluxos

| Fluxo | Status | Evidência |
|-------|--------|-----------|
| Signup | Implementado | `(auth)/signup` + trigger `handle_new_user` |
| Login | Implementado | `(auth)/login` |
| Logout | Implementado | use-auth / supabase.auth |
| Forgot password | Implementado | `(auth)/forgot-password` |
| Email confirm | Depende config Supabase | Projeto |
| Refresh sessão | Supabase SSR cookies | middleware |
| Convite | Implementado | invitations API + `/join` |
| Redeem | Implementado | RPC `redeem_invitation` |
| Criação account | Automática no signup | trigger |
| Owner | Role owner no profile | trigger |
| Seleção / troca account | **Ausente** | 1 account por user |
| Remoção membro | RPC | 018 |
| Suspensão | **Ausente** | — |
| Exclusão account | Capacidade owner | parcial |

## Respostas

| Pergunta | Resposta |
|----------|----------|
| Signup público cria account? | **Sim** (trigger) |
| Qualquer usuário pode criar account? | **Sim** (signup aberto) |
| Onboarding idempotente? | Parcial; falha do trigger engolida |
| Owner em transação? | Dentro do trigger; EXCEPTION WHEN OTHERS engole erro |
| Convite expira? | Sim (`expires_at`) |
| Convite reutilizável? | Não após redeem |
| E-mail convidado precisa coincidir? | Verificar RPC 019 (peek/redeem) — restrição por token |
| Account órfã? | Risco se trigger falha após auth.users |
| Owner duplicado? | Unique `owner_user_id` |
| Separação user ↔ membership? | Fraca — membership = profile columns |

## Validação dinâmica neste ciclo

Login/signup/onboarding/convites **não** foram exercidos contra Supabase local (CLI ausente).
