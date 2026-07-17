# Auditoria de migrations

**Ciclo:** 000-R  
**Ordem:** `001` … `036` em `supabase/migrations/` (cronológica por prefixo numérico).

## Inventário resumido

| Faixa | Tema |
|-------|------|
| 001 | Schema inicial (user_id-centric) |
| 002–005 | Pipelines, broadcasts, deletes |
| 006–007 | Automations |
| 008–009 | Avatars storage, message reactions |
| 010–012 | Flows + counters |
| 013–015 | WhatsApp phone uniqueness, templates Meta, registration |
| 016–021 | Flow media, **account sharing (tenancy)**, RPCs, currency |
| 022–025 | Contact dedup, chat media, presence, tag filter |
| 026–028 | API keys, notifications, webhook endpoints |
| 029–033 | AI reply, knowledge, grants, polish |
| 034–036 | Fix profiles RLS, interactive msgs, conversation dedup |

## Achados

| Achado | Severidade | Notas |
|--------|------------|-------|
| Pré-017 isolava por `user_id` | Histórico | Substituído por `account_id` + RLS |
| Tabelas de negócio com RLS | OK | Pós-017 consistente |
| `automation_pending_executions` sem policies | Intencional | Só service role |
| SECURITY DEFINER com `search_path=public` | OK na maioria | Padrão bom |
| `record_webhook_failure` / `recompute_broadcast_counts` sem GRANT explícito | Médio | Validar REVOKE PUBLIC em prod |
| Fixes 032 (KB INVOKER) e 034 (profiles privilege) | Crítico mitigado | Obrigatórios em todos ambientes |
| Storage policies públicas em flow/chat media | Médio | By design Meta |
| Sem migration duplicada detectada | OK | Prefixos únicos |
| Soft delete | Parcial | Nem todas as tabelas |

## Tabelas principais criadas

`profiles`, `accounts`, `account_invitations`, `contacts`, `tags`, `custom_fields`, `conversations`, `messages`, `whatsapp_config`, `message_templates`, `pipelines`, `pipeline_stages`, `deals`, `broadcasts`, `broadcast_recipients`, `automations`, `automation_steps`, `automation_logs`, `flows`, `flow_nodes`, `flow_runs`, `api_keys`, `notifications`, `webhook_endpoints`, `ai_configs`, `ai_knowledge_*`, `ai_usage_log`, `quick_replies`, `member_presence`, …

## Recomendação

Antes de staging: `supabase db reset` local + checklist GRANT nas funções DEFINER listadas em `RLS_SECURITY_AUDIT.md`.
