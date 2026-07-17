-- ============================================================
-- 038_multi_account_membership_onboarding.sql — Ciclo 002-R
--
-- Turns the locked 1:1 (one user ↔ one account, stored on
-- profiles.account_id / profiles.account_role) into an N:N model
-- backed by a real `account_members` join table, WITHOUT rewriting
-- the ~100 RLS policies added by migration 017.
--
-- Central idea
--   Every RLS policy in this schema calls is_account_member(account_id
--   [, min_role]). This migration REWRITES that one function to read
--   from account_members instead of profiles, and to scope the check
--   to the caller's *active account* (profiles.active_account_id).
--   Result: the whole schema becomes N:N-aware and keeps its
--   single-tenant-per-request view (the app never has to add an
--   account filter it wasn't already using), and switching the active
--   account changes what RLS exposes — with zero policy edits.
--
-- What this migration does
--   1. Adds `membership_status_enum` and the `account_members` table
--      (account_id, user_id, role, status, invited_by, joined_at).
--   2. Adds `profiles.active_account_id` (the current tenant hint;
--      always validated against membership server-side).
--   3. Backfills one active membership per existing profile and seeds
--      active_account_id — no data touched, owners preserved.
--   4. Drops the 1:1 UNIQUE(owner_user_id) index on accounts so a
--      user may own / belong to several accounts.
--   5. Rewrites is_account_member to read account_members, active-
--      scoped. Adds has_account_role, get_user_accounts,
--      get_active_account, set_active_account, get_account_members,
--      create_account_with_owner.
--   6. Rewrites the signup trigger to also create the owner membership
--      and seed active_account_id.
--   7. Rewrites the member-management + invitation RPCs (018/019) to
--      operate on account_members. redeem_invitation now ADDS a
--      membership (keeping existing ones) instead of destructively
--      moving the profile.
--   8. Adds RLS for account_members (self + active-account members read;
--      all writes go through the SECURITY DEFINER RPCs).
--
-- What this migration does NOT do
--   - Does not drop profiles.account_id / profiles.account_role. They
--     stay as the user's "home account" mirror for backward compat and
--     are flagged legacy (not used for tenant authorization anymore —
--     authorization comes from account_members via is_account_member).
--   - Does not rename `accounts` to `organizations` (UI term only).
--   - Does not touch Meta WhatsApp, billing, plans, units.
--
-- Rollback (documented, not automated)
--   BEGIN;
--     -- restore the pre-002-R helper reading profiles
--     CREATE OR REPLACE FUNCTION is_account_member(...) ... FROM profiles ...;
--     -- restore 018/019/037 function bodies from those migrations
--     DROP FUNCTION IF EXISTS public.get_user_accounts();
--     DROP FUNCTION IF EXISTS public.set_active_account(uuid);
--     DROP FUNCTION IF EXISTS public.get_active_account();
--     DROP FUNCTION IF EXISTS public.get_account_members();
--     DROP FUNCTION IF EXISTS public.has_account_role(uuid, account_role_enum[]);
--     DROP FUNCTION IF EXISTS public.create_account_with_owner(text);
--     ALTER TABLE profiles DROP COLUMN IF EXISTS active_account_id;
--     DROP TABLE IF EXISTS account_members;
--     CREATE UNIQUE INDEX idx_accounts_one_per_owner ON accounts(owner_user_id);
--   COMMIT;
--   (profiles.account_id/account_role were never dropped, so the 1:1
--    helper resolves again immediately. No domain data is lost.)
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status_enum') THEN
    CREATE TYPE membership_status_enum AS ENUM ('active', 'invited', 'suspended', 'removed');
  END IF;
END $$;

-- ============================================================
-- 2. ACCOUNT_MEMBERS — the N:N join table (new source of truth)
-- ============================================================
CREATE TABLE IF NOT EXISTS account_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        account_role_enum NOT NULL DEFAULT 'agent',
  status      membership_status_enum NOT NULL DEFAULT 'active',
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- N:N key: a user has at most ONE membership row per account.
  -- (No UNIQUE(user_id) — that was the 1:1 invariant we are removing.)
  CONSTRAINT account_members_account_user_key UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_members_user    ON account_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_account_members_account ON account_members(account_id, status);

ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON account_members;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. PROFILES.active_account_id — current tenant hint
--
-- Nullable FK. NULL means "no active organization" → the app routes
-- the user to onboarding. Never trusted alone: every server read
-- validates it against an active account_members row.
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- ============================================================
-- 4. BACKFILL — preserve every existing 1:1 relationship
--
-- One active membership per profile that already has an account,
-- carrying its current role. Idempotent via ON CONFLICT.
-- ============================================================
INSERT INTO account_members (account_id, user_id, role, status, joined_at)
SELECT p.account_id, p.user_id, p.account_role, 'active', p.created_at
FROM profiles p
WHERE p.account_id IS NOT NULL
  AND p.account_role IS NOT NULL
ON CONFLICT (account_id, user_id) DO NOTHING;

-- Seed active_account_id from the legacy single account.
UPDATE profiles
SET active_account_id = account_id
WHERE active_account_id IS NULL
  AND account_id IS NOT NULL;

-- ============================================================
-- 5. DROP the 1:1 invariant on accounts ownership
--
-- Was: CREATE UNIQUE INDEX idx_accounts_one_per_owner ON
--      accounts(owner_user_id) (migration 017). A user may now own
--      more than one account (personal + created orgs).
-- ============================================================
DROP INDEX IF EXISTS idx_accounts_one_per_owner;

-- ============================================================
-- 6. is_account_member — REWRITTEN to read account_members, active-scoped
--
-- Returns true iff auth.uid() has an ACTIVE membership of
-- target_account_id with at least min_role AND target_account_id is
-- the caller's active account. The active-account clause is what keeps
-- the per-request view single-tenant: a user who belongs to A and B
-- only "sees" (via RLS) the one currently selected. Switching is an
-- explicit, validated write to profiles.active_account_id.
--
-- Same signature + owner=postgres + SECURITY DEFINER as 017 so every
-- existing policy keeps compiling untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_members m
    JOIN profiles p ON p.user_id = m.user_id
    WHERE m.user_id = auth.uid()
      AND m.account_id = target_account_id
      AND m.status = 'active'
      AND p.active_account_id = target_account_id
      AND CASE m.role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- ============================================================
-- 7. has_account_role — membership check that is NOT active-scoped
--
-- For server-side authorization of cross-account operations (e.g.
-- "is the caller an admin of account X") independent of which account
-- is currently active. Used by the RPCs below and available to app code.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_account_role(
  p_account_id UUID,
  p_roles account_role_enum[]
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_members m
    WHERE m.user_id = auth.uid()
      AND m.account_id = p_account_id
      AND m.status = 'active'
      AND m.role = ANY (p_roles)
  );
$$;
ALTER FUNCTION public.has_account_role(UUID, account_role_enum[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_account_role(UUID, account_role_enum[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_account_role(UUID, account_role_enum[]) TO authenticated, service_role;

-- ============================================================
-- 8. get_user_accounts — every active membership (for the switcher)
--
-- NOT active-scoped: returns all accounts the caller belongs to so the
-- organization switcher can render them. SECURITY DEFINER so it works
-- regardless of the (active-scoped) accounts RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_accounts()
RETURNS TABLE (
  account_id UUID,
  name TEXT,
  role account_role_enum,
  status membership_status_enum,
  is_active BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.account_id,
         a.name,
         m.role,
         m.status,
         (a.id = p.active_account_id) AS is_active
  FROM account_members m
  JOIN accounts a ON a.id = m.account_id
  JOIN profiles p ON p.user_id = m.user_id
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
  ORDER BY a.name ASC;
$$;
ALTER FUNCTION public.get_user_accounts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_accounts() TO authenticated;

-- ============================================================
-- 9. get_active_account — the caller's current tenant id (or NULL)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_account()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT active_account_id FROM profiles WHERE user_id = auth.uid();
$$;
ALTER FUNCTION public.get_active_account() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_active_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_account() TO authenticated;

-- ============================================================
-- 10. set_active_account — switch tenant (validated against membership)
--
-- The ONLY sanctioned way to change profiles.active_account_id. Refuses
-- accounts the caller is not an ACTIVE member of, so a tampered cookie /
-- request body can never move the caller into a foreign tenant.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_active_account(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE user_id = auth.uid()
      AND account_id = p_account_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are not an active member of this organization'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET active_account_id = p_account_id,
      -- keep the legacy mirror pointing at a valid membership too
      account_id = p_account_id,
      account_role = (
        SELECT role FROM account_members
        WHERE user_id = auth.uid() AND account_id = p_account_id AND status = 'active'
      )
  WHERE user_id = auth.uid();
END;
$$;
ALTER FUNCTION public.set_active_account(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_active_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_account(UUID) TO authenticated;

-- ============================================================
-- 11. get_account_members — roster of the caller's ACTIVE account
--
-- SECURITY DEFINER because a co-member's profile row is scoped to
-- THEIR home account under the active-scoped is_account_member, so a
-- plain profiles SELECT can't read teammates. Caller must be an active
-- member of the account being listed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_account_members()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  role account_role_enum,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, p.full_name, p.email, p.avatar_url, m.role,
         COALESCE(m.joined_at, m.created_at)
  FROM account_members m
  JOIN profiles p ON p.user_id = m.user_id
  WHERE m.status = 'active'
    AND m.account_id = (SELECT active_account_id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM account_members me
      WHERE me.user_id = auth.uid()
        AND me.account_id = m.account_id
        AND me.status = 'active'
    )
  ORDER BY COALESCE(m.joined_at, m.created_at) ASC;
$$;
ALTER FUNCTION public.get_account_members() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_account_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_members() TO authenticated;

-- ============================================================
-- 12. create_account_with_owner — onboarding / "create organization"
--
-- Creates an account, the caller's owner membership, and sets it
-- active — atomically. Used by the onboarding flow and any future
-- "new organization" button. Idempotent per call (always a new org).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_account_with_owner(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_account_id UUID;
  v_name TEXT;
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_name), ''), 'My organization');

  INSERT INTO accounts (name, owner_user_id)
  VALUES (v_name, v_uid)
  RETURNING id INTO v_account_id;

  INSERT INTO account_members (account_id, user_id, role, status, joined_at)
  VALUES (v_account_id, v_uid, 'owner', 'active', NOW());

  -- Ensure a profile row exists (defensive) and point the legacy
  -- mirror + active tenant at the new org.
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', '')
    INTO v_email, v_full_name
  FROM auth.users WHERE id = v_uid;

  INSERT INTO profiles (user_id, full_name, email, account_id, account_role, active_account_id)
  VALUES (v_uid, COALESCE(v_full_name, ''), COALESCE(v_email, ''), v_account_id, 'owner', v_account_id)
  ON CONFLICT (user_id) DO UPDATE
    SET active_account_id = v_account_id,
        -- legacy mirror always tracks the active account
        account_id = v_account_id,
        account_role = 'owner';

  RETURN v_account_id;
END;
$$;
ALTER FUNCTION public.create_account_with_owner(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_account_with_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_account_with_owner(TEXT) TO authenticated;

-- ============================================================
-- 13. handle_new_user — signup bootstrap now also seeds membership
--
-- Every new auth.users row produces: a personal account, an owner
-- profile (legacy mirror), an ACTIVE owner membership, and
-- active_account_id pointing at it. Fail-closed (no EXCEPTION swallow)
-- as hardened in 037.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role, active_account_id)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner', v_account_id);

  INSERT INTO public.account_members (account_id, user_id, role, status, joined_at)
  VALUES (v_account_id, NEW.id, 'owner', 'active', NOW());

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- ============================================================
-- 14. repair_orphan_user_account — extend to seed membership too
-- ============================================================
CREATE OR REPLACE FUNCTION public.repair_orphan_user_account(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id uuid;
  v_email text;
  v_full_name text;
BEGIN
  -- Already has an active membership → idempotent no-op (return it).
  SELECT account_id INTO v_account_id
  FROM account_members
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_account_id IS NOT NULL THEN
    UPDATE profiles SET active_account_id = COALESCE(active_account_id, v_account_id)
    WHERE user_id = p_user_id;
    RETURN v_account_id;
  END IF;

  SELECT email, COALESCE(raw_user_meta_data->>'full_name', '')
    INTO v_email, v_full_name
  FROM auth.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found in auth.users', p_user_id;
  END IF;

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), v_email, 'My account'), p_user_id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role, active_account_id)
  VALUES (p_user_id, v_full_name, v_email, v_account_id, 'owner', v_account_id)
  ON CONFLICT (user_id) DO UPDATE
    SET account_id = COALESCE(profiles.account_id, v_account_id),
        account_role = COALESCE(profiles.account_role, 'owner'),
        active_account_id = COALESCE(profiles.active_account_id, v_account_id),
        email = COALESCE(profiles.email, v_email),
        full_name = COALESCE(NULLIF(profiles.full_name, ''), v_full_name);

  INSERT INTO public.account_members (account_id, user_id, role, status, joined_at)
  VALUES (v_account_id, p_user_id, 'owner', 'active', NOW())
  ON CONFLICT (account_id, user_id) DO NOTHING;

  RETURN v_account_id;
END;
$$;
ALTER FUNCTION public.repair_orphan_user_account(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.repair_orphan_user_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_orphan_user_account(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_orphan_user_account(uuid) TO service_role;

-- ============================================================
-- 15. Member-management RPCs — operate on account_members, active account
-- ============================================================

-- set_member_role: admin+ of the active account changes a teammate's role.
CREATE OR REPLACE FUNCTION public.set_member_role(
  p_user_id UUID,
  p_new_role account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_caller_role account_role_enum;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT active_account_id INTO v_account_id FROM profiles WHERE user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No active organization' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_caller_role FROM account_members
  WHERE user_id = auth.uid() AND account_id = v_account_id AND status = 'active';
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_target_role FROM account_members
  WHERE user_id = p_user_id AND account_id = v_account_id AND status = 'active';
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of your organization' USING ERRCODE = '22023';
  END IF;

  IF v_target_role = 'owner' OR p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to change the owner' USING ERRCODE = '22023';
  END IF;

  UPDATE account_members SET role = p_new_role
  WHERE user_id = p_user_id AND account_id = v_account_id;
END;
$$;
ALTER FUNCTION public.set_member_role(UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, account_role_enum) TO authenticated;

-- remove_account_member: admin+ removes a teammate from the active
-- account. N:N — we just mark the membership 'removed' (keeping the
-- user's other memberships). If it was their active account, clear it.
--
-- The 018 version returned UUID (a new personal account id); the N:N
-- version returns VOID, so DROP first — CREATE OR REPLACE cannot change
-- a function's return type.
DROP FUNCTION IF EXISTS public.remove_account_member(UUID);
CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_caller_role account_role_enum;
  v_target_role account_role_enum;
  v_fallback UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT active_account_id INTO v_account_id FROM profiles WHERE user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No active organization' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_caller_role FROM account_members
  WHERE user_id = auth.uid() AND account_id = v_account_id AND status = 'active';
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the organization instead'
      USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_target_role FROM account_members
  WHERE user_id = p_user_id AND account_id = v_account_id AND status = 'active';
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of your organization' USING ERRCODE = '22023';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the organization owner; transfer ownership first' USING ERRCODE = '22023';
  END IF;

  UPDATE account_members SET status = 'removed'
  WHERE user_id = p_user_id AND account_id = v_account_id;

  -- If the removed member had this account active, move them to another
  -- active membership (or NULL → they land on onboarding next request).
  SELECT account_id INTO v_fallback FROM account_members
  WHERE user_id = p_user_id AND status = 'active' AND account_id <> v_account_id
  ORDER BY created_at ASC LIMIT 1;

  UPDATE profiles
  SET active_account_id = v_fallback,
      account_id = COALESCE(v_fallback, account_id)
  WHERE user_id = p_user_id AND active_account_id = v_account_id;
END;
$$;
ALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;

-- transfer_account_ownership: owner of the active account hands it over.
CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_new_owner_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_caller_role account_role_enum;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT active_account_id INTO v_account_id FROM profiles WHERE user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No active organization' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_caller_role FROM account_members
  WHERE user_id = auth.uid() AND account_id = v_account_id AND status = 'active';
  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the organization owner can transfer ownership' USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You are already the owner' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_target_role FROM account_members
  WHERE user_id = p_new_owner_user_id AND account_id = v_account_id AND status = 'active';
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of your organization' USING ERRCODE = '22023';
  END IF;

  UPDATE account_members SET role = 'admin'
  WHERE user_id = auth.uid() AND account_id = v_account_id;
  UPDATE account_members SET role = 'owner'
  WHERE user_id = p_new_owner_user_id AND account_id = v_account_id;
  UPDATE accounts SET owner_user_id = p_new_owner_user_id WHERE id = v_account_id;

  -- Keep the legacy profiles mirror consistent for both users.
  UPDATE profiles SET account_role = 'admin'
  WHERE user_id = auth.uid() AND active_account_id = v_account_id;
  UPDATE profiles SET account_role = 'owner'
  WHERE user_id = p_new_owner_user_id AND active_account_id = v_account_id;
END;
$$;
ALTER FUNCTION public.transfer_account_ownership(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID) TO authenticated;

-- ============================================================
-- 16. redeem_invitation — N:N: ADD a membership (keep existing ones)
--
-- Unlike the 019 version (which destructively moved profile.account_id
-- and deleted the personal account), this inserts / re-activates an
-- account_members row for the invited account and makes it active. The
-- caller keeps every other organization they already belong to. Fully
-- idempotent: a second redeem by an already-active member is a no-op
-- that just re-selects the account.
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- Already an active member → idempotent: accept + select, no dup row.
  IF EXISTS (
    SELECT 1 FROM account_members
    WHERE user_id = v_caller AND account_id = v_inv.account_id AND status = 'active'
  ) THEN
    UPDATE account_invitations
    SET accepted_at = COALESCE(accepted_at, NOW()),
        accepted_by_user_id = COALESCE(accepted_by_user_id, v_caller)
    WHERE id = v_inv.id;
    UPDATE profiles SET active_account_id = v_inv.account_id,
                        account_id = v_inv.account_id,
                        account_role = v_inv.role
    WHERE user_id = v_caller;
    RETURN v_inv.account_id;
  END IF;

  -- A single-use token that was already consumed by SOMEONE ELSE stays
  -- closed. (If the same caller re-runs, the branch above short-circuits.)
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO account_members (account_id, user_id, role, status, invited_by, joined_at)
  VALUES (v_inv.account_id, v_caller, v_inv.role, 'active', v_inv.created_by_user_id, NOW())
  ON CONFLICT (account_id, user_id) DO UPDATE
    SET status = 'active', role = EXCLUDED.role, joined_at = NOW();

  UPDATE account_invitations
  SET accepted_at = NOW(), accepted_by_user_id = v_caller
  WHERE id = v_inv.id;

  -- Select the newly joined org as active; keep the legacy mirror aligned.
  UPDATE profiles
  SET active_account_id = v_inv.account_id,
      account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller;

  RETURN v_inv.account_id;
END;
$$;
ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;

-- ============================================================
-- 17. RLS — account_members
--
-- SELECT: a user always sees their OWN membership rows (any account,
-- any status — needed by get_user_accounts fallbacks and self checks),
-- plus co-members of the currently ACTIVE account (is_account_member).
-- No client INSERT/UPDATE/DELETE — all writes go through the SECURITY
-- DEFINER RPCs above.
-- ============================================================
DROP POLICY IF EXISTS account_members_select ON account_members;
CREATE POLICY account_members_select ON account_members FOR SELECT
  USING (user_id = auth.uid() OR is_account_member(account_id));

-- ============================================================
-- 18. Table privileges for PostgREST roles (align with 037)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON account_members TO authenticated, service_role;
