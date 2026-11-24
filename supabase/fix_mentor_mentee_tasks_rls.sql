-- ============================================================
-- Fix: Mentors can view all tasks of their mentees
-- ============================================================
-- Run this in your Supabase SQL Editor if mentors are unable
-- to view questions assigned to their mentees by the Common Mentor.

DROP POLICY IF EXISTS "Mentors can view assigned tasks" ON public.tasks;

CREATE POLICY "Mentors can view assigned tasks" ON public.tasks FOR SELECT USING (
  -- 1. Tasks assigned by this mentor
  assigned_by = auth.uid()
  -- 2. Tasks assigned to any mentee of this mentor (e.g. by Common Mentor or Admin)
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
