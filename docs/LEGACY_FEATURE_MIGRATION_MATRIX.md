# Matriz de migração — legado Oslou Flow × WACRM

**Ciclo:** 000-R  
**Regra:** não copiar código neste ciclo.

| Funcionalidade | WACRM | Flow legado | Estratégia |
|----------------|-------|-------------|------------|
| Super Admin | Não | Sim | Migrar futuramente (redesenhar) |
| Status organização | Não | Sim | Migrar futuramente |
| Senha temporária | Não | Sim | Avaliar / redesenhar |
| Google Login | Não | Sim | Avaliar via Supabase Auth |
| Redis / filas | Não | Sim | Não migrar até necessidade |
| Idempotência outbound | Parcial | Sim (Redis) | Redesenhar se necessário |
| Rate limit | In-memory | Redis | Melhorar quando multi-instância |
| QR / Baileys | Não | Sim | **Não migrar** (linha Meta) |
| Meta Cloud API | Sim (forte) | Sim | Já existe — preferir WACRM |
| Inbox | Sim | Sim | Já existe |
| CRM contatos | Sim | Sim | Já existe |
| Pipelines | Sim | Sim | Já existe |
| Automações | Sim | Parcial | Preferir WACRM |
| Flows/bots | Sim | Parcial | Preferir WACRM |
| API pública | Sim | Parcial | Preferir WACRM |
| MCP | Sim | Não | Já existe |
| IA + knowledge | Sim | Parcial | Preferir WACRM |
| Auditoria SA | Não | Sim | Migrar futuramente |
| Billing Stripe | Não | Sim | Migrar futuramente |
| Deploy Docker multi | Simples Next | Compose rico | Adaptar |
| Observabilidade | Básica | Melhor no legado | Ciclo dedicado |
