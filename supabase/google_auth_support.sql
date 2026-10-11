-- ============================================================
-- OCD: Google Workspace OAuth Support & Onboarding Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Allow profile columns to be populated during onboarding
-- (Google OAuth creates the auth user before student profile details are submitted)
ALTER TABLE public.users ALTER COLUMN year DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN branch DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN contact_number DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN roll_number DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN cf_handle DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN lc_handle DROP NOT NULL;

-- 2. Update trigger to safely handle Google OAuth signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'user'),
    'pending', -- Always pending approval by default
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'year', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'branch', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'contact_number', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'roll_number', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'cf_handle', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'lc_handle', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
