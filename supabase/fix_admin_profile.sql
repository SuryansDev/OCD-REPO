-- If your admin account exists in auth.users but is missing from public.users, 
-- run this script in your Supabase SQL Editor to manually link them!

INSERT INTO public.users (id, role, approval_status, full_name, email)
SELECT 
  id, 
  'admin' as role, 
  'approved' as approval_status, 
  'System Admin' as full_name, 
  email
FROM auth.users
WHERE email = 'admin@admin.com'
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'admin',
  approval_status = 'approved';
