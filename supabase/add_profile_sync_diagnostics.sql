-- ============================================================
-- OCD: Coding Profile API Sync & Privacy Diagnostics Schema Update
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add platform sync diagnostics to user_stats table
-- Tracks whether student profiles have private settings, missing handles, or API errors
ALTER TABLE public.user_stats 
  ADD COLUMN IF NOT EXISTS lc_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS lc_error_msg TEXT,
  ADD COLUMN IF NOT EXISTS cf_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS cf_error_msg TEXT;

-- Helpful index for quick admin lookups
CREATE INDEX IF NOT EXISTS idx_user_stats_lc_status ON public.user_stats (lc_status);
CREATE INDEX IF NOT EXISTS idx_user_stats_cf_status ON public.user_stats (cf_status);
