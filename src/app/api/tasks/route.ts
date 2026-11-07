import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { parseTaskLink } from '@/lib/taskParser';
import { getTodayIST, getDateOffsetIST } from '@/lib/dateUtils';
import { rollOutScheduledTasks } from '@/lib/syncEngine';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function createRouteHandlerClient(request: NextRequest) {
  const cookieStore = request.cookies;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
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

// GET /api/tasks — roll out any due tasks and return tasks assigned to user
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Trigger rollout of any scheduled tasks that became due today (IST) or earlier
  try {
    const adminClient = createAdminSupabaseClient();
    await rollOutScheduledTasks(adminClient);
  } catch (err) {
    console.error('[Tasks API] Rollout check error:', err);
  }

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: tasks || [] });
}

// POST /api/tasks — bulk create tasks for all mentees or target year (or schedule if scheduled_date is provided)
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch user profile to verify role
  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userProfile?.role || 'user';
  const isCommonMentorOrAdmin = userRole === 'common_mentor' || userRole === 'admin';

  const body = await request.json().catch(() => ({}));
  const { link, scheduled_date, target_year } = body;

  if (!link) {
    return NextResponse.json({ error: 'link is required' }, { status: 400 });
  }

  const parsed = parseTaskLink(link);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Could not parse link. Ensure it is a valid Codeforces, LeetCode, CSES, or YouTube link.' },
      { status: 400 }
    );
  }

  let targetStudentIds: string[] = [];
  const normalizedTargetYear = target_year ? String(target_year).trim() : null;

  if (normalizedTargetYear) {
    if (!isCommonMentorOrAdmin) {
      return NextResponse.json(
        { error: 'Only Common Mentors and Admins can assign questions to an entire year.' },
        { status: 403 }
      );
    }

    let studentQuery = supabase
      .from('users')
      .select('id')
      .neq('role', 'admin')
      .eq('approval_status', 'approved');

    if (normalizedTargetYear !== 'all') {
      studentQuery = studentQuery.eq('year', normalizedTargetYear);
    }

    const { data: students, error: studentError } = await studentQuery;
    if (studentError || !students?.length) {
      return NextResponse.json(
        { error: `No approved students found in ${normalizedTargetYear === 'all' ? 'any year' : 'Year ' + normalizedTargetYear}.` },
        { status: 400 }
      );
    }
    targetStudentIds = students.map((s) => s.id);
  } else {
    // Standard mentor cohort
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
    targetStudentIds = mentorships.map((m) => m.mentee_id);
  }

  const todayIST = getTodayIST();
  const targetDate = scheduled_date ? String(scheduled_date).trim() : todayIST;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json({ error: 'Invalid scheduled_date format. Must be YYYY-MM-DD.' }, { status: 400 });
  }

  if (targetDate < todayIST) {
    return NextResponse.json({ error: 'Scheduled date cannot be in the past.' }, { status: 400 });
  }

  const maxDateIST = getDateOffsetIST(30);
  if (targetDate > maxDateIST) {
    return NextResponse.json({ error: 'You can only schedule questions up to 1 month (30 days) in advance.' }, { status: 400 });
  }

  // If a future date within 30 days was requested, route to scheduled_tasks
  if (targetDate > todayIST) {
    const insertPayload: any = {
      mentor_id: user.id,
      platform: parsed.platform,
      problem_slug_or_id: parsed.problemSlugOrId,
      scheduled_date: targetDate,
      status: 'pending',
    };

    if (normalizedTargetYear) {
      insertPayload.target_year = normalizedTargetYear;
    }

    const adminClient = createAdminSupabaseClient();
    let { data: scheduledTask, error: schedError } = await adminClient
      .from('scheduled_tasks')
      .insert(insertPayload)
      .select()
      .single();

    // Fallback: If target_year column does not exist yet in DB schema, encode in problem_slug_or_id
    if (schedError && normalizedTargetYear && (schedError.code === 'PGRST204' || schedError.message?.includes('target_year'))) {
      insertPayload.problem_slug_or_id = `${parsed.problemSlugOrId}::year:${normalizedTargetYear}`;
      delete insertPayload.target_year;

      const retry = await adminClient
        .from('scheduled_tasks')
        .insert(insertPayload)
        .select()
        .single();

      scheduledTask = retry.data;
      schedError = retry.error;
    }

    if (schedError) {
      return NextResponse.json(
        { error: `Failed to schedule task: ${schedError.message}` },
        { status: 500 }
      );
    }

    const targetLabel = normalizedTargetYear
      ? (normalizedTargetYear === 'all' ? 'all students' : `Year ${normalizedTargetYear} students`)
      : 'your cohort';

    return NextResponse.json({
      success: true,
      scheduled: true,
      message: `Question scheduled for ${targetDate}. It will roll out automatically to ${targetLabel} on that day!`,
      scheduledTask,
    });
  }

  // Immediate assignment for today (IST)
  const taskRows = targetStudentIds.map((studentId) => ({
    assigned_by: user.id,
    assigned_to: studentId,
    platform: parsed.platform,
    problem_slug_or_id: parsed.problemSlugOrId,
    status: 'Pending',
    assigned_date: todayIST,
  }));

  const adminClient = createAdminSupabaseClient();
  const { data: tasks, error: insertError } = await adminClient
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
