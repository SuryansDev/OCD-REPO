import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Route handlers can't set cookies on the response this way
          }
        },
      },
    }
  );
}

// ─── Codeforces verification ────────────────────────────────
async function verifyCodeforces(cfHandleInput: string, problemId: string): Promise<boolean> {
  // Normalize cfHandle just in case they provided a profile URL
  let cfHandle = cfHandleInput.trim();
  if (cfHandle.includes('codeforces.com/profile/')) {
    const match = cfHandle.match(/profile\/([^\/]+)/);
    if (match) cfHandle = match[1];
  }
  
  // problemId format: "contestId/problemIndex" e.g. "1920/A" or just "1920A"
  // Normalize: accept "1920/A", "1920A", "1920/a"
  let contestId: string;
  let problemIndex: string;

  if (problemId.includes('/')) {
    const parts = problemId.split('/');
    contestId = parts[0].trim();
    problemIndex = parts[1].trim().toUpperCase();
  } else {
    // e.g. "1920A" — split at the boundary between digits and letters
    const match = problemId.match(/^(\d+)([A-Za-z]\d*)$/);
    if (!match) return false;
    contestId = match[1];
    problemIndex = match[2].toUpperCase();
  }

  try {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(cfHandle)}&from=1&count=100`,
      { next: { revalidate: 0 } }
    );

    if (!res.ok) return false;

    const data = await res.json();
    if (data.status !== 'OK') return false;

    // Check if any submission matches and has verdict OK
    return data.result.some(
      (sub: any) =>
        sub.verdict === 'OK' &&
        String(sub.problem.contestId) === contestId &&
        sub.problem.index.toUpperCase() === problemIndex
    );
  } catch {
    return false;
  }
}

// ─── LeetCode verification ─────────────────────────────────
async function verifyLeetCode(lcHandleInput: string, titleSlug: string): Promise<boolean> {
  // Normalize lcHandle just in case they provided a profile URL
  let lcHandle = lcHandleInput.trim();
  if (lcHandle.includes('leetcode.com/')) {
    const match = lcHandle.match(/leetcode\.com\/(?:u\/)?([^\/]+)/);
    if (match) lcHandle = match[1];
  }

  // Normalize the slug
  const normalizedSlug = titleSlug
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/leetcode\.com\/problems\//, '')
    .replace(/\/$/, '');

  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query recentAcSubmissionList($username: String!, $limit: Int!) {
            recentAcSubmissionList(username: $username, limit: $limit) {
              titleSlug
              timestamp
            }
          }
        `,
        variables: {
          username: lcHandle,
          limit: 50,
        },
      }),
      next: { revalidate: 0 },
    });

    if (!res.ok) return false;

    const data = await res.json();
    const submissions = data?.data?.recentAcSubmissionList;
    if (!Array.isArray(submissions)) return false;

    return submissions.some(
      (sub: any) => sub.titleSlug.toLowerCase() === normalizedSlug
    );
  } catch {
    return false;
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

  const body = await request.json();
  const { taskId } = body;

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  // Fetch the task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('assigned_to', user.id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status === 'Completed') {
    return NextResponse.json({ verified: true, message: 'Already completed' });
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

  let verified = false;

  if (task.platform === 'Codeforces') {
    if (!profile.cf_handle) {
      return NextResponse.json(
        { error: 'Codeforces handle not set in your profile' },
        { status: 400 }
      );
    }
    verified = await verifyCodeforces(profile.cf_handle, task.problem_slug_or_id);
  } else if (task.platform === 'LeetCode') {
    if (!profile.lc_handle) {
      return NextResponse.json(
        { error: 'LeetCode handle not set in your profile' },
        { status: 400 }
      );
    }
    verified = await verifyLeetCode(profile.lc_handle, task.problem_slug_or_id);
  }

  if (verified) {
    // Update task status
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'Completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update task status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ verified: true, message: 'Problem verified and marked as completed!' });
  }

  return NextResponse.json({
    verified: false,
    message: 'Could not verify submission. Make sure you have solved the problem with an accepted verdict.',
  });
}
