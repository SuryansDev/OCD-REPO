-- 1. Create mentorship_requests table
CREATE TABLE public.mentorship_requests (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mentor_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentee_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_mentorship_req UNIQUE (mentor_id, mentee_id)
);

-- 2. Update roles constraint
-- PostgreSQL requires dropping the old constraint and adding a new one for CHECK constraints
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));

-- 3. Update existing users to 'user'
UPDATE public.users SET role = 'user' WHERE role IN ('mentor', 'mentee');

-- 4. Apply new RLS Policies for mentorships and requests
ALTER TABLE public.mentorship_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all mentorship requests" ON public.mentorship_requests FOR SELECT USING (public.is_admin());
CREATE POLICY "Users can view own requests" ON public.mentorship_requests FOR SELECT USING (mentor_id = auth.uid() OR mentee_id = auth.uid());
CREATE POLICY "Users can create mentorship requests" ON public.mentorship_requests FOR INSERT WITH CHECK (mentee_id = auth.uid() AND status = 'pending');
CREATE POLICY "Admins can update mentorship requests" ON public.mentorship_requests FOR UPDATE USING (public.is_admin());
CREATE POLICY "Mentees can resubmit rejected mentorship requests" ON public.mentorship_requests FOR UPDATE USING (mentee_id = auth.uid() AND status = 'rejected') WITH CHECK (mentee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Mentors can view own mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentees can view own mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors can create mentorships" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors can delete own mentorships" ON public.mentorships;

CREATE POLICY "Users can view own mentorships" ON public.mentorships FOR SELECT USING (mentor_id = auth.uid() OR mentee_id = auth.uid());
CREATE POLICY "Admins can insert mentorships" ON public.mentorships FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete mentorships" ON public.mentorships FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Mentors can create tasks" ON public.tasks;
CREATE POLICY "Mentors can create tasks" ON public.tasks FOR INSERT WITH CHECK (
  assigned_by = auth.uid() AND EXISTS (SELECT 1 FROM public.mentorships WHERE mentor_id = auth.uid() AND mentee_id = tasks.assigned_to)
);
