-- ============================================================
-- Fix: Allow mentors to remove mentees from cohort
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Allow mentors and admins to delete from public.mentorships
DROP POLICY IF EXISTS "Admins can delete mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors can delete own mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors or Admins can delete mentorships" ON public.mentorships;

CREATE POLICY "Mentors or Admins can delete mentorships"
ON public.mentorships FOR DELETE
USING (mentor_id = auth.uid() OR public.is_admin());

-- 2. Allow mentors, mentees, and admins to delete from public.mentorship_requests
DROP POLICY IF EXISTS "Users can delete own requests" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Admins can delete mentorship requests" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Users or Admins can delete mentorship requests" ON public.mentorship_requests;

CREATE POLICY "Users or Admins can delete mentorship requests"
ON public.mentorship_requests FOR DELETE
USING (mentor_id = auth.uid() OR mentee_id = auth.uid() OR public.is_admin());
