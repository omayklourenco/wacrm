-- ============================================================
-- 037 — Multitenancy / service-role hardening (Ciclo 001-R)
--
-- 1) Signup bootstrap: do not swallow errors (orphan auth.users).
-- 2) Repair helper for existing orphans (service_role only).
-- 3) Tighten EXECUTE grants on SECURITY DEFINER helpers that
--    lacked explicit REVOKE/GRANT in earlier migrations.
-- ============================================================

-- ------------------------------------------------------------
-- 1. handle_new_user — fail closed
-- ------------------------------------------------------------
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

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Bootstrap account+owner profile on signup. Errors abort the auth.users insert (same transaction) so orphans are not created silently.';

-- ------------------------------------------------------------
-- 2. Repair orphan auth users that already exist (ops only)
-- ------------------------------------------------------------
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
  -- Already linked → idempotent no-op.
  SELECT account_id INTO v_account_id
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  SELECT email,
         COALESCE(raw_user_meta_data->>'full_name', '')
    INTO v_email, v_full_name
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found in auth.users', p_user_id;
  END IF;

  -- Profile row may exist without account_id (pre-017 / failed bootstrap).
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    INSERT INTO public.accounts (name, owner_user_id)
    VALUES (COALESCE(NULLIF(v_full_name, ''), v_email, 'My account'), p_user_id)
    RETURNING id INTO v_account_id;

    UPDATE public.profiles
    SET account_id = v_account_id,
        account_role = COALESCE(account_role, 'owner'),
        email = COALESCE(email, v_email),
        full_name = COALESCE(NULLIF(full_name, ''), v_full_name)
    WHERE user_id = p_user_id;
  ELSE
    INSERT INTO public.accounts (name, owner_user_id)
    VALUES (COALESCE(NULLIF(v_full_name, ''), v_email, 'My account'), p_user_id)
    RETURNING id INTO v_account_id;

    INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
    VALUES (p_user_id, v_full_name, v_email, v_account_id, 'owner');
  END IF;

  RETURN v_account_id;
END;
$$;

ALTER FUNCTION public.repair_orphan_user_account(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.repair_orphan_user_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_orphan_user_account(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_orphan_user_account(uuid) TO service_role;

COMMENT ON FUNCTION public.repair_orphan_user_account(uuid) IS
  'Ops-only: create account+owner profile for an auth.users row missing membership. Call via service_role; never from the browser.';

-- ------------------------------------------------------------
-- 3. SECURITY DEFINER grant hygiene
-- ------------------------------------------------------------

-- record_webhook_failure(endpoint_id, max_failures) — was DEFINER
-- without REVOKE; any authenticated caller could deactivate endpoints.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'record_webhook_failure'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) TO service_role';
  END IF;
END $$;

-- recompute_broadcast_counts(bid) — same pattern
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recompute_broadcast_counts'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.recompute_broadcast_counts(uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.recompute_broadcast_counts(uuid) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid) TO service_role';
  END IF;
END $$;

-- touch_presence(p_status text) — caller-scoped; authenticated only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'touch_presence'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.touch_presence(text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.touch_presence(text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.touch_presence(text) TO authenticated, service_role';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Table privileges for PostgREST roles
--
-- Fresh `supabase db reset` applies migrations as a superuser and
-- leaves public tables without SELECT/INSERT/UPDATE/DELETE for
-- `authenticated` / `service_role`. RLS policies then cannot fire
-- usefully for app clients. Align with Supabase defaults.
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO authenticated, service_role;

-- Re-apply the tighter REVOKE/GRANT overrides from section 3 so the
-- broad EXECUTE grant above does not reopen admin helpers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_webhook_failure'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recompute_broadcast_counts'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.recompute_broadcast_counts(uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.recompute_broadcast_counts(uuid) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'repair_orphan_user_account'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.repair_orphan_user_account(uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.repair_orphan_user_account(uuid) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.repair_orphan_user_account(uuid) TO service_role';
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
