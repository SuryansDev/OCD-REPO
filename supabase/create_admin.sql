-- Run this in your Supabase SQL Editor to create an admin account.
-- Email: admin@admin.com
-- Password: password
-- Note: This requires the pgcrypto extension (enabled by default in Supabase).

-- 1. Insert into auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@admin.com',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "System Admin"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
RETURNING id;

-- 2. Once the trigger creates the user in public.users, update them to be approved and admin
-- (The trigger will fire automatically on the insert above)
UPDATE public.users 
SET 
  role = 'admin', 
  approval_status = 'approved'
WHERE email = 'admin@admin.com';
