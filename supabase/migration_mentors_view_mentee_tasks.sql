-- ============================================================
-- Migration: Mentors can view all tasks of their mentees
-- ============================================================
-- Enables all mentors to see all tasks assigned to their mentees,
-- regardless of who assigned the question (Common Mentor, Admin, etc.)

DROP POLICY IF EXISTS "Mentors can view assigned tasks" ON public.tasks;

CREATE POLICY "Mentors can view assigned tasks" ON public.tasks FOR SELECT USING (
  -- 1. Tasks assigned by this mentor
  assigned_by = auth.uid()
  -- 2. Tasks assigned to any mentee of this mentor
  OR EXISTS (
    SELECT 1 FROM public.mentorships
    WHERE mentor_id = auth.uid() AND mentee_id = tasks.assigned_to
  )
  -- 3. Admins can view all tasks
  OR public.is_admin()
  -- 4. Common Mentors can view all tasks
  OR EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'common_mentor'
  )
);
