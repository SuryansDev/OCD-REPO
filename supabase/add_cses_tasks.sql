-- ============================================================
-- OCD: Allow CSES links in tasks and scheduled_tasks tables
-- ============================================================
-- Run this in your Supabase Dashboard > SQL Editor

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_platform_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_platform_check CHECK (platform IN ('Codeforces', 'LeetCode', 'YouTube', 'CSES'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduled_tasks') THEN
    ALTER TABLE public.scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_platform_check;
    ALTER TABLE public.scheduled_tasks ADD CONSTRAINT scheduled_tasks_platform_check CHECK (platform IN ('Codeforces', 'LeetCode', 'YouTube', 'CSES'));
  END IF;
END $$;
