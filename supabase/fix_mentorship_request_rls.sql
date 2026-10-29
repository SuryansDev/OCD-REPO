-- Allow mentees to create pending requests and resubmit a rejected request.
-- Run this in the Supabase SQL Editor for an existing project.

ALTER TABLE public.mentorship_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create mentorship requests" ON public.mentorship_requests;
CREATE POLICY "Users can create mentorship requests"
ON public.mentorship_requests FOR INSERT
WITH CHECK (mentee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Mentees can resubmit rejected mentorship requests" ON public.mentorship_requests;
CREATE POLICY "Mentees can resubmit rejected mentorship requests"
ON public.mentorship_requests FOR UPDATE
USING (mentee_id = auth.uid() AND status = 'rejected')
WITH CHECK (mentee_id = auth.uid() AND status = 'pending');
