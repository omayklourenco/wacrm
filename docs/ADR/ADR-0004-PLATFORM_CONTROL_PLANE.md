# ADR-0004 — Platform control plane (Super Admin)

- Status: Accepted
- Date: 2026-07-17
- Cycle: 003-R

## Context

After Ciclo 002-R the product supports N:N memberships and an active
organization. It still lacked a **platform** control plane: listing orgs,
suspending abusive tenants, auditing admin actions, and separating global
operators from tenant owners.

## Decision

1. **Global identity** lives in `platform_admins` (user_id UNIQUE, roles
   `super_admin` | `platform_admin`, status `active|suspended|revoked`).
   It is **never** derived from tenant `owner` / `admin` / membership.
2. **Authorization** uses `requirePlatformAdminContext()` — session +
   active `platform_admins` row. It ignores `active_account_id`.
3. **Routes** live under `/super-admin` and `/api/super-admin/*`, separate
   from the tenant dashboard.
4. **Organization status** is `accounts.platform_status` (`active|suspended`)
   plus suspension metadata. Membership status remains orthogonal.
5. **Suspension effects**
   - Tenant dashboard / mutating APIs / public API keys / MCP / Meta
     outbound blocked.
   - Multi-account users may switch to another *active* org.
   - Meta **inbound** continues to persist messages/statuses; flows,
     automations, and AI auto-reply are skipped for suspended orgs.
6. **Audit** via append-only `platform_audit_logs` (sanitized metadata).
7. **Plans**: only nullable `plan_code` / `plan_status` placeholders — no
   billing logic in this cycle.

## Consequences

- Platform operators can suspend/reactivate without deleting data.
- Tenant owners cannot escalate to platform privileges.
- Future billing/entitlements attach to `plan_*` without schema rewrite.

## Rollback

Drop migration 039 objects; restore `get_user_accounts` / `set_active_account`
from 038. Domain data and memberships are preserved.
