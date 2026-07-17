# Preservação do Oslou Flow legado (pré-WACRM)

**Ciclo:** 000-R  
**Data:** 2026-07-17  
**Regra:** não mover, apagar ou sobrescrever o código legado sem autorização explícita.

## Onde está a base anterior

| Item | Valor |
|------|--------|
| Repositório | `https://github.com/omayklourenco/oslou-flow.git` |
| Caminho local | `D:\SISTEMAS\oslou-flow` |
| Branch | `main` |
| HEAD no momento da preservação | `19b5b11dec3765774f2f31f9e1a8cfe1caa83f94` |
| Tag de preservação | `legacy/pre-wacrm` |
| Mensagem do commit | Document cycle 014 final HEAD and CI run URL. |
| Backup zip adicional | `D:\SISTEMAS\oslou-flow.zip` (se presente) |

## Alterações preexistentes no working tree (não revertidas)

No momento do Ciclo 000-R, o legado tinha mudanças **não commitadas** que foram **preservadas** (não formatadas, não revertidas, não commitadas neste ciclo):

- Modificados: `.env.example`, `ENVIRONMENT.md`, `README.md`, `docker-compose.dev.yml`, `package.json`
- Untracked: `docker/`, `ssh-agent.md`

## Como consultar

```bash
cd D:/SISTEMAS/oslou-flow
git -c safe.directory=D:/SISTEMAS/oslou-flow show legacy/pre-wacrm
git -c safe.directory=D:/SISTEMAS/oslou-flow log --oneline legacy/pre-wacrm -5
```

Para publicar a tag no remoto (quando autorizado):

```bash
git push origin legacy/pre-wacrm
```

## Estratégia recomendada (sem operação destrutiva)

1. **Manter o repositório `oslou-flow` intacto** como legado e referência.
2. **Nova fundação** no fork `omayklourenco/wacrm` (local: `D:\SISTEMAS\wacrm`).
3. Opcional futuro: arquivar o remoto como `oslou-flow-legacy` ou renomear após cutover.
4. **Não fundir** NestJS/Redis/Baileys do legado na base WACRM automaticamente.

## Funcionalidades recuperáveis do legado

| Área | Recuperar futuramente? |
|------|------------------------|
| Super Admin / platform admin | Sim — redesenhar sobre WACRM |
| Status de organização / suspensão | Sim |
| Senha temporária / force change | Avaliar |
| Google Login | Avaliar (Supabase Auth provider) |
| Redis / filas outbound | Só com necessidade operacional comprovada |
| Baileys / QR WhatsApp | **Não** na linha principal (Meta API oficial) |
| Stripe / billing | Sim — ciclo dedicado |
| Docker compose multi-serviço | Adaptar ao monólito Next.js |
| Observabilidade / auditoria SA | Sim |

## Regra de não fusão arquitetural

- O legado **não** será mergeado como monorepo Nest+Redis+WhatsApp QR nesta base.
- Features específicas podem ser **reimplementadas** na arquitetura nativa WACRM (Next.js + Supabase).
- NestJS, Redis, workers externos ou microserviços só entram com necessidade operacional comprovada.
