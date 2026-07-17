# Auditoria API pública e MCP

**Ciclo:** 000-R

## API `/api/v1`

| Tema | Status |
|------|--------|
| Auth | Bearer `wacrm_live_…` |
| Binding account | `api_keys.account_id` |
| Scopes | Granulares (`scopes.ts`) |
| Rate limit | In-memory (single node) |
| Revogação | Delete key |
| Rotação | Nova key |
| Logs | Mínimos |

**Respostas:**

- API key pertence a uma account? **Sim**
- Pode acessar outra account por ID? **Não**, se rotas filtram `ctx.accountId` (padrão atual)
- Cross-tenant por regressão: risco se alguém esquecer o filtro

Docs: `docs/public-api.md`

## MCP (`mcp-server/`)

| Tema | Status |
|------|--------|
| Transporte | stdio → HTTPS `/api/v1` |
| Service role no MCP | **Não** |
| Read-only default | Sim |
| Writes / broadcasts | Flags env opt-in |
| Confirmação destrutiva | Limitada |
| Audit log dedicado | Não |
| Secrets em logs | Evitar; depende operador |

**Respostas:**

- MCP respeita papel? Via scopes da API key (não account_role UI)
- Ações destrutivas? Só com flags + scopes write
- Confirmação / audit: **fracos** para SaaS enterprise
