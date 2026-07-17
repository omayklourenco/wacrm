# Auditoria secrets e criptografia

**Ciclo:** 000-R

## AES-256-GCM

| Aspecto | Avaliação |
|---------|-----------|
| Algoritmo | aes-256-gcm |
| Chave | `ENCRYPTION_KEY` 64 hex (32 bytes) |
| IV | 12 bytes random |
| Auth tag | 16 bytes |
| Serialização | `iv:ct:tag` hex |
| Rotação | Manual; orphan tokens |
| Legacy | CBC decrypt-only |
| Fallback | throw em formato inválido |

Dados cifrados: WhatsApp access/verify tokens, AI API keys, webhook secrets.

API keys / invite tokens: **SHA-256** (não reversível).

## Env / Git

| Check | Resultado |
|-------|-----------|
| `.env.local.example` | Presente, sem secrets reais |
| `.gitignore` `.env*` | Sim (exceções examples) |
| `.env` trackeado no WACRM | **Não** |
| Secrets no histórico auditado | Não encontrado no tree clonado |

## Warnings

- Sem validação de ENCRYPTION_KEY no boot.
- Fallback invite host `wacrm.tech` se site URL ausente.
