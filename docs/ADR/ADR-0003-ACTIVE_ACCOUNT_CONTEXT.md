# ADR-0003 — Active account context & N:N membership scoping

- Status: Accepted
- Date: 2026-07-17
- Cycle: 002-R (SaaS multi-account onboarding)
- Supersedes the deferral in ADR-0002 (multi-account membership is now implemented)

## Context

The base (migration 017) locked membership to 1:1 — a user belonged to
exactly one account, stored on `profiles.account_id` + `profiles.account_role`,
and `is_account_member(account_id[, min_role])` read from `profiles`. Every one
of the ~100 RLS policies in the schema calls that single helper.

Ciclo 002-R needed N:N membership (a user in several organizations, different
role per org), a selectable **active organization**, and secure switching —
without rewriting every policy or breaking inbox/contacts/pipelines/broadcasts/
automations/API/MCP/Meta.

## Decision

### 1. Membership source of truth → `account_members` (N:N)

New join table `account_members(account_id, user_id, role, status, invited_by,
joined_at)` with `UNIQUE(account_id, user_id)`. The old 1:1 invariant
(`idx_accounts_one_per_owner`) is dropped. `profiles.account_id` /
`account_role` are **kept as a legacy mirror** of the active account (backward
compat) and are no longer the tenant-authorization source.

### 2. Active account → Option C (profile + cookie), server-validated

The active organization is persisted on **`profiles.active_account_id`** (the
authoritative value) and mirrored to a non-authoritative `oslou_active_account`
cookie for fast client reads. **The server never trusts the cookie**: RLS and
every server read use the DB value; switching goes through the
`set_active_account(account_id)` SECURITY DEFINER RPC, which refuses any account
the caller is not an active member of.

### 3. `is_account_member` rewritten — active-scoped

The helper now reads `account_members` and additionally requires
`account_members.account_id = profiles.active_account_id`. This single change
flips the **entire** schema to N:N while preserving a **single-tenant view per
request**: a user who belongs to A and B only "sees" (via RLS) the currently
active one. Switching is an explicit, validated write. No policy edits, no app
query changes.

Consequence: cross-account visibility is impossible without switching; listing
all of a user's orgs (the switcher) and cross-account admin operations use
dedicated SECURITY DEFINER RPCs (`get_user_accounts`, `has_account_role`) that
are intentionally **not** active-scoped.

### 4. New SECURITY DEFINER RPCs

`get_user_accounts`, `get_active_account`, `set_active_account`,
`get_account_members`, `has_account_role`, `create_account_with_owner`. The
signup trigger and the member/invitation RPCs (018/019) were rewritten to
operate on `account_members`; `redeem_invitation` now **adds** a membership
(keeping existing ones) instead of destructively moving the profile.

## Alternatives considered

- **A. Rename `accounts`→`organizations` + rewrite all policies.** Rejected:
  huge, risky migration; out of scope for this cycle.
- **B. Cookie-only active account.** Rejected: not durable across devices, and
  a cookie must never be the security boundary.
- **C. Permissive RLS (member of ANY of my accounts) + app-layer account
  filter.** Rejected: would require adding an explicit account filter to every
  existing query (many rely on RLS alone) — high regression risk. The active-
  scoped helper achieves the same isolation with zero query changes.

## Consequences

- + N:N membership, roles per organization, secure switching, idempotent
  onboarding — all with zero RLS policy edits and no changes to module queries.
- + Existing 1:1 data preserved (backfilled to one active membership each).
- − `profiles.account_id`/`account_role` remain as a legacy mirror; flagged for
  removal in a later cleanup once no code reads them.
- − Cross-account reads require a switch (by design). Public API keys and MCP
  stay bound to their own account (unaffected by the session's active account).

## Rollback

See the header of `supabase/migrations/038_multi_account_membership_onboarding.sql`.
Restore the 1:1 `is_account_member` body and 018/019 functions, drop
`account_members` + `active_account_id`, recreate `idx_accounts_one_per_owner`.
`profiles.account_id`/`account_role` were never dropped, so the 1:1 model
resolves again with no domain-data loss.
