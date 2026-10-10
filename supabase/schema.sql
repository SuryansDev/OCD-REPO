-- ============================================================
-- OCD (Online Coding Dashboard) — Supabase Database Schema V2
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. USERS TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('admin', 'mentor', 'mentee')),
  approval_status  TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  
  -- New fields (Made mandatory)
  year             TEXT NOT NULL,
  branch           TEXT NOT NULL,
  contact_number   TEXT NOT NULL,
  roll_number      TEXT NOT NULL,

  cf_handle        TEXT NOT NULL,
  lc_handle        TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. MENTORSHIPS TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.mentorships (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mentor_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentee_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_mentorship UNIQUE (mentor_id, mentee_id)
);

-- ────────────────────────────────────────────────────────────
-- 3. TASKS TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.tasks (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assigned_by         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('Codeforces', 'LeetCode')),
  problem_slug_or_id  TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
  assigned_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assigned_to_date ON public.tasks (assigned_to, assigned_date);
CREATE INDEX idx_tasks_assigned_by_date ON public.tasks (assigned_by, assigned_date);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks       ENABLE ROW LEVEL SECURITY;

-- ── SECURITY DEFINER HELPER ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── USERS ───────────────────────────────────────────────────
-- Admins can view and update all users
CREATE POLICY "Admins can view all users" ON public.users FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all users" ON public.users FOR UPDATE USING (public.is_admin());

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Mentors can view mentee profiles" ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.mentorships WHERE mentor_id = auth.uid() AND mentee_id = users.id)
);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- ── MENTORSHIPS ─────────────────────────────────────────────
CREATE POLICY "Admins can view all mentorships" ON public.mentorships FOR SELECT USING (public.is_admin());
CREATE POLICY "Mentors can view own mentorships" ON public.mentorships FOR SELECT USING (mentor_id = auth.uid());
CREATE POLICY "Mentees can view own mentorships" ON public.mentorships FOR SELECT USING (mentee_id = auth.uid());
CREATE POLICY "Mentors can create mentorships" ON public.mentorships FOR INSERT WITH CHECK (
  mentor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'mentor')
);
CREATE POLICY "Mentors can delete own mentorships" ON public.mentorships FOR DELETE USING (mentor_id = auth.uid());

-- ── TASKS ───────────────────────────────────────────────────
CREATE POLICY "Admins can view all tasks" ON public.tasks FOR SELECT USING (public.is_admin());
CREATE POLICY "Mentees can view own tasks" ON public.tasks FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "Mentors can view assigned tasks" ON public.tasks FOR SELECT USING (assigned_by = auth.uid());
CREATE POLICY "Mentors can create tasks" ON public.tasks FOR INSERT WITH CHECK (
  assigned_by = auth.uid() AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'mentor')
);
CREATE POLICY "Mentees can update own task status" ON public.tasks FOR UPDATE USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

-- ============================================================
-- TRIGGER: Auto-create a users row on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, role, approval_status, full_name, email, year, branch, contact_number, roll_number, cf_handle, lc_handle)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'mentee'),
    'pending', -- All new users are pending by default
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    NEW.raw_user_meta_data ->> 'year',
    NEW.raw_user_meta_data ->> 'branch',
    NEW.raw_user_meta_data ->> 'contact_number',
    NEW.raw_user_meta_data ->> 'roll_number',
    NEW.raw_user_meta_data ->> 'cf_handle',
    NEW.raw_user_meta_data ->> 'lc_handle'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
