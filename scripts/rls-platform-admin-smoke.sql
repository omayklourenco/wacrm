-- ============================================================
-- Ciclo 003-R — Platform Super Admin RLS smoke (local only)
--
--   Get-Content scripts/rls-platform-admin-smoke.sql -Raw |
--     docker exec -i supabase_db_wacrm psql -U postgres -d postgres
-- ============================================================

-- Seed a tenant user + a platform admin user via auth.users inserts.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'tenant@test.local', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{}', '{}', false, '', '', '', ''),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'padmin@test.local', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{}', '{}', false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Cleanup fixtures from prior runs
DELETE FROM public.platform_audit_logs WHERE actor_user_id IN (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
DELETE FROM public.platform_admins WHERE user_id IN (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

-- Grant platform admin to E (service_role path: auth.uid() is null here)
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
RESET ROLE;
SELECT grant_platform_admin('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'super_admin');

-- ---- Tenant cannot read platform_admins / audit ----
SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT '01_tenant_reads_platform_admins' AS check, count(*) AS n FROM platform_admins; -- EXPECT 0
SELECT '02_tenant_reads_audit' AS check, count(*) AS n FROM platform_audit_logs; -- EXPECT 0
DO $$
BEGIN
  BEGIN
    INSERT INTO platform_admins (user_id, role, status)
    VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'super_admin', 'active');
    RAISE NOTICE '03_tenant_insert: UNEXPECTED SUCCESS';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE '03_tenant_insert: correctly blocked';
  END;
END $$;
SELECT '03_tenant_platform_admins_after_insert' AS check, count(*) AS n FROM platform_admins; -- EXPECT 0
RESET ROLE;

-- ---- Platform admin active can see own row ----
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT '04_is_platform_admin' AS check, is_platform_admin()::int AS n; -- EXPECT 1
SELECT '05_admin_reads_own_row' AS check, count(*) AS n FROM platform_admins; -- EXPECT 1
RESET ROLE;

-- ---- Suspend the platform admin; helper returns false ----
UPDATE platform_admins SET status = 'suspended'
WHERE user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', false);
SET ROLE authenticated;
SELECT '06_suspended_is_platform_admin' AS check, is_platform_admin()::int AS n; -- EXPECT 0
SELECT '07_suspended_reads_own_row' AS check, count(*) AS n FROM platform_admins; -- EXPECT 0 (policy requires active)
RESET ROLE;

-- Restore for cleanup
UPDATE platform_admins SET status = 'active'
WHERE user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- ---- Catalog ----
SELECT 'rls_tables' AS check, count(*) AS n FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;
SELECT 'policies' AS check, count(*) AS n FROM pg_policies WHERE schemaname = 'public';
