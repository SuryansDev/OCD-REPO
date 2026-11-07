-- ============================================================
-- OCD: Supabase pg_cron & pg_net Setup for Daily 4:00 AM IST Sync
-- ============================================================
-- If you want Supabase to trigger the sync directly via PostgreSQL:
-- 1. Enable pg_cron and pg_net extensions in Supabase Dashboard -> Database -> Extensions.
-- 2. Run the snippet below in your Supabase SQL Editor:

-- Note: 4:00 AM IST corresponds to 22:30 UTC.
-- The cron syntax is '30 22 * * *'.

-- SELECT cron.schedule(
--   'ocd-daily-autorefresh-04-00-ist',
--   '30 22 * * *',
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

