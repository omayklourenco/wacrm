-- Ciclo 001-R — RLS cross-account smoke (local only)
-- Run as supabase_admin.

ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@test.local', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{}', '{}', false, '', '', '', ''),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@test.local', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{}', '{}', false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.contacts WHERE id IN (
  'c1111111-1111-1111-1111-111111111111',
  'c2222222-2222-2222-2222-222222222222'
);
DELETE FROM public.profiles WHERE user_id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
DELETE FROM public.accounts WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

INSERT INTO public.accounts (id, name, owner_user_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Account A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'Account B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A', 'a@test.local',
   '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'User B', 'b@test.local',
   '22222222-2222-2222-2222-222222222222', 'owner');

INSERT INTO public.contacts (id, account_id, user_id, phone, name) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+11111111111', 'Contact A'),
  ('c2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '+22222222222', 'Contact B');

ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;

SELECT count(*) AS user_a_contact_count FROM contacts;
SELECT count(*) AS user_a_sees_b FROM contacts WHERE id = 'c2222222-2222-2222-2222-222222222222';
UPDATE contacts SET name = 'Hacked' WHERE id = 'c2222222-2222-2222-2222-222222222222';
SELECT count(*) AS cross_update_visible FROM contacts WHERE id = 'c2222222-2222-2222-2222-222222222222' AND name = 'Hacked';

RESET ROLE;
SELECT name AS contact_b_name FROM contacts WHERE id = 'c2222222-2222-2222-2222-222222222222';
