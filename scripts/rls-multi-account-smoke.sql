-- ============================================================
-- Ciclo 002-R — RLS multi-account smoke (local only)
--
-- Exercises the N:N membership model + active-account scoping added
-- by migration 038. Run as supabase_admin against a fresh
-- `supabase db reset`:
--
--   psql "$DATABASE_URL" -f scripts/rls-multi-account-smoke.sql
--
-- Reads back a series of labelled counts. Expected values are noted
-- inline as `-- EXPECT`. Every cross-account count MUST be 0.
--
-- Actor model
--   User A  belongs to Account A (owner) AND Account B (agent)   → N:N
--   User C  belongs to Account C (owner)
-- ============================================================

-- NOTE: we do NOT disable on_auth_user_created here — the psql role
-- (postgres) is not the owner of auth.users. The trigger therefore
-- fires and creates a personal account/profile/membership per test
-- user; the cleanup + idempotent UPSERTs below re-point those rows at
-- the fixed fixtures and drop the auto-created personal orgs so the
-- membership counts are exact.

-- ---- auth users -------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a2@test.local', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{}', '{}', false, '', '', '', ''),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'c2@test.local', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{}', '{}', false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ---- clean slate ------------------------------------------------
DELETE FROM public.tags WHERE account_id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333');
DELETE FROM public.contacts WHERE id IN (
  'c1111111-1111-1111-1111-111111111111',
  'c2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333');
DELETE FROM public.account_members WHERE user_id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc');
DELETE FROM public.account_invitations WHERE account_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM public.profiles WHERE user_id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc');
DELETE FROM public.accounts WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333');

-- ---- accounts ---------------------------------------------------
INSERT INTO public.accounts (id, name, owner_user_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Account A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'Account B', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('33333333-3333-3333-3333-333333333333', 'Account C', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- ---- profiles (idempotent — the signup trigger may have created these) --
INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role, active_account_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A', 'a2@test.local',
   '11111111-1111-1111-1111-111111111111', 'owner', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'User C', 'c2@test.local',
   '33333333-3333-3333-3333-333333333333', 'owner', '33333333-3333-3333-3333-333333333333')
ON CONFLICT (user_id) DO UPDATE
  SET account_id = EXCLUDED.account_id,
      account_role = EXCLUDED.account_role,
      active_account_id = EXCLUDED.active_account_id;

-- Drop any personal orgs the signup trigger auto-created for the test
-- users (anything they own that is not a fixed fixture). Profiles now
-- point at the fixtures, so the cascade only removes the stray orgs.
DELETE FROM public.account_members
WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc')
  AND account_id NOT IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333');
DELETE FROM public.accounts
WHERE owner_user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc')
  AND id NOT IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333');

-- ---- memberships (N:N) ------------------------------------------
INSERT INTO public.account_members (account_id, user_id, role, status, joined_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active', now()),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'agent', 'active', now()),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner', 'active', now())
ON CONFLICT (account_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

-- ---- domain data ------------------------------------------------
INSERT INTO public.contacts (id, account_id, user_id, phone, name) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+11111111111', 'Contact A'),
  ('c2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', '+22222222222', 'Contact B'),
  ('c3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', '+33333333333', 'Contact C');

-- ---- a pending (unaccepted) invitation to Account C -------------
INSERT INTO public.account_invitations (account_id, token_hash, role, expires_at)
VALUES ('33333333-3333-3333-3333-333333333333', 'smoke-pending-token-hash', 'agent', now() + interval '1 day')
ON CONFLICT (token_hash) DO NOTHING;

-- ============================================================
-- Authenticate as User A
-- ============================================================
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);

-- ---- (1) active = Account A -------------------------------------
UPDATE public.profiles SET active_account_id = '11111111-1111-1111-1111-111111111111'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SET ROLE authenticated;
SELECT '01_A_active_sees_A' AS check, count(*) AS n FROM contacts;                         -- EXPECT 1
SELECT '02_A_active_sees_B' AS check, count(*) AS n FROM contacts WHERE account_id = '22222222-2222-2222-2222-222222222222'; -- EXPECT 0
SELECT '03_A_active_sees_C' AS check, count(*) AS n FROM contacts WHERE account_id = '33333333-3333-3333-3333-333333333333'; -- EXPECT 0
SELECT '04_get_user_accounts' AS check, count(*) AS n FROM get_user_accounts();            -- EXPECT 2
-- owner of A may write settings-class (tags need admin+)
INSERT INTO tags (account_id, user_id, name, color)
VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A-tag', '#fff');
SELECT '05_owner_A_wrote_tag' AS check, count(*) AS n FROM tags WHERE account_id = '11111111-1111-1111-1111-111111111111'; -- EXPECT 1
RESET ROLE;

-- ---- (2) switch active to Account B via the RPC -----------------
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
SELECT set_active_account('22222222-2222-2222-2222-222222222222');
SELECT '06_switch_B_sees_B' AS check, count(*) AS n FROM contacts;                         -- EXPECT 1 (cB only)
SELECT '07_switch_B_still_sees_A' AS check, count(*) AS n FROM contacts WHERE account_id = '11111111-1111-1111-1111-111111111111'; -- EXPECT 0
-- agent in B must NOT write settings-class (tags need admin+)
DO $$
BEGIN
  BEGIN
    INSERT INTO tags (account_id, user_id, name, color)
    VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B-tag', '#000');
    RAISE NOTICE '08_agent_B_wrote_tag: UNEXPECTED SUCCESS';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE '08_agent_B_wrote_tag: correctly blocked';
  END;
END $$;
SELECT '08_agent_B_tag_count' AS check, count(*) AS n FROM tags WHERE account_id = '22222222-2222-2222-2222-222222222222'; -- EXPECT 0
RESET ROLE;

-- ---- (3) try to switch to Account C (not a member) --------------
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM set_active_account('33333333-3333-3333-3333-333333333333');
    RAISE NOTICE '09_switch_to_C: UNEXPECTED SUCCESS';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '09_switch_to_C: correctly denied (not a member)';
  END;
END $$;
RESET ROLE;

-- ---- (4) suspend A's membership in B, then read -----------------
UPDATE public.account_members SET status = 'suspended'
WHERE account_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
SELECT '10_suspended_B_sees_B' AS check, count(*) AS n FROM contacts;                      -- EXPECT 0
RESET ROLE;

-- ---- (5) remove A's membership in B, then read ------------------
UPDATE public.account_members SET status = 'removed'
WHERE account_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
SELECT '11_removed_B_sees_B' AS check, count(*) AS n FROM contacts;                        -- EXPECT 0
SELECT '12_removed_get_user_accounts' AS check, count(*) AS n FROM get_user_accounts();    -- EXPECT 1 (only A)
RESET ROLE;

-- ---- (6) pending invitation grants nothing ----------------------
-- User A is not a member of C; a pending invite row must not leak C data.
UPDATE public.profiles SET active_account_id = '11111111-1111-1111-1111-111111111111'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
SELECT '13_pending_invite_sees_C' AS check, count(*) AS n FROM contacts WHERE account_id = '33333333-3333-3333-3333-333333333333'; -- EXPECT 0
RESET ROLE;

-- ---- catalog ----------------------------------------------------
SELECT 'rls_tables' AS check, count(*) AS n FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;
SELECT 'policies' AS check, count(*) AS n FROM pg_policies WHERE schemaname = 'public';
