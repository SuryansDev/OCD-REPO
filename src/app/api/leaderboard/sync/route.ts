import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

// ─── Codeforces: fetch user info (rating) ───────────────────
async function fetchCFInfo(handle: string) {
  try {
    let h = handle.trim();
    if (h.includes('codeforces.com/profile/')) {
      const m = h.match(/profile\/([^\/]+)/);
      if (m) h = m[1];
    }
    const res = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(h)}`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.result?.length) return null;
    return data.result[0]; // { rating, maxRating, ... }
  } catch { return null; }
}

// ─── Codeforces: fetch latest contest ───────────────────────
async function fetchCFRating(handle: string) {
  try {
    let h = handle.trim();
    if (h.includes('codeforces.com/profile/')) {
      const m = h.match(/profile\/([^\/]+)/);
      if (m) h = m[1];
    }
    const res = await fetch(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(h)}`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.result?.length) return null;
    // Return the last (most recent) contest
    return data.result[data.result.length - 1];
  } catch { return null; }
}

// ─── Codeforces: count unique solved problems ───────────────
async function fetchCFSolved(handle: string): Promise<number> {
  try {
    let h = handle.trim();
    if (h.includes('codeforces.com/profile/')) {
      const m = h.match(/profile\/([^\/]+)/);
      if (m) h = m[1];
    }
    const res = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}&from=1&count=10000`, { next: { revalidate: 0 } });
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.status !== 'OK') return 0;
    const solved = new Set<string>();
    data.result.forEach((sub: any) => {
      if (sub.verdict === 'OK' && sub.problem?.contestId && sub.problem?.index) {
        solved.add(`${sub.problem.contestId}-${sub.problem.index}`);
      }
    });
    return solved.size;
  } catch { return 0; }
}

// ─── LeetCode: fetch profile stats ─────────────────────────
async function fetchLCProfile(handle: string) {
  try {
    let h = handle.trim();
    if (h.includes('leetcode.com/')) {
      const m = h.match(/leetcode\.com\/(?:u\/)?([^\/]+)/);
      if (m) h = m[1];
    }

    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    if (!res.ok) return null;
    const data = await res.json();

    const totalSolved = data?.data?.matchedUser?.submitStats?.acSubmissionNum
      ?.find((s: any) => s.difficulty === 'All')?.count || 0;

    const ranking = data?.data?.userContestRanking;

    return { totalSolved, rating: ranking?.rating, globalRanking: ranking?.globalRanking };
  } catch { return null; }
}

// ─── LeetCode: fetch latest contest history ─────────────────
async function fetchLCContestHistory(handle: string) {
  try {
    let h = handle.trim();
    if (h.includes('leetcode.com/')) {
      const m = h.match(/leetcode\.com\/(?:u\/)?([^\/]+)/);
      if (m) h = m[1];
    }

    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const data = await res.json();
    const history = data?.data?.userContestRankingHistory;
    if (!Array.isArray(history) || history.length === 0) return null;

    // Find the last attended contest
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
    .select('id, cf_handle, lc_handle')
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

  // Process each user (sequentially to avoid rate limiting)
  for (const u of users) {
    try {
      const statsPayload: any = {
        user_id: u.id,
        synced_at: new Date().toISOString(),
      };

      // ── Codeforces ──
      if (u.cf_handle) {
        // Fetch in parallel for same user
        const [cfInfo, cfLatest, cfSolved] = await Promise.all([
          fetchCFInfo(u.cf_handle),
          fetchCFRating(u.cf_handle),
          fetchCFSolved(u.cf_handle),
        ]);

        if (cfInfo) {
          statsPayload.cf_rating = cfInfo.rating || 0;
          statsPayload.cf_max_rating = cfInfo.maxRating || 0;
        }

        statsPayload.cf_total_solved = cfSolved;

        if (cfLatest) {
          statsPayload.cf_latest_contest_name = cfLatest.contestName;
          statsPayload.cf_latest_contest_rank = cfLatest.rank;
          statsPayload.cf_latest_contest_rating = cfLatest.newRating;
          statsPayload.cf_latest_contest_date = new Date(cfLatest.ratingUpdateTimeSeconds * 1000).toISOString();
        }
      }

      // ── LeetCode ──
      if (u.lc_handle) {
        const [lcProfile, lcLatest] = await Promise.all([
          fetchLCProfile(u.lc_handle),
          fetchLCContestHistory(u.lc_handle),
        ]);

        if (lcProfile) {
          statsPayload.lc_rating = lcProfile.rating || 0;
          statsPayload.lc_total_solved = lcProfile.totalSolved || 0;
        }

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

      // ── Streak calculation ──
      // We calculate streak based on task completions from the tasks table
      const { data: completedTasks } = await supabase
        .from('tasks')
        .select('completed_at')
        .eq('assigned_to', u.id)
        .eq('status', 'Completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });

      if (completedTasks && completedTasks.length > 0) {
        // Get unique dates (in local date strings)
        const uniqueDates = Array.from(new Set(
          completedTasks.map(t => new Date(t.completed_at).toISOString().split('T')[0])
        )).sort().reverse();

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        let streak = 0;
        let checkDate = uniqueDates[0] === today || uniqueDates[0] === yesterday ? uniqueDates[0] : null;

        if (checkDate) {
          for (const d of uniqueDates) {
            if (d === checkDate) {
              streak++;
              // Move to the previous day
              const prevDate: Date = new Date(checkDate);
              prevDate.setDate(prevDate.getDate() - 1);
              checkDate = prevDate.toISOString().split('T')[0];
            } else if (d < checkDate!) {
              break; // Gap found
            }
          }
        }

        statsPayload.current_streak = streak;
        statsPayload.last_solve_date = uniqueDates[0];

        // Check if current streak > stored max
        const { data: existing } = await supabase
          .from('user_stats')
          .select('max_streak')
          .eq('user_id', u.id)
          .single();

        statsPayload.max_streak = Math.max(streak, existing?.max_streak || 0);
      }

      // Upsert into user_stats
      const { error: upsertError } = await supabase
        .from('user_stats')
        .upsert(statsPayload, { onConflict: 'user_id' });

      if (upsertError) {
        errors.push(`${u.id}: ${upsertError.message}`);
      } else {
        synced++;
      }

      // Small delay to be kind to APIs
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (err: any) {
      errors.push(`${u.id}: ${err.message}`);
    }
  }

  return NextResponse.json({
    synced,
    total: users.length,
    errors: errors.length > 0 ? errors : undefined,
    message: `Synced ${synced}/${users.length} users successfully.`,
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
      headers: { 'Content-Type': 'application/json' },
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
    const data = await res.json();
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
    const data = await res.json();
    if (data.status !== 'OK' || !Array.isArray(data.result)) return null;
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
        const rcData = await rcRes.json();
        if (rcData.status === 'OK' && Array.isArray(rcData.result)) {
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
    .select('*, user:users!user_stats_user_id_fkey(id, full_name, year, cf_handle, lc_handle, role, approval_status)')
    .order('synced_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strictly filter out admin and deactivated/non-approved accounts
  const activeStats = (stats || []).filter(
    (s: any) => s.user && s.user.role !== 'admin' && s.user.approval_status === 'approved'
  );

  const latestContests = await getLatestContests();

  return NextResponse.json({
    stats: activeStats,
    latest_contests: latestContests,
  });
}
