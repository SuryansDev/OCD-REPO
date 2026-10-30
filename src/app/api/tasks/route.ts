import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { parseTaskLink } from '@/lib/taskParser';
import { getTodayIST, getDateOffsetIST } from '@/lib/dateUtils';

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

// POST /api/tasks — bulk create tasks for all mentees (or schedule if scheduled_date is provided)
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { link, scheduled_date } = body;

  if (!link) {
    return NextResponse.json({ error: 'link is required' }, { status: 400 });
  }

  const parsed = parseTaskLink(link);
  if (!parsed) {
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

  const todayIST = getTodayIST();
  const targetDate = scheduled_date ? String(scheduled_date).trim() : todayIST;

  // If a future date within a week was requested, route to scheduled_tasks
  if (targetDate > todayIST) {
    const maxDateIST = getDateOffsetIST(7);
    if (targetDate > maxDateIST) {
      return NextResponse.json({ error: 'You can only schedule questions up to a week (7 days) in advance.' }, { status: 400 });
    }

    const { data: scheduledTask, error: schedError } = await supabase
      .from('scheduled_tasks')
      .insert({
        mentor_id: user.id,
        platform: parsed.platform,
        problem_slug_or_id: parsed.problemSlugOrId,
        scheduled_date: targetDate,
        status: 'pending',
      })
      .select()
      .single();

    if (schedError) {
      return NextResponse.json(
        { error: `Failed to schedule task: ${schedError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      scheduled: true,
      message: `Question scheduled for ${targetDate}. It will roll out automatically at 00:00 AM IST!`,
      scheduledTask,
    });
  }

  // Immediate assignment for today (IST)
  const taskRows = mentorships.map((m) => ({
    assigned_by: user.id,
    assigned_to: m.mentee_id,
    platform: parsed.platform,
    problem_slug_or_id: parsed.problemSlugOrId,
    status: 'Pending',
    assigned_date: todayIST,
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
