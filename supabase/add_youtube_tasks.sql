-- ============================================================
-- OCD: Allow YouTube links in tasks table platform column
-- ============================================================
-- Run this in your Supabase Dashboard > SQL Editor

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_platform_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_platform_check CHECK (platform IN ('Codeforces', 'LeetCode', 'YouTube'));
