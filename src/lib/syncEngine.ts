import { cleanCodeforcesHandle, cleanLeetCodeHandle } from '@/lib/handles';
import type { PlatformSyncStatus } from '@/lib/types';
import { getTodayIST } from '@/lib/dateUtils';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

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

// ─── Rollout Scheduled Tasks ────────────────────────────────
export async function rollOutScheduledTasks(supabase: any, targetDateIST?: string) {
  const todayIST = targetDateIST || getTodayIST();
  let rolledOutCount = 0;
  let totalTasksCreated = 0;
  const errors: string[] = [];

  try {
    // Find all scheduled tasks that are due on or before today's date in IST and still pending
    const { data: pendingScheduled, error: fetchError } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_date', todayIST)
      .order('scheduled_date', { ascending: true });

    if (fetchError) {
      // If table does not exist yet in Supabase, report gracefully
      if (fetchError.code === '42P01' || fetchError.message?.includes('scheduled_tasks')) {
        return {
          rolledOutCount: 0,
          totalTasksCreated: 0,
          errors: ['scheduled_tasks table does not exist yet. Please run supabase/scheduled_tasks.sql.'],
        };
      }
      return { rolledOutCount: 0, totalTasksCreated: 0, errors: [fetchError.message] };
    }

    if (!pendingScheduled || pendingScheduled.length === 0) {
      return { rolledOutCount: 0, totalTasksCreated: 0, errors: [] };
    }

    for (const scheduled of pendingScheduled) {
      try {
        // Fetch all active mentees for this mentor
        const { data: mentorships, error: msError } = await supabase
          .from('mentorships')
          .select('mentee_id')
          .eq('mentor_id', scheduled.mentor_id);

        if (msError) {
          errors.push(`Mentor ${scheduled.mentor_id}: Failed to fetch mentees (${msError.message})`);
          continue;
        }

        if (mentorships && mentorships.length > 0) {
          for (const m of mentorships) {
            // Check if task already exists to prevent duplicate insertion
            const { data: existing } = await supabase
              .from('tasks')
              .select('id')
              .eq('assigned_to', m.mentee_id)
              .eq('platform', scheduled.platform)
              .eq('problem_slug_or_id', scheduled.problem_slug_or_id)
              .eq('assigned_date', scheduled.scheduled_date)
              .maybeSingle();

            if (!existing) {
              const { error: insertError } = await supabase
                .from('tasks')
                .insert({
                  assigned_by: scheduled.mentor_id,
                  assigned_to: m.mentee_id,
                  platform: scheduled.platform,
                  problem_slug_or_id: scheduled.problem_slug_or_id,
                  status: 'Pending',
                  assigned_date: scheduled.scheduled_date,
                });

              if (insertError) {
                errors.push(`Mentee ${m.mentee_id}: ${insertError.message}`);
              } else {
                totalTasksCreated++;
              }
            }
          }
        }

        // Mark the scheduled task as rolled_out
        const { error: updateError } = await supabase
          .from('scheduled_tasks')
          .update({
            status: 'rolled_out',
            rolled_out_at: new Date().toISOString(),
          })
          .eq('id', scheduled.id);

        if (updateError) {
          errors.push(`Scheduled task ${scheduled.id}: ${updateError.message}`);
        } else {
          rolledOutCount++;
        }
      } catch (err: any) {
        errors.push(`Scheduled task ${scheduled.id}: ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    errors.push(`Rollout error: ${err?.message || err}`);
  }

  return { rolledOutCount, totalTasksCreated, errors };
}

// ─── Sync Leaderboard Rankings ──────────────────────────────
export async function syncLeaderboardRankings(supabase: any) {
  // Fetch all approved non-admin users with handles
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, full_name, email, cf_handle, lc_handle')
    .eq('approval_status', 'approved')
    .neq('role', 'admin');

  if (usersError || !users) {
    return {
      synced: 0,
      total: 0,
      issues: [],
      errors: [usersError?.message || 'Failed to fetch users'],
    };
  }

  // Clean up any user_stats for users that are deactivated or admin
  const { data: invalidUsers } = await supabase
    .from('users')
    .select('id')
    .or('approval_status.neq.approved,role.eq.admin');

  if (invalidUsers && invalidUsers.length > 0) {
    const invalidIds = invalidUsers.map((u: any) => u.id);
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
      batch.map(async (u: any) => {
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
              new Set(completedTasks.map((t: any) => new Date(t.completed_at).toISOString().split('T')[0]))
            )
              .sort()
              .reverse() as string[];

            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            let streak = 0;
            let checkDate: string | null = uniqueDates[0] === today || uniqueDates[0] === yesterday ? uniqueDates[0] : null;

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

          // Preserve existing cf_total_solved if API returned 0 temporarily
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

    if (i + BATCH_SIZE < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  return { synced, total: users.length, issues, errors };
}

// ─── Master Daily Sync: Rollout Scheduled Questions + Sync Rankings ─────────
export async function executeDailySync(options?: {
  supabaseClient?: any;
  source?: string;
  targetDateIST?: string;
}) {
  const supabase = options?.supabaseClient || createAdminSupabaseClient();
  const source = options?.source || 'cron';
  const targetDateIST = options?.targetDateIST || getTodayIST();

  console.log(`[AutoRefresh] Starting daily sync at 00:00 AM IST (date: ${targetDateIST}, source: ${source})...`);

  // Step 1: Roll out scheduled questions due today or earlier in IST
  const rolloutResult = await rollOutScheduledTasks(supabase, targetDateIST);

  // Step 2: Sync user rankings and platform profiles
  const rankingsResult = await syncLeaderboardRankings(supabase);

  const issueMsg = rankingsResult.issues.length > 0
    ? ` Detected ${rankingsResult.issues.length} profile(s) with private settings or invalid handles.`
    : '';

  const rolloutMsg = rolloutResult.rolledOutCount > 0
    ? ` Rolled out ${rolloutResult.rolledOutCount} scheduled question(s) (${rolloutResult.totalTasksCreated} mentee tasks assigned).`
    : ' No pending questions due for rollout.';

  const message = `Auto-sync complete: Synced ${rankingsResult.synced}/${rankingsResult.total} users.${rolloutMsg}${issueMsg}`;

  const allErrors = [...rolloutResult.errors, ...rankingsResult.errors];

  console.log(`[AutoRefresh] Finished daily sync: ${message}`);

  return {
    success: true,
    source,
    targetDateIST,
    timestamp: new Date().toISOString(),
    synced: rankingsResult.synced,
    total: rankingsResult.total,
    rolledOutScheduledTasks: rolloutResult.rolledOutCount,
    createdMenteeTasks: rolloutResult.totalTasksCreated,
    issues: rankingsResult.issues,
    errors: allErrors.length > 0 ? allErrors : undefined,
    message,
  };
}

