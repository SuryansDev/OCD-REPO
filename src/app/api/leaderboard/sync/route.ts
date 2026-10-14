import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cleanCodeforcesHandle, cleanLeetCodeHandle } from '@/lib/handles';
import type { PlatformSyncStatus } from '@/lib/types';

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

interface CFInfoResult {
  ok: boolean;
  status: PlatformSyncStatus;
  info?: any;
  errorMsg?: string;
}

// ─── Codeforces: fetch user info (rating) ───────────────────
async function fetchCFInfo(handle: string, retries = 2): Promise<CFInfoResult> {
  const h = cleanCodeforcesHandle(handle);
  if (!h) {
    return { ok: false, status: 'missing', errorMsg: 'No Codeforces handle configured' };
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
      const res = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(h)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        next: { revalidate: 0 },
      });
      const data = await res.json().catch(() => null);
      if (data?.comment && data.comment.toLowerCase().includes('limit')) {
        continue;
      }
      if (!res.ok || data?.status !== 'OK' || !data?.result?.length) {
        const comment = data?.comment || 'Codeforces handle not found or private';
        const isNotFound = comment.toLowerCase().includes('not found');
        return {
          ok: false,
          status: isNotFound ? 'private_or_not_found' : 'error',
          errorMsg: comment,
        };
      }
      return { ok: true, status: 'ok', info: data.result[0] };
    } catch (err: any) {
      if (attempt === retries) {
        return { ok: false, status: 'error', errorMsg: err?.message || 'Network error querying Codeforces API' };
      }
    }
  }
  return { ok: false, status: 'error', errorMsg: 'Codeforces rate limit exceeded' };
}

// ─── Codeforces: fetch latest contest ───────────────────────
async function fetchCFRating(handle: string, retries = 2) {
  const h = cleanCodeforcesHandle(handle);
  if (!h) return null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
      const res = await fetch(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(h)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (data?.comment && data.comment.toLowerCase().includes('limit')) continue;
      if (data?.status !== 'OK' || !data?.result?.length) return null;
      return data.result[data.result.length - 1];
    } catch { }
  }
  return null;
}

// ─── Codeforces: count unique solved problems ───────────────
async function fetchCFSolved(handle: string, retries = 2): Promise<number> {
  const h = cleanCodeforcesHandle(handle);
  if (!h) return 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
      const res = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}&from=1&count=10000`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (data?.status !== 'OK' || !Array.isArray(data?.result)) {
        if (data?.comment && data.comment.toLowerCase().includes('limit')) continue;
        return 0;
      }
      const solved = new Set<string>();
      data.result.forEach((sub: any) => {
        if (sub.verdict === 'OK') {
          const key = (sub.problem?.contestId && sub.problem?.index)
            ? `${sub.problem.contestId}-${sub.problem.index}`
            : (sub.problem?.name || (sub.problem?.problemsetName && sub.problem?.index ? `${sub.problem.problemsetName}-${sub.problem.index}` : null));
          if (key) solved.add(key);
        }
      });
      return solved.size;
    } catch {
      // retry on network error
    }
  }
  return 0;
}

interface LCProfileResult {
  ok: boolean;
  status: PlatformSyncStatus;
  profile?: { totalSolved: number; rating?: number; globalRanking?: number };
  errorMsg?: string;
}

// ─── LeetCode: fetch profile stats ─────────────────────────
async function fetchLCProfile(handle: string): Promise<LCProfileResult> {
  const h = cleanLeetCodeHandle(handle);
  if (!h) {
    return { ok: false, status: 'missing', errorMsg: 'No LeetCode handle configured' };
  }

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
          query getUserProfile($username: String!) {
            matchedUser(username: $username) {
              submitStats: submitStatsGlobal {
                acSubmissionNum {
                  difficulty
                  count
                }
              }
            }
            userContestRanking(username: $username) {
              rating
              attendedContestsCount
              globalRanking
            }
          }
        `,
        variables: { username: h },
      }),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return { ok: false, status: 'error', errorMsg: `LeetCode API responded with HTTP ${res.status}` };
    }

    const data = await res.json().catch(() => null);

    if (!data?.data?.matchedUser) {
      const errMsg = data?.errors?.[0]?.message || 'LeetCode profile is private or username does not exist';
      return {
        ok: false,
        status: 'private_or_not_found',
        errorMsg: errMsg,
      };
    }

    const totalSolved = data.data.matchedUser.submitStats?.acSubmissionNum
      ?.find((s: any) => s.difficulty === 'All')?.count || 0;

    const ranking = data.data.userContestRanking;

    return {
      ok: true,
      status: 'ok',
      profile: { totalSolved, rating: ranking?.rating, globalRanking: ranking?.globalRanking },
    };
  } catch (err: any) {
    return { ok: false, status: 'error', errorMsg: err?.message || 'Network error querying LeetCode API' };
  }
}

