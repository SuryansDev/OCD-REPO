import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cleanCodeforcesHandle, cleanLeetCodeHandle } from '@/lib/handles';
import type { PlatformSyncStatus } from '@/lib/types';
import { executeDailySync } from '@/lib/syncEngine';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function createRouteHandlerClient(request: NextRequest) {
  const cookieStore = request.cookies;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value }) => {
              cookieStore.set(name, value);
            });
          } catch (error) { }
        },
      },
    }
  );
}

// ─── POST /api/leaderboard/sync ─────────────────────────────
export async function POST(request: NextRequest) {
  // Check authorization:
  // 1. Cron secret header / param (automated invocation)
  const authHeader = request.headers.get('authorization');
  const cronKeyHeader = request.headers.get('x-cron-secret') || request.headers.get('x-cron-key');
  const { searchParams } = new URL(request.url);
  const cronParam = searchParams.get('cron_secret') || searchParams.get('key');

  const expectedSecret = process.env.CRON_SECRET;
  const isCronAuthorized = Boolean(
    expectedSecret && (
      authHeader === `Bearer ${expectedSecret}` ||
      cronKeyHeader === expectedSecret ||
      cronParam === expectedSecret
    )
  );

  let supabaseClient;
  let source = 'cron';

  if (isCronAuthorized) {
    supabaseClient = createAdminSupabaseClient();
  } else {
    // 2. Admin user check — preserve full existing admin manual sync powers
    const supabase = createRouteHandlerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: adminCheck } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (adminCheck?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    supabaseClient = createAdminSupabaseClient();
    source = 'admin_manual';
  }

  const result = await executeDailySync({
    supabaseClient,
    source,
  });

  return NextResponse.json(result);
}

// ─── Cache for latest platform contests ──────────────────────
let cachedLatestContests: any = null;
let cachedLatestContestsAt = 0;

// ─── LeetCode: fetch platform's latest finished contest ──────
async function fetchLatestLCContest() {
  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://leetcode.com',
      },
      body: JSON.stringify({
        query: `
          query {
            allContests {
              title
              titleSlug
              startTime
              duration
            }
          }
        `,
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const contests = data?.data?.allContests;
    if (!Array.isArray(contests) || contests.length === 0) return null;
    const now = Math.floor(Date.now() / 1000);
    const finished = contests.filter((c: any) => (c.startTime + c.duration) <= now);
    if (finished.length === 0) return null;
    return {
      title: finished[0].title,
      titleSlug: finished[0].titleSlug,
      startTime: new Date(finished[0].startTime * 1000).toISOString(),
      duration: finished[0].duration,
    };
  } catch {
    return null;
  }
}

// ─── Codeforces: fetch platform's latest finished contest ───
async function fetchLatestCFContest() {
  try {
    const res = await fetch('https://codeforces.com/api/contest.list?gym=false', { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.status !== 'OK' || !Array.isArray(data?.result)) return null;
    const finished = data.result
      .filter((c: any) => c.phase === 'FINISHED')
      .sort((a: any, b: any) => b.startTimeSeconds - a.startTimeSeconds);
    if (finished.length === 0) return null;
    const latest = finished[0];

    const sameRound = finished.filter((c: any) => Math.abs(c.startTimeSeconds - latest.startTimeSeconds) <= 3600);

    let totalContestParticipants: number | null = null;
    try {
      const rcRes = await fetch(`https://codeforces.com/api/contest.ratingChanges?contestId=${latest.id}`, { next: { revalidate: 300 } });
      if (rcRes.ok) {
        const rcData = await rcRes.json().catch(() => null);
        if (rcData?.status === 'OK' && Array.isArray(rcData?.result)) {
          totalContestParticipants = rcData.result.length;
        }
      }
    } catch { }

    return {
      id: latest.id,
      name: latest.name,
      relatedNames: sameRound.map((c: any) => c.name),
      startTime: new Date(latest.startTimeSeconds * 1000).toISOString(),
      totalContestParticipants,
    };
  } catch {
    return null;
  }
}

async function getLatestContests() {
  const now = Date.now();
  if (cachedLatestContests && (now - cachedLatestContestsAt < 5 * 60 * 1000)) {
    return cachedLatestContests;
  }
  const [lc, cf] = await Promise.all([
    fetchLatestLCContest(),
    fetchLatestCFContest(),
  ]);
  cachedLatestContests = { lc, cf };
  cachedLatestContestsAt = now;
  return cachedLatestContests;
}

// ─── GET /api/leaderboard/sync — fetch leaderboard data ─────
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: stats, error } = await supabase
    .from('user_stats')
    .select('*, user:users!user_stats_user_id_fkey(id, full_name, email, year, cf_handle, lc_handle, role, approval_status)')
    .order('synced_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strictly filter out admin and deactivated/non-approved accounts
  const activeStats = (stats || []).filter(
    (s: any) => s.user && s.user.role !== 'admin' && s.user.approval_status === 'approved'
  );

  const latestContests = await getLatestContests();

  const issues = activeStats
    .filter((s: any) => {
      const lcClean = cleanLeetCodeHandle(s.user?.lc_handle);
      const cfClean = cleanCodeforcesHandle(s.user?.cf_handle);
      return !lcClean || !cfClean || (s.lc_status && s.lc_status !== 'ok') || (s.cf_status && s.cf_status !== 'ok');
    })
    .map((s: any) => {
      const lcClean = cleanLeetCodeHandle(s.user?.lc_handle);
      const cfClean = cleanCodeforcesHandle(s.user?.cf_handle);
      return {
        user_id: s.user_id,
        full_name: s.user?.full_name,
        email: s.user?.email,
        year: s.user?.year,
        lc_handle: s.user?.lc_handle || '',
        lc_status: (s.lc_status || (!lcClean ? 'missing' : 'ok')) as PlatformSyncStatus,
        lc_error_msg: s.lc_error_msg || (!lcClean ? (s.user?.lc_handle ? 'Invalid / placeholder LeetCode handle' : 'Missing LeetCode handle') : null),
        cf_handle: s.user?.cf_handle || '',
        cf_status: (s.cf_status || (!cfClean ? 'missing' : 'ok')) as PlatformSyncStatus,
        cf_error_msg: s.cf_error_msg || (!cfClean ? (s.user?.cf_handle ? 'Invalid / placeholder Codeforces handle' : 'Missing Codeforces handle') : null),
      };
    });

  return NextResponse.json({
    stats: activeStats,
    issues,
    latest_contests: latestContests,
  });
}
