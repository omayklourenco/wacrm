-- ============================================================
-- Ciclo 002-R — Membership consistency audit (read-only)
--
-- Reports inconsistencies introduced by the 1:1 → N:N migration or by
-- hand edits. Read-only: it NEVER writes. Use the SECURITY DEFINER
-- repair_orphan_user_account(uuid) helper (service_role) to fix orphan
-- users; other findings should be reviewed manually before any repair.
--
--   psql "$DATABASE_URL" -f scripts/audit-membership-consistency.sql
-- ============================================================

-- (1) auth.users with NO active membership (orphans / removed-from-all).
SELECT 'users_without_active_membership' AS finding, u.id AS user_id, u.email
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_members m
  WHERE m.user_id = u.id AND m.status = 'active'
);

-- (2) profiles whose active_account_id points at an account the user is
--     NOT an active member of (stale pointer → empty views until repaired).
SELECT 'profile_active_account_not_a_member' AS finding, p.user_id, p.active_account_id
FROM public.profiles p
WHERE p.active_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.account_members m
    WHERE m.user_id = p.user_id
      AND m.account_id = p.active_account_id
      AND m.status = 'active'
  );

-- (3) profiles whose legacy account_id has no corresponding membership.
SELECT 'profile_home_account_no_membership' AS finding, p.user_id, p.account_id
FROM public.profiles p
WHERE p.account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.account_members m
    WHERE m.user_id = p.user_id AND m.account_id = p.account_id
  );

-- (4) accounts with NO active owner membership.
SELECT 'accounts_without_active_owner' AS finding, a.id AS account_id, a.name
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_members m
  WHERE m.account_id = a.id AND m.role = 'owner' AND m.status = 'active'
);

-- (5) accounts with MORE THAN ONE active owner (should be exactly one).
SELECT 'accounts_with_multiple_owners' AS finding, m.account_id, count(*) AS owner_count
FROM public.account_members m
WHERE m.role = 'owner' AND m.status = 'active'
GROUP BY m.account_id
HAVING count(*) > 1;

-- (6) duplicate memberships (defensive — UNIQUE(account_id,user_id) blocks this).
SELECT 'duplicate_memberships' AS finding, m.account_id, m.user_id, count(*) AS n
FROM public.account_members m
GROUP BY m.account_id, m.user_id
HAVING count(*) > 1;

-- (7) memberships referencing a missing account or user (defensive — FKs block this).
SELECT 'membership_orphan_refs' AS finding, m.id, m.account_id, m.user_id
FROM public.account_members m
LEFT JOIN public.accounts a ON a.id = m.account_id
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE a.id IS NULL OR u.id IS NULL;

-- Summary counts (quick health snapshot).
SELECT 'summary_accounts' AS metric, count(*) AS n FROM public.accounts
UNION ALL SELECT 'summary_members_active', count(*) FROM public.account_members WHERE status = 'active'
UNION ALL SELECT 'summary_members_total', count(*) FROM public.account_members
UNION ALL SELECT 'summary_profiles', count(*) FROM public.profiles;
