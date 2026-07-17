# Features incompletas e mockadas

**Ciclo:** 000-R

## Sinais encontrados

| Sinal | Onde | Interpretação |
|-------|------|---------------|
| TODO templates upsert user_id | `templates/submit/route.ts` | Bug potencial multi-membro |
| Flow templates demo | `lib/flows/templates.ts` | Templates oficiais, não mock de produto |
| WHATSAPP_TEMPLATES_DRY_RUN | env | Dry-run CI — OK |
| Rate limit “use Redis” | `rate-limit.ts` comments | Incompleto multi-instância |
| Webhooks sem UI | Settings | Feature API-only |
| Middleware incompleto `/flows` | middleware.ts | Auth via shell client |
| Billing / Super Admin | — | Ausentes (UNUSED) |
| Arrays estáticos UI | Não como fonte principal de inbox/contacts | — |

## Conclusão

Não há módulo operacional principal **inteiramente mockado**. Gaps são PARTIAL/UNUSED, não demos falsas de sucesso.
