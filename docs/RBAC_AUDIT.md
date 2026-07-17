# Auditoria RBAC

**Ciclo:** 000-R  
**Papéis:** `owner` | `admin` | `agent` | `viewer`

## Matriz por ação

| Ação | Owner | Admin | Agent | Viewer |
|------|-------|-------|-------|--------|
| Configurações da organização | Sim | Sim | Não | Não |
| Membros / convites | Sim | Sim | Não | Não |
| Equipes | N/A | N/A | N/A | N/A |
| Números WhatsApp | Sim | Sim | Não | Não |
| Contatos (write) | Sim | Sim | Sim | Não |
| Conversas / enviar | Sim | Sim | Sim | Não |
| Campanhas | Sim | Sim | Sim | Não |
| Automações / flows | Sim | Sim | Sim | Não |
| Funis (admin stages) | Sim | Sim | Deals sim | Não |
| API keys | Sim | Sim | Não | Não |
| Webhooks endpoints | Sim | Sim | Não | Não |
| IA / knowledge | Sim | Sim | Draft conforme UI | Read |
| Transfer ownership | Sim | Não | Não | Não |
| Delete account | Sim | Não | Não | Não |
| Billing futuro | — | — | — | — |

Fonte: `src/lib/auth/roles.ts` + policies `is_account_member(..., min_role)`.

## Camadas de autorização

| Camada | Existe? |
|--------|---------|
| UI (esconder botões) | Sim |
| Servidor (`requireRole`) | Sim na maioria das rotas sensíveis |
| RLS | Sim |

**Nota:** esconder botão ≠ autorização — RLS/requireRole são a fonte real.

## Validação dinâmica

Não executada em banco local. Unit tests de hierarquia em `isolation-guards.test.ts`.
