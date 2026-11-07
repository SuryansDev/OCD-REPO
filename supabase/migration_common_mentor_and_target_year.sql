-- ============================================================
-- OCD: Common Mentor Role & 30-Day Scheduling Migration
-- ============================================================
-- Run this in your Supabase Dashboard > SQL Editor:

-- 1. Update users role check constraint to include 'common_mentor'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'common_mentor'));

-- 2. Add target_year to scheduled_tasks table (for Common Mentor assigning to a whole year)
ALTER TABLE public.scheduled_tasks ADD COLUMN IF NOT EXISTS target_year TEXT;

-- 3. Create index on target_year for fast query during daily rollout
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_target_year ON public.scheduled_tasks (target_year);

-- 4. Update RLS policies on tasks so Common Mentors and Admins can create and view tasks for any student
DROP POLICY IF EXISTS "Mentors can create tasks" ON public.tasks;
CREATE POLICY "Mentors can create tasks" ON public.tasks FOR INSERT WITH CHECK (
  assigned_by = auth.uid() AND (
    EXISTS (SELECT 1 FROM public.mentorships WHERE mentor_id = auth.uid() AND mentee_id = tasks.assigned_to)
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('common_mentor', 'admin'))
  )
);

DROP POLICY IF EXISTS "Mentors can view assigned tasks" ON public.tasks;
CREATE POLICY "Mentors can view assigned tasks" ON public.tasks FOR SELECT USING (
  assigned_by = auth.uid() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'common_mentor')
);
