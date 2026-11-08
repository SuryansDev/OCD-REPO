-- ============================================================
-- OCD: Fix Duplicate Tasks & Enforce Assignment Uniqueness
-- ============================================================
-- Run this in your Supabase Dashboard > SQL Editor

-- 1. Identify and delete redundant duplicate tasks, keeping the completed one (or earliest created)
WITH ranked_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY assigned_to, platform, problem_slug_or_id, assigned_date
      ORDER BY
        CASE WHEN status = 'Completed' THEN 0 ELSE 1 END,
        completed_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM public.tasks
)
DELETE FROM public.tasks
WHERE id IN (
  SELECT id FROM ranked_tasks WHERE rn > 1
);

-- 2. Add unique constraint / index so duplicates can never be inserted again at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_unique_student_problem_date
ON public.tasks (assigned_to, platform, problem_slug_or_id, assigned_date);
