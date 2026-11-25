import { cleanCodeforcesHandle, cleanLeetCodeHandle } from './handles';
import type { PlatformSyncStatus } from './types';
import { getDateOffsetIST, getTodayIST, stepDateString, toISTDateString } from './dateUtils';
import { createAdminSupabaseClient } from './supabase/admin';

interface CFInfoResult {
  ok: boolean;
  status: PlatformSyncStatus;
  info?: any;
  errorMsg?: string;
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ─── Fetch helper with strict socket timeout ────────────────
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Disciplined Global Codeforces Request Pacer ────────────
// Paces start times so Codeforces ~5 req/s IP cap isn't burst-violated while overlapping RTT.
let cfQueueChain: Promise<any> = Promise.resolve();
let cfLastStartMs = 0;
let cfMinGapMs = 230;

function scheduleCFCall<T>(fn: () => Promise<T>): Promise<T> {
  const task = cfQueueChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, cfLastStartMs + cfMinGapMs - now);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    cfLastStartMs = Date.now();
  });
  cfQueueChain = task.catch(() => {});
  return task.then(fn);
}

function noteCFRateLimit() {
  cfMinGapMs = Math.min(500, cfMinGapMs + 60);
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
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
      const res = await scheduleCFCall(() =>
        fetchWithTimeout(
          `https://codeforces.com/api/user.info?handles=${encodeURIComponent(h)}`,
          { headers: DEFAULT_HEADERS, next: { revalidate: 0 } },
          8000
        )
      );
      const data = await res.json().catch(() => null);
      if (data?.comment && data.comment.toLowerCase().includes('limit')) {
        noteCFRateLimit();
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
        return {
          ok: false,
          status: 'error',
          errorMsg: err?.name === 'AbortError' ? 'Codeforces API timed out' : err?.message || 'Network error querying Codeforces API',
        };
      }
    }
  }
  return { ok: false, status: 'error', errorMsg: 'Codeforces rate limit exceeded' };
}

// ─── Codeforces: bulk user.info fetcher with bisect fallback ─
async function fetchCFInfoBatchMap(handles: string[]): Promise<Map<string, CFInfoResult>> {
  const results = new Map<string, CFInfoResult>();
  const uniqueHandles = Array.from(new Set(handles.map((h) => cleanCodeforcesHandle(h)).filter(Boolean) as string[]));
  if (uniqueHandles.length === 0) return results;

  async function resolveChunk(chunk: string[], retries = 1): Promise<void> {
    if (chunk.length === 0) return;
    if (chunk.length === 1) {
      results.set(chunk[0].toLowerCase(), await fetchCFInfo(chunk[0]));
      return;
    }

    try {
      const joined = chunk.map((h) => encodeURIComponent(h)).join(';');
      const res = await scheduleCFCall(() =>
        fetchWithTimeout(
          `https://codeforces.com/api/user.info?handles=${joined}`,
          { headers: DEFAULT_HEADERS, next: { revalidate: 0 } },
          9000
        )
      );
      const data = await res.json().catch(() => null);

      if (data?.comment && data.comment.toLowerCase().includes('limit')) {
        noteCFRateLimit();
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 600));
          return resolveChunk(chunk, retries - 1);
        }
      }

      if (res.ok && data?.status === 'OK' && Array.isArray(data?.result)) {
        for (let idx = 0; idx < chunk.length; idx++) {
          const info = data.result[idx] || data.result.find((r: any) => r?.handle?.toLowerCase() === chunk[idx].toLowerCase());
          if (info) {
            results.set(chunk[idx].toLowerCase(), { ok: true, status: 'ok', info });
          } else {
            results.set(chunk[idx].toLowerCase(), {
              ok: false,
              status: 'private_or_not_found',
              errorMsg: 'Codeforces handle not found',
            });
          }
        }
        return;
      }

      // If Codeforces reports an invalid handle in the batch, bisect quickly to isolate it
      if (data?.comment && data.comment.toLowerCase().includes('not found')) {
        const mid = Math.ceil(chunk.length / 2);
        await resolveChunk(chunk.slice(0, mid), 1);
        await resolveChunk(chunk.slice(mid), 1);
        return;
      }
    } catch {
      // Fall back cleanly via bisection / individual checks
    }

    const mid = Math.ceil(chunk.length / 2);
    await resolveChunk(chunk.slice(0, mid), 0);
    await resolveChunk(chunk.slice(mid), 0);
  }

  const CHUNK_SIZE = 25;
  for (let i = 0; i < uniqueHandles.length; i += CHUNK_SIZE) {
    await resolveChunk(uniqueHandles.slice(i, i + CHUNK_SIZE));
  }

  return results;
}

// ─── Codeforces: fetch latest contest ───────────────────────
async function fetchCFRating(handle: string, retries = 2) {
  const h = cleanCodeforcesHandle(handle);
  if (!h) return null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
      const res = await scheduleCFCall(() =>
        fetchWithTimeout(
          `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(h)}`,
          { headers: DEFAULT_HEADERS, next: { revalidate: 0 } },
          8000
        )
      );
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (data?.comment && data.comment.toLowerCase().includes('limit')) {
        noteCFRateLimit();
        continue;
      }
      if (data?.status !== 'OK' || !data?.result?.length) return null;
      return data.result[data.result.length - 1];
    } catch {}
  }
  return null;
}

