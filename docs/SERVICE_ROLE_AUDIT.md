# Auditoria service-role

**Ciclo:** 000-R

## Usos identificados

| Arquivo | Motivo | Auth | Tenant | Papel | IDOR | Preferir RLS? |
|---------|--------|------|--------|-------|------|---------------|
| `src/app/api/whatsapp/webhook/route.ts` | Inbound Meta | HMAC | phone_number_id | n/a | Médio (status) | Não (sem sessão) |
| `src/app/api/whatsapp/config/route.ts` | Unicidade phone global | Sessão + role | perfil | admin | Baixo | Parcial |
| `src/lib/flows/admin-client.ts` | Engine flows | webhook/cron/rota | account_id args | — | Baixo se filtered | Não |
| `src/lib/automations/admin-client.ts` | Engine automations | idem | account_id | — | Baixo | Não |
| `src/lib/ai/admin-client.ts` | Auto-reply / usage | webhook/sessão | accountId | — | Baixo | Não |
| `src/lib/auth/api-context.ts` + `api-keys/store.ts` | Lookup API key | Bearer | row.account_id | scopes | Baixo | Não |
| Rotas flows/automations CRUD | Bypass após ownership | requireRole | account | role | Médio se regressão | Preferível RLS puro |

## Regras obrigatórias — conformidade

| Regra | Status |
|-------|--------|
| Não confiar só em account_id do body | Majoritário OK (perfil/key/phone) |
| Service-role só servidor | **OK** — não no browser |
| Nunca logar chave | OK nos caminhos lidos |
| Filtro account explícito | OK na maioria; **gap** em `handleStatusUpdate` (só message_id) |
| Dupla validação admin | Parcial (requireRole + RLS) |

## Exposição ao frontend

**Não.** `SUPABASE_SERVICE_ROLE_KEY` só em env server; clients browser usam anon.

## Findings

1. **Médio/Crítico operacional:** update de `messages.status` por `message_id` sem `account_id`.
2. **Médio:** múltiplas factories service-role duplicadas — centralizar.
3. **Baixo:** GET webhook varre todos verify_tokens.
