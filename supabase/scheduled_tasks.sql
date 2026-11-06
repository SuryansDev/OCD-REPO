-- ============================================================
-- OCD: Scheduled Tasks Table & Auto-Refresh Support
-- ============================================================
-- Run this in your Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mentor_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('Codeforces', 'LeetCode', 'YouTube')),
  problem_slug_or_id  TEXT NOT NULL,
  target_year         TEXT,
  scheduled_date      DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rolled_out', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_out_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_date_status ON public.scheduled_tasks (scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_mentor ON public.scheduled_tasks (mentor_id);

-- Enable RLS
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

-- Mentors can view their own scheduled tasks; Admins can view all
CREATE POLICY "Mentors can view own scheduled tasks" 
  ON public.scheduled_tasks FOR SELECT 
  USING (mentor_id = auth.uid() OR public.is_admin());

-- Mentors can create scheduled tasks for their cohort
CREATE POLICY "Mentors can insert own scheduled tasks" 
  ON public.scheduled_tasks FOR INSERT 
  WITH CHECK (mentor_id = auth.uid() OR public.is_admin());

-- Mentors can update or cancel their own scheduled tasks
CREATE POLICY "Mentors can update own scheduled tasks" 
  ON public.scheduled_tasks FOR UPDATE 
  USING (mentor_id = auth.uid() OR public.is_admin());

-- Mentors can delete their own scheduled tasks
CREATE POLICY "Mentors can delete own scheduled tasks" 
  ON public.scheduled_tasks FOR DELETE 
  USING (mentor_id = auth.uid() OR public.is_admin());