interface CFSolvedResult {
  ok: boolean;
  count: number;
}

// ─── Codeforces: count unique solved problems ───────────────
async function fetchCFSolved(handle: string, retries = 2): Promise<CFSolvedResult> {
  const h = cleanCodeforcesHandle(handle);
  if (!h) return { ok: false, count: 0 };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
      const res = await scheduleCFCall(() =>
        fetchWithTimeout(
          `https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}&from=1&count=2500`,
          { headers: DEFAULT_HEADERS, next: { revalidate: 0 } },
          9000
        )
      );
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (data?.comment && data.comment.toLowerCase().includes('limit')) {
        noteCFRateLimit();
        continue;
      }
      if (data?.status !== 'OK' || !Array.isArray(data?.result)) {
        return { ok: false, count: 0 };
      }
      const solved = new Set<string>();
      data.result.forEach((sub: any) => {
        if (sub.verdict === 'OK') {
          const key =
            sub.problem?.contestId && sub.problem?.index
              ? `${sub.problem.contestId}-${sub.problem.index}`
              : sub.problem?.name ||
                (sub.problem?.problemsetName && sub.problem?.index
                  ? `${sub.problem.problemsetName}-${sub.problem.index}`
                  : null);
          if (key) solved.add(key);
        }
      });
      return { ok: true, count: solved.size };
    } catch {
      // retry on timeout/network error
    }
  }
  return { ok: false, count: 0 };
}

interface LCProfileResult {
  ok: boolean;
  status: PlatformSyncStatus;
  profile?: { totalSolved: number; rating?: number; globalRanking?: number };
  latestContest?: any;
  errorMsg?: string;
}

