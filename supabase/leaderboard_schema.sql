-- ============================================================
-- OCD Leaderboard Schema — Contest Rankings & Stats
-- ============================================================
-- Run this in your Supabase SQL Editor to add leaderboard support.

-- 1. Store synced user stats (rating, questions solved, streak, latest contest)
CREATE TABLE IF NOT EXISTS public.user_stats (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- LeetCode stats
  lc_rating        REAL,
  lc_total_solved  INT DEFAULT 0,
  lc_latest_contest_name   TEXT,
  lc_latest_contest_rank   INT,
  lc_latest_contest_rating REAL,
  lc_latest_contest_solved INT,
  lc_latest_contest_date   TIMESTAMPTZ,
  
  -- Codeforces stats
  cf_rating        INT,
  cf_max_rating    INT,
  cf_total_solved  INT DEFAULT 0,
  cf_latest_contest_name   TEXT,
  cf_latest_contest_rank   INT,
  cf_latest_contest_rating INT,
  cf_latest_contest_date   TIMESTAMPTZ,
  
  -- Streak tracking (days of consecutive solving across both platforms)
  current_streak   INT DEFAULT 0,
  max_streak       INT DEFAULT 0,
  last_solve_date  DATE,
  
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_user_stats UNIQUE (user_id)
);

-- RLS
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view stats" ON public.user_stats FOR SELECT USING (true);
CREATE POLICY "System can upsert stats" ON public.user_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update stats" ON public.user_stats FOR UPDATE USING (true);