// ─── LeetCode: fetch latest contest history ─────────────────
async function fetchLCContestHistory(handle: string) {
  const h = cleanLeetCodeHandle(handle);
  if (!h) return null;

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
          query userContestRankingInfo($username: String!) {
            userContestRankingHistory(username: $username) {
              attended
              problemsSolved
              totalProblems
              rating
              ranking
              contest {
                title
                startTime
              }
            }
          }
        `,
        variables: { username: h },
      }),
      next: { revalidate: 0 },
    });

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const history = data?.data?.userContestRankingHistory;
    if (!Array.isArray(history) || history.length === 0) return null;

    const attended = history.filter((c: any) => c.attended);
    if (attended.length === 0) return null;
    return attended[attended.length - 1];
  } catch { return null; }
}

// ─── POST /api/leaderboard/sync ─────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  // Auth check — only admins can trigger sync
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: adminCheck } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (adminCheck?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Fetch all approved non-admin users with handles
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, full_name, email, cf_handle, lc_handle')
    .eq('approval_status', 'approved')
    .neq('role', 'admin');

  if (usersError || !users) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  // Clean up any user_stats for users that are deactivated or admin
  const { data: invalidUsers } = await supabase
    .from('users')
    .select('id')
    .or('approval_status.neq.approved,role.eq.admin');

  if (invalidUsers && invalidUsers.length > 0) {
    const invalidIds = invalidUsers.map((u) => u.id);
    await supabase.from('user_stats').delete().in('user_id', invalidIds);
  }

  let synced = 0;
  const errors: string[] = [];
  const issues: Array<{
    user_id: string;
    full_name: string;
    email: string;
    lc_handle: string;
    lc_status: PlatformSyncStatus;
    lc_error_msg?: string | null;
    cf_handle: string;
    cf_status: PlatformSyncStatus;
    cf_error_msg?: string | null;
  }> = [];

  // Process users in concurrent batches of 2 with spacing to strictly respect Codeforces 5 req/sec limit
  const BATCH_SIZE = 2;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (u) => {
        try {
          const statsPayload: Record<string, any> = {
            user_id: u.id,
            synced_at: new Date().toISOString(),
            lc_rating: 0,
            lc_total_solved: 0,
            cf_rating: 0,
            cf_max_rating: 0,
            cf_total_solved: 0,
            current_streak: 0,
            max_streak: 0,
          };

          const cfClean = cleanCodeforcesHandle(u.cf_handle);
          const lcClean = cleanLeetCodeHandle(u.lc_handle);

          let cfStatus: PlatformSyncStatus = 'unknown';
          let cfErrorMsg: string | null = null;
          let lcStatus: PlatformSyncStatus = 'unknown';
          let lcErrorMsg: string | null = null;

          // ── Codeforces ──
          if (!cfClean) {
            cfStatus = 'missing';
            cfErrorMsg = u.cf_handle ? 'Placeholder or invalid Codeforces handle' : 'No Codeforces handle configured';
          } else {
            const [cfInfoResult, cfLatest, cfSolved] = await Promise.all([
              fetchCFInfo(cfClean),
              fetchCFRating(cfClean),
              fetchCFSolved(cfClean),
            ]);

            cfStatus = cfInfoResult.status;
            cfErrorMsg = cfInfoResult.errorMsg || null;

            // Always assign cf_total_solved if cfSolved > 0 (do not depend on cfInfoResult.ok)
            if (cfSolved > 0) {
              statsPayload.cf_total_solved = cfSolved;
            }

            if (cfInfoResult.ok && cfInfoResult.info) {
              statsPayload.cf_rating = cfInfoResult.info.rating || 0;
              statsPayload.cf_max_rating = cfInfoResult.info.maxRating || 0;

              if (cfLatest) {
                statsPayload.cf_latest_contest_name = cfLatest.contestName;
                statsPayload.cf_latest_contest_rank = cfLatest.rank;
                statsPayload.cf_latest_contest_rating = cfLatest.newRating;
                statsPayload.cf_latest_contest_date = new Date(cfLatest.ratingUpdateTimeSeconds * 1000).toISOString();
              }
            }
          }

          // ── LeetCode ──
          if (!lcClean) {
            lcStatus = 'missing';
            lcErrorMsg = u.lc_handle ? 'Placeholder or invalid LeetCode handle' : 'No LeetCode handle configured';
          } else {
            const [lcProfileResult, lcLatest] = await Promise.all([
              fetchLCProfile(lcClean),
              fetchLCContestHistory(lcClean),
            ]);

            lcStatus = lcProfileResult.status;
            lcErrorMsg = lcProfileResult.errorMsg || null;

            if (lcProfileResult.ok && lcProfileResult.profile) {
              statsPayload.lc_rating = lcProfileResult.profile.rating || 0;
              statsPayload.lc_total_solved = lcProfileResult.profile.totalSolved || 0;

              if (lcLatest) {
                statsPayload.lc_latest_contest_name = lcLatest.contest?.title;
                statsPayload.lc_latest_contest_rank = lcLatest.ranking;
                statsPayload.lc_latest_contest_rating = lcLatest.rating;
                statsPayload.lc_latest_contest_solved = lcLatest.problemsSolved;
                statsPayload.lc_latest_contest_date = lcLatest.contest?.startTime
                  ? new Date(lcLatest.contest.startTime * 1000).toISOString()
                  : null;
              }
            }
          }

          // Track in-memory issues for admin inspection
          if (lcStatus !== 'ok' || cfStatus !== 'ok') {
            issues.push({
              user_id: u.id,
              full_name: u.full_name,
              email: u.email,
              lc_handle: u.lc_handle || '',
              lc_status: lcStatus,
              lc_error_msg: lcErrorMsg,
              cf_handle: u.cf_handle || '',
              cf_status: cfStatus,
              cf_error_msg: cfErrorMsg,
            });
          }

          // ── Streak calculation ──
          const { data: completedTasks } = await supabase
            .from('tasks')
            .select('completed_at')
            .eq('assigned_to', u.id)
            .eq('status', 'Completed')
            .not('completed_at', 'is', null)
            .order('completed_at', { ascending: false });

          if (completedTasks && completedTasks.length > 0) {
            const uniqueDates = Array.from(
              new Set(completedTasks.map((t) => new Date(t.completed_at).toISOString().split('T')[0]))
            )
              .sort()
              .reverse();

            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            let streak = 0;
            let checkDate = uniqueDates[0] === today || uniqueDates[0] === yesterday ? uniqueDates[0] : null;

            if (checkDate) {
              for (const d of uniqueDates) {
                if (d === checkDate) {
                  streak++;
                  const prevDate: Date = new Date(checkDate);
                  prevDate.setDate(prevDate.getDate() - 1);
                  checkDate = prevDate.toISOString().split('T')[0];
                } else if (d < checkDate!) {
                  break;
                }
              }
            }

            statsPayload.current_streak = streak;
            statsPayload.last_solve_date = uniqueDates[0];

            const { data: existing } = await supabase
              .from('user_stats')
              .select('max_streak')
              .eq('user_id', u.id)
              .single();

            statsPayload.max_streak = Math.max(streak, existing?.max_streak || 0);
          }

          // Preserve existing cf_total_solved if API failed or returned 0 temporarily
          if (!statsPayload.cf_total_solved || statsPayload.cf_total_solved === 0) {
            const { data: existing } = await supabase
              .from('user_stats')
              .select('cf_total_solved')
              .eq('user_id', u.id)
              .single();
            if (existing?.cf_total_solved) {
              statsPayload.cf_total_solved = existing.cf_total_solved;
            }
          }

          // Upsert into user_stats strictly with schema-compatible columns
          const { error: upsertError } = await supabase
            .from('user_stats')
            .upsert(statsPayload, { onConflict: 'user_id' });

          if (upsertError) {
            errors.push(`${u.id}: ${upsertError.message}`);
          } else {
            synced++;
          }
        } catch (err: any) {
          errors.push(`${u.id}: ${err?.message || 'Unknown error'}`);
        }
      })
    );

    // Breather between batches to strictly stay within Codeforces API rate limits
    if (i + BATCH_SIZE < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const issueMsg = issues.length > 0 ? ` Detected ${issues.length} profile(s) with private settings or invalid handles.` : '';

  return NextResponse.json({
    synced,
    total: users.length,
    issues,
    errors: errors.length > 0 ? errors : undefined,
    message: `Synced ${synced}/${users.length} users successfully.${issueMsg}`,
  });
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
    // Contests that have finished (startTime + duration <= now)
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

    // Group sister divisions held in the same round window (e.g. Div. 1, Div. 2, Div. 3)
    const sameRound = finished.filter((c: any) => Math.abs(c.startTimeSeconds - latest.startTimeSeconds) <= 3600);

    // Fetch total global participant count from rating changes
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