// ─── LeetCode: fetch profile + contest history in ONE call ──
async function fetchLCCombined(handle: string): Promise<LCProfileResult> {
  const h = cleanLeetCodeHandle(handle);
  if (!h) {
    return { ok: false, status: 'missing', errorMsg: 'No LeetCode handle configured' };
  }

  try {
    const res = await fetchWithTimeout(
      'https://leetcode.com/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...DEFAULT_HEADERS,
          Referer: 'https://leetcode.com',
        },
        body: JSON.stringify({
          query: `
            query getUserFull($username: String!) {
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
      },
      8000
    );

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

    const totalSolved =
      data.data.matchedUser.submitStats?.acSubmissionNum?.find((s: any) => s.difficulty === 'All')?.count || 0;
    const ranking = data.data.userContestRanking;
    const history = data.data.userContestRankingHistory;
    const attended = Array.isArray(history) ? history.filter((c: any) => c.attended) : [];
    const latestContest = attended.length > 0 ? attended[attended.length - 1] : null;

    return {
      ok: true,
      status: 'ok',
      profile: { totalSolved, rating: ranking?.rating, globalRanking: ranking?.globalRanking },
      latestContest,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'error',
      errorMsg: err?.name === 'AbortError' ? 'LeetCode API timed out' : err?.message || 'Network error querying LeetCode API',
    };
  }
}

// ─── Rollout Scheduled Tasks ────────────────────────────────
export async function rollOutScheduledTasks(supabase: any, targetDateIST?: string) {
  if ((globalThis as any).__ocdRolloutRunning) {
    return { rolledOutCount: 0, totalTasksCreated: 0, errors: [] };
  }
  (globalThis as any).__ocdRolloutRunning = true;

  const todayIST = targetDateIST || getTodayIST();
  let rolledOutCount = 0;
  let totalTasksCreated = 0;
  const errors: string[] = [];

  try {
    const { data: pendingScheduled, error: fetchError } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_date', todayIST)
      .order('scheduled_date', { ascending: true });

    if (fetchError) {
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
        const { data: claimed, error: claimError } = await supabase
          .from('scheduled_tasks')
          .update({
            status: 'rolled_out',
            rolled_out_at: new Date().toISOString(),
          })
          .eq('id', scheduled.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();

        if (claimError || !claimed) {
          continue;
        }

        let targetYear = (scheduled as any).target_year || null;
        let cleanProblemSlug = scheduled.problem_slug_or_id;

        if (!targetYear && cleanProblemSlug.includes('::year:')) {
          const parts = cleanProblemSlug.split('::year:');
          cleanProblemSlug = parts[0];
          targetYear = parts[1];
        }

        let targetStudentIds: string[] = [];

        if (targetYear) {
          let studentQuery = supabase
            .from('users')
            .select('id')
            .neq('role', 'admin')
            .eq('approval_status', 'approved');

          if (targetYear !== 'all') {
            studentQuery = studentQuery.eq('year', targetYear);
          }

          const { data: students, error: studentError } = await studentQuery;
          if (studentError) {
            errors.push(`Scheduled task ${scheduled.id}: Failed to fetch year ${targetYear} students (${studentError.message})`);
            await supabase.from('scheduled_tasks').update({ status: 'pending', rolled_out_at: null }).eq('id', scheduled.id);
            continue;
          }
          targetStudentIds = (students || []).map((s: any) => s.id);
        } else {
          const { data: mentorships, error: msError } = await supabase
            .from('mentorships')
            .select('mentee_id')
            .eq('mentor_id', scheduled.mentor_id);

          if (msError) {
            errors.push(`Mentor ${scheduled.mentor_id}: Failed to fetch mentees (${msError.message})`);
            await supabase.from('scheduled_tasks').update({ status: 'pending', rolled_out_at: null }).eq('id', scheduled.id);
            continue;
          }
          targetStudentIds = (mentorships || []).map((m: any) => m.mentee_id);
        }

        const uniqueStudentIds = Array.from(new Set(targetStudentIds)).filter(Boolean);

        if (uniqueStudentIds.length > 0) {
          const { data: existingTasks } = await supabase
            .from('tasks')
            .select('assigned_to')
            .in('assigned_to', uniqueStudentIds)
            .eq('platform', scheduled.platform)
            .eq('problem_slug_or_id', cleanProblemSlug)
            .eq('assigned_date', scheduled.scheduled_date);

          const alreadyAssignedSet = new Set((existingTasks || []).map((t: any) => t.assigned_to));
          const studentsToAssign = uniqueStudentIds.filter((id) => !alreadyAssignedSet.has(id));

          if (studentsToAssign.length > 0) {
            const taskRows = studentsToAssign.map((studentId) => ({
              assigned_by: scheduled.mentor_id,
              assigned_to: studentId,
              platform: scheduled.platform,
              problem_slug_or_id: cleanProblemSlug,
              status: 'Pending',
              assigned_date: scheduled.scheduled_date,
            }));

            const { error: insertError } = await supabase.from('tasks').insert(taskRows);

            if (insertError) {
              errors.push(`Scheduled task ${scheduled.id}: Failed to insert tasks: ${insertError.message}`);
            } else {
              totalTasksCreated += taskRows.length;
            }
          }
        }

        rolledOutCount++;
      } catch (err: any) {
        errors.push(`Scheduled task ${scheduled.id}: ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    errors.push(`Rollout error: ${err?.message || err}`);
  } finally {
    (globalThis as any).__ocdRolloutRunning = false;
  }

  return { rolledOutCount, totalTasksCreated, errors };
}

// ─── Paginated DB Helpers (Immune to Supabase 1000-row cap) ──
export async function fetchAllCompletedTasks(supabase: any): Promise<Array<{ assigned_to: string; completed_at: string }>> {
  const allRows: Array<{ assigned_to: string; completed_at: string }> = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('tasks')
      .select('assigned_to, completed_at')
      .eq('status', 'Completed')
      .not('completed_at', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

export async function fetchAllUserStats(supabase: any): Promise<any[]> {
  const allRows: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

// ─── Pure IST Streak Calculation ─────────────────────────────
export function computeStreakMetricsFromDates(
  completedDates: string[],
  existingMaxStreak = 0,
  existingLastSolveDate: string | null = null
): {
  current_streak: number;
  max_streak: number;
  last_solve_date: string | null;
} {
  const uniqueDates = Array.from(
    new Set(completedDates.map((d) => toISTDateString(d)).filter(Boolean))
  )
    .sort()
    .reverse();

  if (uniqueDates.length === 0) {
    return {
      current_streak: 0,
      max_streak: existingMaxStreak || 0,
      last_solve_date: existingLastSolveDate,
    };
  }

  const todayIST = getTodayIST();
  const yesterdayIST = getDateOffsetIST(-1);

  let currentStreak = 0;
  let checkDate: string | null =
    uniqueDates[0] === todayIST || uniqueDates[0] === yesterdayIST ? uniqueDates[0] : null;

  if (checkDate) {
    for (const d of uniqueDates) {
      if (d === checkDate) {
        currentStreak++;
        checkDate = stepDateString(checkDate, -1);
      } else if (d < checkDate) {
        break;
      }
    }
  }

  // Also calculate longest consecutive streak in history (uniqueDates is sorted desc)
  let bestHistoricalStreak = 0;
  let run = 0;
  let expectedDate: string | null = null;
  for (const d of uniqueDates) {
    if (expectedDate === null || d !== expectedDate) {
      run = 1;
    } else {
      run++;
    }
    if (run > bestHistoricalStreak) {
      bestHistoricalStreak = run;
    }
    expectedDate = stepDateString(d, -1);
  }

  return {
    current_streak: currentStreak,
    max_streak: Math.max(currentStreak, bestHistoricalStreak, existingMaxStreak || 0),
    last_solve_date: uniqueDates[0],
  };
}

// ─── Compute User Stats for a single user ────────────────────
export async function computeUserStats(
  supabase: any,
  u: any,
  preloadedCompletedDates?: string[],
  preloadedMaxStreak?: number,
  preloadedCFInfo?: CFInfoResult | null,
  preloadedExistingStats?: any
): Promise<{
  statsPayload: Record<string, any>;
  issue?: any;
}> {
  const statsPayload: Record<string, any> = {
    user_id: u.id,
    synced_at: new Date().toISOString(),
    lc_rating: 0,
    lc_total_solved: 0,
    lc_latest_contest_name: null,
    lc_latest_contest_rank: null,
    lc_latest_contest_rating: null,
    lc_latest_contest_solved: null,
    lc_latest_contest_date: null,
    lc_status: 'unknown',
    lc_error_msg: null,
    cf_rating: 0,
    cf_max_rating: 0,
    cf_total_solved: 0,
    cf_latest_contest_name: null,
    cf_latest_contest_rank: null,
    cf_latest_contest_rating: null,
    cf_latest_contest_date: null,
    cf_status: 'unknown',
    cf_error_msg: null,
    current_streak: 0,
    max_streak: 0,
    last_solve_date: null,
  };

  const cfClean = cleanCodeforcesHandle(u.cf_handle);
  const lcClean = cleanLeetCodeHandle(u.lc_handle);

  // Run Codeforces and LeetCode concurrently for this user without mutating outer status bindings
  const cfTask = async (): Promise<{ status: PlatformSyncStatus; errorMsg: string | null }> => {
    if (!cfClean) {
      return {
        status: 'missing',
        errorMsg: u.cf_handle ? 'Placeholder or invalid Codeforces handle' : 'No Codeforces handle configured',
      };
    }

    const cfInfoResult = preloadedCFInfo ?? (await fetchCFInfo(cfClean));

    if (cfInfoResult.ok && cfInfoResult.info) {
      statsPayload.cf_rating = cfInfoResult.info.rating || 0;
      statsPayload.cf_max_rating = cfInfoResult.info.maxRating || 0;

      const [cfLatest, cfSolvedResult] = await Promise.all([
        fetchCFRating(cfClean),
        fetchCFSolved(cfClean),
      ]);

      if (cfSolvedResult.ok) {
        statsPayload.cf_total_solved = cfSolvedResult.count;
      } else if (preloadedExistingStats?.cf_total_solved) {
        statsPayload.cf_total_solved = preloadedExistingStats.cf_total_solved;
      }

      if (cfLatest) {
        statsPayload.cf_latest_contest_name = cfLatest.contestName;
        statsPayload.cf_latest_contest_rank = cfLatest.rank;
        statsPayload.cf_latest_contest_rating = cfLatest.newRating;
        statsPayload.cf_latest_contest_date = new Date(cfLatest.ratingUpdateTimeSeconds * 1000).toISOString();
      } else if (preloadedExistingStats?.cf_latest_contest_name) {
        statsPayload.cf_latest_contest_name = preloadedExistingStats.cf_latest_contest_name;
        statsPayload.cf_latest_contest_rank = preloadedExistingStats.cf_latest_contest_rank;
        statsPayload.cf_latest_contest_rating = preloadedExistingStats.cf_latest_contest_rating;
        statsPayload.cf_latest_contest_date = preloadedExistingStats.cf_latest_contest_date;
      }
    }

    return {
      status: cfInfoResult.status,
      errorMsg: cfInfoResult.errorMsg || null,
    };
  };

  const lcTask = async (): Promise<{ status: PlatformSyncStatus; errorMsg: string | null }> => {
    if (!lcClean) {
      return {
        status: 'missing',
        errorMsg: u.lc_handle ? 'Placeholder or invalid LeetCode handle' : 'No LeetCode handle configured',
      };
    }

    const lcResult = await fetchLCCombined(lcClean);

    if (lcResult.ok && lcResult.profile) {
      statsPayload.lc_rating = lcResult.profile.rating || 0;
      statsPayload.lc_total_solved = lcResult.profile.totalSolved || 0;

      if (lcResult.latestContest) {
        statsPayload.lc_latest_contest_name = lcResult.latestContest.contest?.title;
        statsPayload.lc_latest_contest_rank = lcResult.latestContest.ranking;
        statsPayload.lc_latest_contest_rating = lcResult.latestContest.rating;
        statsPayload.lc_latest_contest_solved = lcResult.latestContest.problemsSolved;
        statsPayload.lc_latest_contest_date = lcResult.latestContest.contest?.startTime
          ? new Date(lcResult.latestContest.contest.startTime * 1000).toISOString()
          : null;
      }
    } else if (lcResult.status === 'error' && preloadedExistingStats) {
      // Preserve last known good LC numbers on transient network/timeout error
      statsPayload.lc_rating = preloadedExistingStats.lc_rating || 0;
      statsPayload.lc_total_solved = preloadedExistingStats.lc_total_solved || 0;
      statsPayload.lc_latest_contest_name = preloadedExistingStats.lc_latest_contest_name || null;
      statsPayload.lc_latest_contest_rank = preloadedExistingStats.lc_latest_contest_rank ?? null;
      statsPayload.lc_latest_contest_rating = preloadedExistingStats.lc_latest_contest_rating ?? null;
      statsPayload.lc_latest_contest_solved = preloadedExistingStats.lc_latest_contest_solved ?? null;
      statsPayload.lc_latest_contest_date = preloadedExistingStats.lc_latest_contest_date || null;
    }

    return {
      status: lcResult.status,
      errorMsg: lcResult.errorMsg || null,
    };
  };

  const [cfOutcome, lcOutcome] = await Promise.all([cfTask(), lcTask()]);
  const cfStatus = cfOutcome.status;
  const cfErrorMsg = cfOutcome.errorMsg;
  const lcStatus = lcOutcome.status;
  const lcErrorMsg = lcOutcome.errorMsg;

  statsPayload.lc_status = lcStatus;
  statsPayload.lc_error_msg = lcErrorMsg;
  statsPayload.cf_status = cfStatus;
  statsPayload.cf_error_msg = cfErrorMsg;

  let issue: any = null;
  if (lcStatus !== 'ok' || cfStatus !== 'ok') {
    issue = {
      user_id: u.id,
      full_name: u.full_name,
      email: u.email,
      lc_handle: u.lc_handle || '',
      lc_status: lcStatus,
      lc_error_msg: lcErrorMsg,
      cf_handle: u.cf_handle || '',
      cf_status: cfStatus,
      cf_error_msg: cfErrorMsg,
    };
  }

  // ── Streak calculation (IST timezone) ──
  let completedDates = preloadedCompletedDates;
  if (completedDates === undefined) {
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('completed_at')
      .eq('assigned_to', u.id)
      .eq('status', 'Completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .range(0, 999);
    completedDates = (completedTasks || []).map((t: any) => t.completed_at);
  }

  let existingMax = preloadedMaxStreak;
  let existingLastDate: string | null = preloadedExistingStats?.last_solve_date || null;
  if (existingMax === undefined) {
    const { data: existing } = await supabase
      .from('user_stats')
      .select('max_streak, last_solve_date')
      .eq('user_id', u.id)
      .maybeSingle();
    existingMax = existing?.max_streak || 0;
    existingLastDate = existing?.last_solve_date || null;
  }

  const streakMetrics = computeStreakMetricsFromDates(completedDates || [], existingMax || 0, existingLastDate);
  statsPayload.current_streak = streakMetrics.current_streak;
  statsPayload.max_streak = streakMetrics.max_streak;
  statsPayload.last_solve_date = streakMetrics.last_solve_date;

  return { statsPayload, issue };
}

// ─── Diagnostic Columns Check & Safe Upsert ───────────────────
let _hasDiagnosticsColumns: boolean | null = null;

export async function checkDiagnosticsColumns(supabase: any): Promise<boolean> {
  if (_hasDiagnosticsColumns !== null) return _hasDiagnosticsColumns;
  try {
    const { error } = await supabase.from('user_stats').select('lc_status').limit(1);
    if (error && (error.code === 'PGRST204' || error.message?.includes('lc_status') || error.message?.includes('column'))) {
      _hasDiagnosticsColumns = false;
    } else {
      _hasDiagnosticsColumns = true;
    }
  } catch {
    _hasDiagnosticsColumns = false;
  }
  return _hasDiagnosticsColumns;
}

export function sanitizeStatsPayloadForDB(payload: Record<string, any>, hasDiagnostics: boolean) {
  const { id: _ignoreId, ...rest } = payload;
  if (hasDiagnostics) return rest;
  const copy = { ...rest };
  delete copy.lc_status;
  delete copy.lc_error_msg;
  delete copy.cf_status;
  delete copy.cf_error_msg;
  return copy;
}

export async function upsertUserStatsSafely(supabase: any, statsPayload: Record<string, any>) {
  const hasDiag = await checkDiagnosticsColumns(supabase);
  const dbPayload = sanitizeStatsPayloadForDB(statsPayload, hasDiag);

  let { data, error } = await supabase.from('user_stats').upsert(dbPayload, { onConflict: 'user_id' });

  if (error && (error.code === 'PGRST204' || error.message?.includes('column'))) {
    _hasDiagnosticsColumns = false;
    const fallbackPayload = sanitizeStatsPayloadForDB(statsPayload, false);
    const retry = await supabase.from('user_stats').upsert(fallbackPayload, { onConflict: 'user_id' });
    data = retry.data;
    error = retry.error;
  }

  return { data, error };
}

async function upsertUserStatsBatchSafely(supabase: any, payloads: Record<string, any>[]) {
  if (payloads.length === 0) return { error: null };
  const hasDiag = await checkDiagnosticsColumns(supabase);
  const sanitized = payloads.map((p) => sanitizeStatsPayloadForDB(p, hasDiag));

  let { error } = await supabase.from('user_stats').upsert(sanitized, { onConflict: 'user_id' });

  if (error && (error.code === 'PGRST204' || error.message?.includes('column'))) {
    _hasDiagnosticsColumns = false;
    const fallbackRows = payloads.map((p) => sanitizeStatsPayloadForDB(p, false));
    const retry = await supabase.from('user_stats').upsert(fallbackRows, { onConflict: 'user_id' });
    error = retry.error;
  }

  return { error };
}

// ─── Instant Single-User Streak Recalculation (Zero external API) ────
export async function recalculateUserStreak(supabase: any, userId: string) {
  const [{ data: completedTasks }, { data: existingRow }] = await Promise.all([
    supabase
      .from('tasks')
      .select('completed_at')
      .eq('assigned_to', userId)
      .eq('status', 'Completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .range(0, 999),
    supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const completedDates = (completedTasks || []).map((t: any) => t.completed_at);
  const streakMetrics = computeStreakMetricsFromDates(
    completedDates,
    existingRow?.max_streak || 0,
    existingRow?.last_solve_date || null
  );

  if (existingRow) {
    const changed =
      existingRow.current_streak !== streakMetrics.current_streak ||
      existingRow.max_streak !== streakMetrics.max_streak ||
      existingRow.last_solve_date !== streakMetrics.last_solve_date;

    if (changed) {
      await supabase
        .from('user_stats')
        .update({
          current_streak: streakMetrics.current_streak,
          max_streak: streakMetrics.max_streak,
          last_solve_date: streakMetrics.last_solve_date,
        })
        .eq('user_id', userId);
    }
  } else {
    // Use yesterday's timestamp so a newly created user doesn't trick hasDailySyncRunTodayIST
    await supabase.from('user_stats').upsert(
      {
        user_id: userId,
        current_streak: streakMetrics.current_streak,
        max_streak: streakMetrics.max_streak,
        last_solve_date: streakMetrics.last_solve_date,
        synced_at: new Date(Date.now() - 86400000).toISOString(),
      },
      { onConflict: 'user_id' }
    );
  }

  return streakMetrics;
}

// ─── Fast DB-Only Streak Sync for All Eligible Users (< 500ms) ──────
export async function syncAllUserStreaksFromDB(
  supabase: any,
  options?: { preloadedUsers?: any[]; preloadedStats?: any[] }
): Promise<{ updated: number; total: number }> {
  const [usersRes, statsList, allCompletedTasks] = await Promise.all([
    options?.preloadedUsers
      ? Promise.resolve({ data: options.preloadedUsers, error: null })
      : supabase
          .from('users')
          .select('id, year, roll_number, approval_status, role')
          .neq('role', 'admin'),
    options?.preloadedStats ? Promise.resolve(options.preloadedStats) : fetchAllUserStats(supabase),
    fetchAllCompletedTasks(supabase),
  ]);

  const eligibleUsers = (usersRes?.data || []).filter((u: any) => {
    if (u.role === 'admin' || u.approval_status === 'rejected') return false;
    const hasRoll = Boolean(u.roll_number && String(u.roll_number).trim() !== '');
    const hasYear = Boolean(u.year && String(u.year).trim() !== '');
    return hasRoll && hasYear;
  });

  const existingStatsMap = new Map<string, any>();
  (statsList || []).forEach((s: any) => existingStatsMap.set(s.user_id, s));

  const completedTasksByUser = new Map<string, string[]>();
  allCompletedTasks.forEach((t) => {
    const list = completedTasksByUser.get(t.assigned_to) || [];
    list.push(t.completed_at);
    completedTasksByUser.set(t.assigned_to, list);
  });

  const rowsToUpsert: Record<string, any>[] = [];
  const yesterdayTimestamp = new Date(Date.now() - 86400000).toISOString();

  for (const u of eligibleUsers) {
    const existing = existingStatsMap.get(u.id);
    const dates = completedTasksByUser.get(u.id) || [];
    const streakMetrics = computeStreakMetricsFromDates(
      dates,
      existing?.max_streak || 0,
      existing?.last_solve_date || null
    );

    if (!existing) {
      rowsToUpsert.push({
        user_id: u.id,
        current_streak: streakMetrics.current_streak,
        max_streak: streakMetrics.max_streak,
        last_solve_date: streakMetrics.last_solve_date,
        synced_at: yesterdayTimestamp,
      });
    } else if (
      existing.current_streak !== streakMetrics.current_streak ||
      existing.max_streak !== streakMetrics.max_streak ||
      existing.last_solve_date !== streakMetrics.last_solve_date
    ) {
      rowsToUpsert.push({
        ...existing,
        current_streak: streakMetrics.current_streak,
        max_streak: streakMetrics.max_streak,
        last_solve_date: streakMetrics.last_solve_date,
      });
    }
  }

  const UPSERT_CHUNK = 100;
  for (let i = 0; i < rowsToUpsert.length; i += UPSERT_CHUNK) {
    await upsertUserStatsBatchSafely(supabase, rowsToUpsert.slice(i, i + UPSERT_CHUNK));
  }

  return { updated: rowsToUpsert.length, total: eligibleUsers.length };
}

declare global {
  // eslint-disable-next-line no-var
  var __ocdLastStreakSyncIST: string | undefined;
  // eslint-disable-next-line no-var
  var __ocdLastStreakSyncAt: number | undefined;
}

/**
 * Ensures IST streaks in `user_stats` are always fresh upon day rollover or stale checks
 * (runs in ~100ms, zero external API calls).
 */
export async function syncAllUserStreaksIfStale(
  supabase: any,
  options?: { preloadedUsers?: any[]; preloadedStats?: any[] }
): Promise<boolean> {
  const todayIST = getTodayIST();
  const yesterdayIST = getDateOffsetIST(-1);
  const now = Date.now();

  const hasExpiredActiveStreak = (options?.preloadedStats || []).some(
    (s: any) => (s.current_streak || 0) > 0 && s.last_solve_date && s.last_solve_date < yesterdayIST
  );

  const recentlyChecked =
    !hasExpiredActiveStreak &&
    globalThis.__ocdLastStreakSyncIST === todayIST &&
    globalThis.__ocdLastStreakSyncAt &&
    now - globalThis.__ocdLastStreakSyncAt < 30_000;

  if (recentlyChecked) {
    return false;
  }

  try {
    await syncAllUserStreaksFromDB(supabase, options);
    globalThis.__ocdLastStreakSyncIST = todayIST;
    globalThis.__ocdLastStreakSyncAt = Date.now();
    return true;
  } catch (err) {
    console.error('[SyncEngine] Streak refresh error:', err);
    return false;
  }
}

// ─── Sync Single User Stats on Demand (e.g. handle update) ───
export async function syncSingleUserStats(supabase: any, userId: string) {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, full_name, email, cf_handle, lc_handle')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    return { success: false, error: userError?.message || 'User not found' };
  }

  const { data: existing } = await supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle();
  const { statsPayload, issue } = await computeUserStats(
    supabase,
    user,
    undefined,
    existing?.max_streak || 0,
    null,
    existing
  );

  const { error: upsertError } = await upsertUserStatsSafely(supabase, statsPayload);

  if (upsertError) {
    return { success: false, error: upsertError.message };
  }

  return { success: true, stats: statsPayload, issue };
}

// ─── Sync Leaderboard Rankings ──────────────────────────────
export async function syncLeaderboardRankings(
  supabase: any,
  options?: {
    deadlineMs?: number;
    skipFreshHours?: number;
    force?: boolean;
  }
) {
  cfMinGapMs = 230;
  const { data: allUsers, error: usersError } = await supabase
    .from('users')
    .select('id, full_name, email, year, roll_number, cf_handle, lc_handle, approval_status, role')
    .neq('role', 'admin');

  if (usersError || !allUsers) {
    return {
      synced: 0,
      total: 0,
      skippedFresh: 0,
      stoppedDueToTimeBudget: false,
      issues: [],
      errors: [usersError?.message || 'Failed to fetch users'],
    };
  }

  const users = allUsers.filter((u: any) => {
    if (u.role === 'admin' || u.approval_status === 'rejected') return false;
    const hasRoll = Boolean(u.roll_number && String(u.roll_number).trim() !== '');
    const hasYear = Boolean(u.year && String(u.year).trim() !== '');
    return hasRoll && hasYear;
  });

  // Clean up rejected/admin user_stats rows
  const { data: invalidUsers } = await supabase
    .from('users')
    .select('id')
    .or('role.eq.admin,approval_status.eq.rejected');

  if (invalidUsers && invalidUsers.length > 0) {
    const invalidIds = invalidUsers.map((u: any) => u.id);
    await supabase.from('user_stats').delete().in('user_id', invalidIds);
  }

  // Paginated pre-load of existing stats & ALL completed tasks (fixes 1000-row truncation!)
  const [existingStatsList, allCompletedTasks] = await Promise.all([
    fetchAllUserStats(supabase),
    fetchAllCompletedTasks(supabase),
  ]);

  const existingStatsMap = new Map<string, any>();
  existingStatsList.forEach((s: any) => existingStatsMap.set(s.user_id, s));

  const completedTasksByUser = new Map<string, string[]>();
  allCompletedTasks.forEach((t) => {
    const list = completedTasksByUser.get(t.assigned_to) || [];
    list.push(t.completed_at);
    completedTasksByUser.set(t.assigned_to, list);
  });

  // Phase 1 (< 0.5s): Immediately guarantee EVERY eligible user's IST streak is up to date!
  await syncAllUserStreaksFromDB(supabase, {
    preloadedUsers: allUsers,
    preloadedStats: existingStatsList,
  });

  // Refresh existingStatsMap streak numbers in memory so any skipped user stays clean
  const freshCutoffMs =
    !options?.force && options?.skipFreshHours
      ? Date.now() - options.skipFreshHours * 60 * 60 * 1000
      : 0;

  let skippedFresh = 0;
  const usersToSync = users
    .filter((u: any) => {
      if (!freshCutoffMs) return true;
      const existing = existingStatsMap.get(u.id);
      if (existing?.synced_at && new Date(existing.synced_at).getTime() >= freshCutoffMs) {
        skippedFresh++;
        return false;
      }
      return true;
    })
    // Stale-first: never-synced or oldest-synced users always update first
    .sort((a: any, b: any) => {
      const aTime = existingStatsMap.get(a.id)?.synced_at ? new Date(existingStatsMap.get(a.id).synced_at).getTime() : 0;
      const bTime = existingStatsMap.get(b.id)?.synced_at ? new Date(existingStatsMap.get(b.id).synced_at).getTime() : 0;
      return aTime - bTime;
    });

  // Phase 2: Bulk fetch Codeforces user.info in batches of 25 (~3 seconds total instead of 175 calls!)
  const cfHandlesToCheck = usersToSync
    .map((u: any) => cleanCodeforcesHandle(u.cf_handle))
    .filter(Boolean) as string[];

  const cfInfoMap =
    options?.deadlineMs && Date.now() >= options.deadlineMs
      ? new Map<string, CFInfoResult>()
      : await fetchCFInfoBatchMap(cfHandlesToCheck);

  let synced = 0;
  let stoppedDueToTimeBudget = false;
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

  const BATCH_SIZE = 4;
  for (let i = 0; i < usersToSync.length; i += BATCH_SIZE) {
    if (options?.deadlineMs && Date.now() >= options.deadlineMs) {
      stoppedDueToTimeBudget = true;
      break;
    }

    const batch = usersToSync.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (u: any) => {
        try {
          const userCompletedDates = completedTasksByUser.get(u.id) || [];
          const existing = existingStatsMap.get(u.id);
          const cfClean = cleanCodeforcesHandle(u.cf_handle);
          const preloadedCFInfo = cfClean ? cfInfoMap.get(cfClean.toLowerCase()) || null : null;

          const { statsPayload, issue } = await computeUserStats(
            supabase,
            u,
            userCompletedDates,
            existing?.max_streak || 0,
            preloadedCFInfo,
            existing
          );
          if (issue) issues.push(issue);

          const { error: upsertError } = await upsertUserStatsSafely(supabase, statsPayload);

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
  }

  return {
    synced,
    total: users.length,
    attempted: usersToSync.length,
    skippedFresh,
    stoppedDueToTimeBudget,
    issues,
    errors,
  };
}

// ─── Master Daily Sync: Rollout Scheduled Questions + Sync Rankings ─────────
export async function executeDailySync(options?: {
  supabaseClient?: any;
  source?: string;
  targetDateIST?: string;
  maxExecutionMs?: number;
  skipFreshHours?: number;
  force?: boolean;
}) {
  const supabase = options?.supabaseClient || createAdminSupabaseClient();
  const source = options?.source || 'cron';
  const targetDateIST = options?.targetDateIST || getTodayIST();
  const maxExecutionMs = options?.maxExecutionMs ?? 120_000;
  const deadlineMs = Date.now() + maxExecutionMs;

  console.log(`[AutoRefresh] Starting daily sync (date: ${targetDateIST}, source: ${source}, budget: ${maxExecutionMs}ms)...`);

  // Step 1: Roll out scheduled questions due today or earlier in IST
  const rolloutResult = await rollOutScheduledTasks(supabase, targetDateIST);

  // Step 2: Sync all IST streaks immediately + platform rankings within time budget
  const rankingsResult = await syncLeaderboardRankings(supabase, {
    deadlineMs,
    skipFreshHours: options?.skipFreshHours,
    force: options?.force,
  });

  const issueMsg =
    rankingsResult.issues.length > 0
      ? ` Detected ${rankingsResult.issues.length} profile(s) with private settings or invalid handles.`
      : '';

  const rolloutMsg =
    rolloutResult.rolledOutCount > 0
      ? ` Rolled out ${rolloutResult.rolledOutCount} scheduled question(s) (${rolloutResult.totalTasksCreated} mentee tasks assigned).`
      : ' No pending questions due for rollout.';

  const budgetNote = rankingsResult.stoppedDueToTimeBudget
    ? ' (Paused cleanly at time budget; remaining stale profiles queued for next pass.)'
    : '';

  const message = `Auto-sync complete: Synced ${rankingsResult.synced}/${rankingsResult.total} users.${rolloutMsg}${issueMsg}${budgetNote}`;

  const allErrors = [...rolloutResult.errors, ...rankingsResult.errors];

  if (allErrors.length > 0) {
    console.error(`[AutoRefresh] Daily sync encountered ${allErrors.length} errors (showing first 5):`, allErrors.slice(0, 5));
  }

  console.log(`[AutoRefresh] Finished daily sync: ${message}`);

  return {
    success: true,
    source,
    targetDateIST,
    timestamp: new Date().toISOString(),
    synced: rankingsResult.synced,
    total: rankingsResult.total,
    skippedFresh: rankingsResult.skippedFresh,
    partial: rankingsResult.stoppedDueToTimeBudget,
    rolledOutScheduledTasks: rolloutResult.rolledOutCount,
    createdMenteeTasks: rolloutResult.totalTasksCreated,
    issues: rankingsResult.issues,
    errors: allErrors.length > 0 ? allErrors : undefined,
    message,
  };
}

// ─── First User Visit Daily Sync Trigger ──────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __ocdLastSyncDateIST: string | undefined;
  // eslint-disable-next-line no-var
  var __ocdSyncRunning: boolean | undefined;
}

/**
 * Checks whether at least 80% of eligible users were synced today in IST.
 * Avoids false positives when a single user edits their profile after midnight IST.
 */
export async function hasDailySyncRunTodayIST(supabase: any, todayIST?: string): Promise<boolean> {
  const targetDate = todayIST || getTodayIST();
  if (globalThis.__ocdLastSyncDateIST === targetDate) {
    return true;
  }
  if (globalThis.__ocdSyncRunning) {
    return true;
  }

  try {
    const [{ count: eligibleCount }, statsList] = await Promise.all([
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .neq('role', 'admin')
        .neq('approval_status', 'rejected')
        .not('roll_number', 'is', null)
        .not('year', 'is', null),
      fetchAllUserStats(supabase),
    ]);

    const syncedToday = statsList.filter(
      (s: any) => s.synced_at && toISTDateString(s.synced_at) === targetDate
    ).length;

    const threshold = Math.max(1, Math.floor((eligibleCount || statsList.length || 1) * 0.8));
    if (syncedToday >= threshold) {
      globalThis.__ocdLastSyncDateIST = targetDate;
      return true;
    }
  } catch (err) {
    console.error('[SyncEngine] Error checking last sync date:', err);
  }

  return false;
}

/**
 * Automatically triggers the daily sync in long-lived Node servers on first visit.
 * On Vercel Serverless, crons handle external LC/CF syncs cleanly while GET requests update
 * task rollouts and streaks synchronously so background tasks are never orphaned/killed mid-flight.
 */
export async function triggerDailySyncIfFirstVisitToday(supabase: any, todayIST?: string): Promise<boolean> {
  if (process.env.VERCEL) {
    return false;
  }

  const targetDate = todayIST || getTodayIST();
  const alreadyRun = await hasDailySyncRunTodayIST(supabase, targetDate);
  if (alreadyRun) {
    return false;
  }

  globalThis.__ocdSyncRunning = true;
  globalThis.__ocdLastSyncDateIST = targetDate;

  console.log(`[AutoRefresh] First user visit of today (${targetDate} IST)! Launching automatic daily sync in background...`);

  executeDailySync({
    supabaseClient: supabase,
    source: 'first_user_visit_of_day',
    targetDateIST: targetDate,
    skipFreshHours: 6,
  })
    .catch((err) => {
      console.error('[AutoRefresh] Background daily sync error on first visit:', err);
    })
    .finally(() => {
      globalThis.__ocdSyncRunning = false;
    });

  return true;
}
