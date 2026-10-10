import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Helper to create supabase client from route handler
function createRouteHandlerClient(request: NextRequest) {
  const cookieStore = request.cookies;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value }) => {
              cookieStore.set(name, value);
            });
          } catch (error) {
            // Route handlers can't set cookies on the response this way
          }
        },
      },
    }
  );
}

// ─── Normalization Helpers ─────────────────────────────────
function normalizeCF(problemId: string): string {
  if (problemId.includes('/')) {
    const parts = problemId.split('/');
    return `${parts[0].trim()}/${parts[1].trim().toUpperCase()}`;
  }
  const match = problemId.match(/^(\d+)([A-Za-z]\d*)$/);
  if (match) return `${match[1]}/${match[2].toUpperCase()}`;
  return problemId.toUpperCase();
}

function normalizeLC(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/leetcode\.com\/problems\//, '')
    .replace(/\/$/, '');
}

// ─── Codeforces verification ────────────────────────────────
async function getCodeforcesAC(cfHandleInput: string): Promise<Set<string>> {
  let cfHandle = cfHandleInput.trim();
  if (cfHandle.includes('codeforces.com/profile/')) {
    const match = cfHandle.match(/profile\/([^\/]+)/);
    if (match) cfHandle = match[1];
  }

  try {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(cfHandle)}&from=1&count=100`,
      { next: { revalidate: 0 } }
    );

    if (!res.ok) return new Set();

    const data = await res.json();
    if (data.status !== 'OK') return new Set();

    const solved = new Set<string>();
    data.result.forEach((sub: any) => {
      if (sub.verdict === 'OK' && sub.problem?.contestId && sub.problem?.index) {
        solved.add(`${sub.problem.contestId}/${sub.problem.index.toUpperCase()}`);
      }
    });
    return solved;
  } catch {
    return new Set();
  }
}

// ─── LeetCode verification ─────────────────────────────────
async function getLeetCodeAC(lcHandleInput: string): Promise<Set<string>> {
  let lcHandle = lcHandleInput.trim();
  if (lcHandle.includes('leetcode.com/')) {
    const match = lcHandle.match(/leetcode\.com\/(?:u\/)?([^\/]+)/);
    if (match) lcHandle = match[1];
  }

  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query recentAcSubmissionList($username: String!, $limit: Int!) {
            recentAcSubmissionList(username: $username, limit: $limit) {
              titleSlug
            }
          }
        `,
        variables: { username: lcHandle, limit: 100 },
      }),
      next: { revalidate: 0 },
    });

    if (!res.ok) return new Set();

    const data = await res.json();
    const submissions = data?.data?.recentAcSubmissionList;
    if (!Array.isArray(submissions)) return new Set();

    const solved = new Set<string>();
    submissions.forEach((sub: any) => {
      solved.add(sub.titleSlug.toLowerCase());
    });
    return solved;
  } catch {
    return new Set();
  }
}

// ─── POST /api/verify ───────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch all pending tasks for this user
  const { data: pendingTasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', user.id)
    .eq('status', 'Pending');

  if (tasksError || !pendingTasks || pendingTasks.length === 0) {
    return NextResponse.json({ verifiedCount: 0, message: 'No pending tasks to verify.' });
  }

  // Fetch user profile for handles
  const { data: profile } = await supabase
    .from('users')
    .select('cf_handle, lc_handle')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Check which platforms we need to hit
  const hasLC = pendingTasks.some(t => t.platform === 'LeetCode');
  const hasCF = pendingTasks.some(t => t.platform === 'Codeforces');

  let lcSolved = new Set<string>();
  let cfSolved = new Set<string>();

  // Fetch solved sets concurrently if possible
  const promises = [];
  if (hasLC && profile.lc_handle) {
    promises.push(getLeetCodeAC(profile.lc_handle).then(set => lcSolved = set));
  }
  if (hasCF && profile.cf_handle) {
    promises.push(getCodeforcesAC(profile.cf_handle).then(set => cfSolved = set));
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }

  // Determine which tasks can be marked completed
  const completedTaskIds: number[] = [];

  for (const task of pendingTasks) {
    if (task.platform === 'LeetCode' && lcSolved.has(normalizeLC(task.problem_slug_or_id))) {
      completedTaskIds.push(task.id);
    } else if (task.platform === 'Codeforces' && cfSolved.has(normalizeCF(task.problem_slug_or_id))) {
      completedTaskIds.push(task.id);
    }
  }

  if (completedTaskIds.length > 0) {
    // Batch update the tasks
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'Completed',
        completed_at: new Date().toISOString(),
      })
      .in('id', completedTaskIds);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update task statuses' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      verifiedCount: completedTaskIds.length,
      message: `Successfully verified ${completedTaskIds.length} tasks!`
    });
  }

  return NextResponse.json({
    verifiedCount: 0,
    message: 'Could not verify any new submissions. Keep solving!',
  });
}
