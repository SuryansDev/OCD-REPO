import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the service role key (bypasses RLS) if available,
 * or falls back to the anonymous key.
 *
 * This client is used exclusively for automated cron jobs and server-side background
 * synchronization tasks that run without an active browser cookie session.
 */
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  return createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

