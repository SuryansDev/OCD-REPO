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
    const url = new URL(link.trim());
    if (url.hostname.includes('codeforces.com')) {
      platform = 'Codeforces';
      // Match contest / gym: /contest/1800/problem/A or /gym/104000/problem/B
      const contestMatch = link.match(/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
      // Match problemset: /problemset/problem/1800/A
      const problemsetMatch = link.match(/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
      // Fallback: /problem/1800/A
      const fallbackMatch = link.match(/problem\/(\d+)\/([A-Za-z0-9]+)/i);

      const match = contestMatch || problemsetMatch || fallbackMatch;
      if (match) {
        problemSlugOrId = `${match[1]}${match[2].toUpperCase()}`;
      }
    } else if (url.hostname.includes('leetcode.com')) {
      platform = 'LeetCode';
      // Match clean problem slug (e.g. /problems/two-sum/ or /problems/two-sum?envType=...)
      const match = link.match(/problems\/([a-zA-Z0-9\-]+)/);
      if (match) {
        problemSlugOrId = match[1].toLowerCase();
      }
    } else if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      platform = 'YouTube';
      // Match youtu.be/ID
      if (url.hostname.includes('youtu.be')) {
        const id = url.pathname.replace(/^\/+/, '').split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else if (url.pathname.includes('/shorts/')) {
        const id = url.pathname.split('/shorts/')[1]?.split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else if (url.pathname.includes('/embed/')) {
        const id = url.pathname.split('/embed/')[1]?.split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else if (url.pathname.includes('/live/')) {
        const id = url.pathname.split('/live/')[1]?.split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else {
        const id = url.searchParams.get('v');
        if (id) {
          problemSlugOrId = id;
        } else {
          const parts = url.pathname.replace(/^\/+/, '').split(/[\/\?#]/);
          if (parts.length > 0 && parts[0]) problemSlugOrId = parts[0];
        }
      }
    }
  } catch (e) {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  if (!platform || !problemSlugOrId) {
    return NextResponse.json(
      { error: 'Could not parse link. Ensure it is a valid Codeforces, LeetCode, or YouTube link.' },
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
