-- ============================================================
-- SQL Query: Add External User (Shashank Rathore, 1st Year)
-- Password: password@123
-- Run this in your Supabase Dashboard > SQL Editor
-- ============================================================

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  user_email  TEXT := 'shashank.rathore@gmail.com'; -- Change this to his actual email if needed
  user_pwd    TEXT := 'password@123';
BEGIN
  -- 1. Insert into auth.users (Supabase Authentication)
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
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_pwd, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Shashank Rathore","year":"1"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- 2. Insert into auth.identities (Required by Supabase for email login)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, user_email)::jsonb,
    'email',
    new_user_id::text,
    now(),
    now(),
    now()
  );

  -- 3. Insert or update public.users (Application Profile)
  -- Setting approval_status = 'approved' and roll_number = 'EXTERNAL'
  -- so he directly accesses the dashboard without being blocked by onboarding or pending status
  INSERT INTO public.users (
    id,
    role,
    approval_status,
    full_name,
    email,
    year,
    branch,
    contact_number,
    roll_number,
    cf_handle,
    lc_handle,
    created_at
  ) VALUES (
    new_user_id,
    'user',
    'approved',
    'Shashank Rathore',
    user_email,
    '1',         -- 1st Year
    'External',  -- Not of this college
    '',
    'EXTERNAL',  -- Avoids college roll number onboarding roadblock
    '',
    '',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    approval_status = 'approved',
    year = '1',
    roll_number = 'EXTERNAL',
    branch = 'External',
    full_name = 'Shashank Rathore';

  RAISE NOTICE 'User % created successfully with ID %', user_email, new_user_id;
END $$;
