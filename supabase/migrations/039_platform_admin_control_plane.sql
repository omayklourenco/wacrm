-- ============================================================
-- 039_platform_admin_control_plane.sql — Ciclo 003-R
--
-- Platform Super Admin control plane, separated from tenant RBAC.
--
-- What this migration does
--   1. platform_admins — global identity (NOT derived from tenant owner).
--   2. platform_audit_logs — append-only administrative audit trail.
--   3. accounts.platform_status (+ suspension metadata).
--   4. Helpers: is_platform_admin, has_platform_role,
--      get_platform_admin_profile, grant/revoke_platform_admin.
--   5. Update get_user_accounts / set_active_account for suspension.
--   6. RLS: tenants cannot read platform tables; only active platform
--      admins can SELECT their own admin row + audit logs.
--
-- What this does NOT do
--   - Billing / Stripe / plans (only nullable plan_code placeholder).
--   - Auto-grant Super Admin on signup.
--   - Impersonation.
--
-- Rollback (documented)
--   DROP the helpers + tables; DROP columns on accounts; restore
--   get_user_accounts / set_active_account from migration 038.
-- ============================================================

-- ============================================================
-- 1. TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_admin_role_enum') THEN
    CREATE TYPE platform_admin_role_enum AS ENUM ('super_admin', 'platform_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_admin_status_enum') THEN
    CREATE TYPE platform_admin_status_enum AS ENUM ('active', 'suspended', 'revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_platform_status_enum') THEN
    CREATE TYPE account_platform_status_enum AS ENUM ('active', 'suspended');
  END IF;
END $$;

-- ============================================================
-- 2. PLATFORM_ADMINS
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          platform_admin_role_enum NOT NULL DEFAULT 'platform_admin',
  status        platform_admin_status_enum NOT NULL DEFAULT 'active',
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT platform_admins_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_status
  ON platform_admins(status) WHERE status = 'active';

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON platform_admins;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. PLATFORM_AUDIT_LOGS (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  actor_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  target_type       TEXT NOT NULL,
  target_id         UUID,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created
  ON platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_target
  ON platform_audit_logs(target_type, target_id);

ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. ACCOUNTS — platform status + soft plan placeholders
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS platform_status account_platform_status_enum NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  -- Future entitlements placeholders (no billing logic in this cycle).
  ADD COLUMN IF NOT EXISTS plan_code TEXT,
  ADD COLUMN IF NOT EXISTS plan_status TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_platform_status
  ON accounts(platform_status);

-- ============================================================
-- 5. is_platform_admin / has_platform_role
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
      AND pa.status = 'active'
  );
$$;
ALTER FUNCTION public.is_platform_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_platform_role(p_roles platform_admin_role_enum[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
      AND pa.status = 'active'
      AND pa.role = ANY (p_roles)
  );
$$;
ALTER FUNCTION public.has_platform_role(platform_admin_role_enum[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_platform_role(platform_admin_role_enum[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_role(platform_admin_role_enum[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_platform_admin_profile()
RETURNS TABLE (
  platform_admin_id UUID,
  user_id UUID,
  role platform_admin_role_enum,
  status platform_admin_status_enum
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pa.id, pa.user_id, pa.role, pa.status
  FROM public.platform_admins pa
  WHERE pa.user_id = auth.uid()
    AND pa.status = 'active'
  LIMIT 1;
$$;
ALTER FUNCTION public.get_platform_admin_profile() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_platform_admin_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_admin_profile() TO authenticated;

-- ============================================================
-- 6. grant / revoke — service_role + super_admin only
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_platform_admin(
  p_user_id UUID,
  p_role platform_admin_role_enum DEFAULT 'platform_admin'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_caller UUID := auth.uid();
BEGIN
  -- Allowed when: service_role (no auth.uid) OR active super_admin.
  IF v_caller IS NOT NULL AND NOT public.has_platform_role(ARRAY['super_admin']::platform_admin_role_enum[]) THEN
    RAISE EXCEPTION 'Only a super_admin can grant platform admin' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.platform_admins (user_id, role, status, created_by)
  VALUES (p_user_id, p_role, 'active', v_caller)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
ALTER FUNCTION public.grant_platform_admin(UUID, platform_admin_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grant_platform_admin(UUID, platform_admin_role_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_platform_admin(UUID, platform_admin_role_enum) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_platform_admin(UUID, platform_admin_role_enum) TO service_role;
-- Authenticated super_admins call via the API with service-role after
-- requirePlatformAdminContext — keep EXECUTE on authenticated for the
-- self-check path when called from a session that is already super_admin.
GRANT EXECUTE ON FUNCTION public.grant_platform_admin(UUID, platform_admin_role_enum) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_platform_admin(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_target_role platform_admin_role_enum;
  v_active_supers INT;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_platform_role(ARRAY['super_admin']::platform_admin_role_enum[]) THEN
    RAISE EXCEPTION 'Only a super_admin can revoke platform admin' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_target_role FROM public.platform_admins
  WHERE user_id = p_user_id AND status = 'active';
  IF v_target_role IS NULL THEN
    RETURN; -- idempotent
  END IF;

  IF v_target_role = 'super_admin' THEN
    SELECT count(*) INTO v_active_supers FROM public.platform_admins
    WHERE role = 'super_admin' AND status = 'active';
    IF v_active_supers <= 1 THEN
      RAISE EXCEPTION 'Cannot revoke the last active super_admin' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'Cannot revoke your own platform admin access' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_admins
  SET status = 'revoked', updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;
ALTER FUNCTION public.revoke_platform_admin(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_platform_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_platform_admin(UUID) TO authenticated, service_role;

-- ============================================================
-- 7. Update get_user_accounts — expose platform_status
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_accounts();
CREATE OR REPLACE FUNCTION public.get_user_accounts()
RETURNS TABLE (
  account_id UUID,
  name TEXT,
  role account_role_enum,
  status membership_status_enum,
  is_active BOOLEAN,
  platform_status account_platform_status_enum
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
         (a.id = p.active_account_id) AS is_active,
         a.platform_status
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
-- 8. set_active_account — refuse suspended organizations
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_active_account(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform_status account_platform_status_enum;
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

  SELECT platform_status INTO v_platform_status
  FROM accounts WHERE id = p_account_id;

  IF v_platform_status = 'suspended' THEN
    RAISE EXCEPTION 'This organization is suspended'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET active_account_id = p_account_id,
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
-- 9. RLS — platform tables
--
-- Tenants: no access.
-- Active platform admins: SELECT own row + SELECT audit logs.
-- Mutations: SECURITY DEFINER RPCs / service-role only (no client INSERT).
-- ============================================================
DROP POLICY IF EXISTS platform_admins_select ON platform_admins;
CREATE POLICY platform_admins_select ON platform_admins FOR SELECT
  USING (user_id = auth.uid() AND status = 'active');

DROP POLICY IF EXISTS platform_audit_logs_select ON platform_audit_logs;
CREATE POLICY platform_audit_logs_select ON platform_audit_logs FOR SELECT
  USING (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policies for authenticated on either table
-- → tenants and even platform admins cannot mutate via PostgREST; only
-- service-role / DEFINER RPCs write.

-- ============================================================
-- 10. Grants
-- ============================================================
GRANT SELECT ON platform_admins TO authenticated, service_role;
GRANT SELECT ON platform_audit_logs TO authenticated, service_role;
GRANT ALL ON platform_admins TO service_role;
GRANT ALL ON platform_audit_logs TO service_role;
