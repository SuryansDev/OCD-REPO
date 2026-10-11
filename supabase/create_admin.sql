-- ============================================================
-- FULL-FLEDGED SCRIPT TO CREATE / PROMOTE ADMIN ACCOUNT
-- Run this directly in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_admin_email       TEXT := 'admin@nitkkr.ac.in';     -- Change if desired
  v_admin_password    TEXT := 'Admin@12345';            -- Change if desired
  v_admin_id          UUID;
BEGIN
  -- 1. Check if auth user already exists
  SELECT id INTO v_admin_id FROM auth.users WHERE email = v_admin_email;

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    
    -- Insert new auth user with confirmed email and password
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
      v_admin_id,
      'authenticated',
      'authenticated',
      v_admin_email,
      crypt(v_admin_password, gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'full_name', 'System Admin',
        'role', 'admin',
        'year', 'N/A',
        'branch', 'Admin',
        'contact_number', '0000000000',
        'roll_number', 'ADMIN01',
        'cf_handle', 'admin',
        'lc_handle', 'admin'
      ),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  ELSE
    -- If user already exists in auth, update password and metadata
    UPDATE auth.users
    SET 
      encrypted_password = crypt(v_admin_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb,
      updated_at = now()
    WHERE id = v_admin_id;
  END IF;

  -- 2. Upsert into public.users with all mandatory NOT NULL fields
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
    lc_handle
  ) VALUES (
    v_admin_id,
    'admin',
    'approved',
    'System Admin',
    v_admin_email,
    'N/A',
    'Admin',
    '0000000000',
    'ADMIN01',
    'admin',
    'admin'
  )
  ON CONFLICT (id) DO UPDATE 
  SET 
    role = 'admin',
    approval_status = 'approved',
    email = EXCLUDED.email;

  RAISE NOTICE 'Admin created/updated successfully with email: %', v_admin_email;
END $$;
