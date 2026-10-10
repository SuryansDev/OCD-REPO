-- Drop the old recursive policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Admins can view all mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Admins can view all tasks" ON public.tasks;

-- Create a helper function that bypasses RLS to check for admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER 
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Create the new non-recursive policies
CREATE POLICY "Admins can view all users" ON public.users FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all users" ON public.users FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can view all mentorships" ON public.mentorships FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can view all tasks" ON public.tasks FOR SELECT USING (public.is_admin());
