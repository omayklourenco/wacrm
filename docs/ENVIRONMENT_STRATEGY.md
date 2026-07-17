# Estratégia de ambientes

**Ciclo:** 000-R — **sem deploy neste ciclo**

## Local

- Supabase local ou projeto cloud **descartável**
- Dados sintéticos
- Meta mock / test number / `WHATSAPP_TEMPLATES_DRY_RUN`
- `.env.local` (nunca commitado)

## Staging

- Projeto Supabase **separado**
- Domínio separado
- Meta app / test number **separado**
- Secrets próprios (`ENCRYPTION_KEY`, service role, Meta secret)
- Dados descartáveis

## Produção

- Projeto Supabase **separado**
- Domínio oficial
- Secrets exclusivos
- Backups + observabilidade
- Proteção de branch `main`
- Migrations controladas (nunca `db reset` em prod)

## Proibições

- Staging usando banco de produção
- Local usando service-role de produção
- Compartilhar tokens Meta entre ambientes
- Mesma `ENCRYPTION_KEY` em todos os ambientes
