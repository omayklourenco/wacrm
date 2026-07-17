# Auditoria Storage

**Ciclo:** 000-R

## Buckets

| Bucket | Público | Path | Isolamento write |
|--------|---------|------|------------------|
| avatars | Sim | `{user_id}/…` | auth.uid |
| flow-media | Sim | `account-{uuid}/…` (+ legacy uid) | member |
| chat-media | Sim | `account-{uuid}/…` | member |

## Controles

| Controle | Status |
|----------|--------|
| Signed URLs | Não (público por design Meta) |
| Upload via client anon + RLS | Sim (`upload-media.ts`) |
| File type / size | Validação app parcial |
| Path traversal | Depende sanitização path |
| Malware scan | Ausente |

## Riscos

1. URL conhecida = leitura world-readable (flow/chat).
2. Legacy write path `auth.uid()` ainda permitido em flow-media.
3. Adequado para self-host Meta; insuficiente para dados altamente confidenciais sem signed URLs.
