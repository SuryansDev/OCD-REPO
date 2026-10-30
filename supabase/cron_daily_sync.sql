-- ============================================================
-- OCD: Supabase pg_cron & pg_net Setup for Daily 00:00 AM IST Sync
-- ============================================================
-- If you want Supabase to trigger the sync directly via PostgreSQL:
-- 1. Enable pg_cron and pg_net extensions in Supabase Dashboard -> Database -> Extensions.
-- 2. Run the snippet below in your Supabase SQL Editor:

-- Note: 00:00 AM IST corresponds to 18:30 UTC.
-- The cron syntax is '30 18 * * *'.

-- SELECT cron.schedule(
--   'ocd-daily-autorefresh-00-00-ist',
--   '30 18 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://<YOUR-PROJECT-DOMAIN>/api/cron/sync',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <YOUR_CRON_SECRET>'
--     )
--   );
--   $$
-- );

