-- Drop the restrictive policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Mentors can view mentee profiles" ON public.users;

-- Allow all authenticated users to see the user directory so they can request mentees
CREATE POLICY "Anyone can view user profiles" ON public.users FOR SELECT USING (true);
