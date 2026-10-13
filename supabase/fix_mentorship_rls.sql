-- ============================================================
-- Fix: Mentorship Approvals & Management RLS
-- Allows mentors to approve/reject requests and add/remove mentees directly
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Allow mentors and admins to insert into public.mentorships
DROP POLICY IF EXISTS "Admins can insert mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors can insert mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors or Admins can insert mentorships" ON public.mentorships;

CREATE POLICY "Mentors or Admins can insert mentorships"
ON public.mentorships FOR INSERT
WITH CHECK (mentor_id = auth.uid() OR public.is_admin());

-- 2. Allow mentors and admins to delete from public.mentorships
DROP POLICY IF EXISTS "Admins can delete mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors can delete own mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors or Admins can delete mentorships" ON public.mentorships;

CREATE POLICY "Mentors or Admins can delete mentorships"
ON public.mentorships FOR DELETE
USING (mentor_id = auth.uid() OR public.is_admin());

-- 3. Allow mentors and admins to update mentorship requests (accept or decline)
DROP POLICY IF EXISTS "Admins can update mentorship requests" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Mentors can update mentorship requests" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Mentors or Admins can update mentorship requests" ON public.mentorship_requests;

CREATE POLICY "Mentors or Admins can update mentorship requests"
ON public.mentorship_requests FOR UPDATE
USING (mentor_id = auth.uid() OR public.is_admin());

-- 4. Allow mentors, mentees, and admins to delete from public.mentorship_requests
DROP POLICY IF EXISTS "Users can delete own requests" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Admins can delete mentorship requests" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Users or Admins can delete mentorship requests" ON public.mentorship_requests;

CREATE POLICY "Users or Admins can delete mentorship requests"
ON public.mentorship_requests FOR DELETE
USING (mentor_id = auth.uid() OR mentee_id = auth.uid() OR public.is_admin());
