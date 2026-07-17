# Auditoria Meta WhatsApp (Cloud API)

**Ciclo:** 000-R  
**Regra:** sem número real de cliente; sem template/campanha real.

## Mapa

| Capacidade | Status | Evidência |
|------------|--------|-----------|
| Config manual token/phone/WABA | Sim | `whatsapp-config.tsx`, `/api/whatsapp/config` |
| OAuth / Embedded Signup | **Não** (manual tokens) | — |
| Access token encrypt | Sim GCM | `encryption.ts` |
| Webhook verify GET | Sim | decrypt verify_token |
| HMAC POST | Sim fail-closed | `webhook-signature.ts` |
| Inbound messages | Sim | webhook route |
| Send | Sim | `send-message.ts` |
| Templates CRUD/submit/sync | Sim | templates routes |
| Status sent/delivered/read/failed | Sim | handleStatusUpdate |
| Mídia | Sim proxy | `/api/whatsapp/media/[id]` |
| Registration PIN | Sim | verify-registration |
| Token refresh Meta | Parcial / manual re-save | — |

## Validações de segurança

| Check | Resultado |
|-------|-----------|
| HMAC real + timingSafeEqual | **Sim** |
| Corpo bruto preservado | **Sim** |
| Rejeição sem/assinatura inválida | **Sim** |
| Dedup message id | Parcial (insert; races tratadas) |
| Token criptografado | **Sim** |
| Token no browser | Não no plaintext |
| Token em logs | Não observado |
| Webhook resolve account | Via phone_number_id |
| Phone exclusive | UNIQUE + check config |
| Erros Meta sanitizados | Parcial |

## Findings

1. Status update em `messages` **sem** filtro `account_id` (colisões Meta IDs).
2. Media proxy autenticado mas **sem** amarrar mediaId à conta/conversa.
3. Sem Embedded Signup — onboarding canal manual.

## Testes unitários

HMAC + encrypt cobertos em `isolation-guards.test.ts` e suite `lib/whatsapp/*`.
