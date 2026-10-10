import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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
          } catch (error) {}
        },
      },
    }
  );
}

// POST /api/tasks — bulk create tasks for all mentees
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { link } = body;

  if (!link) {
    return NextResponse.json({ error: 'link is required' }, { status: 400 });
  }

  let platform = '';
  let problemSlugOrId = '';

  try {
    const url = new URL(link);
    if (url.hostname.includes('codeforces.com')) {
      platform = 'Codeforces';
      const match = link.match(/problem\/(\d+)\/([A-Za-z0-9]+)/);
      if (match) problemSlugOrId = `${match[1]}${match[2]}`;
    } else if (url.hostname.includes('leetcode.com')) {
      platform = 'LeetCode';
      const match = link.match(/problems\/([^\/]+)/);
      if (match) problemSlugOrId = match[1];
    }
  } catch (e) {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  if (!platform || !problemSlugOrId) {
    return NextResponse.json(
      { error: 'Could not parse problem from the provided link. Ensure it is a valid Codeforces or LeetCode problem URL.' },
      { status: 400 }
    );
  }

  // Get all mentees for this mentor
  const { data: mentorships, error: msError } = await supabase
    .from('mentorships')
    .select('mentee_id')
    .eq('mentor_id', user.id);

  if (msError || !mentorships?.length) {
    return NextResponse.json(
      { error: 'No mentees found. Add mentees to your cohort first.' },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split('T')[0];

  // Create tasks for each mentee
  const taskRows = mentorships.map((m) => ({
    assigned_by: user.id,
    assigned_to: m.mentee_id,
    platform,
    problem_slug_or_id: problemSlugOrId,
    status: 'Pending',
    assigned_date: today,
  }));

  const { data: tasks, error: insertError } = await supabase
    .from('tasks')
    .insert(taskRows)
    .select();

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to create tasks: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Created ${tasks.length} task(s) for today`,
    count: tasks.length,
  });
}
