import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { parseTaskLink } from '@/lib/taskParser';
import { getTodayIST, getDateOffsetIST } from '@/lib/dateUtils';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function createRouteHandlerClient(request: NextRequest) {
  const cookieStore = request.cookies;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
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

// ─── GET /api/tasks/schedule — fetch mentor's pending scheduled tasks ───────
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Note: rollout is handled by the leaderboard API on page load — no need to repeat it here.

  const { data: scheduledTasks, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('mentor_id', user.id)
    .eq('status', 'pending')
    .order('scheduled_date', { ascending: true });

  if (error) {
    if (error.code === '42P01' || error.message?.includes('scheduled_tasks')) {
      return NextResponse.json({ scheduledTasks: [], tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scheduledTasks: scheduledTasks || [] });
}

// ─── POST /api/tasks/schedule — schedule a question up to 1 month ahead ──────
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

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
        { error: 'No mentees found. Add mentees to your cohort first before scheduling tasks.' },
        { status: 400 }
      );
    }
    targetStudentIds = mentorships.map((m) => m.mentee_id);
  }

  const todayIST = getTodayIST();
  const maxDateIST = getDateOffsetIST(30); // Up to 1 month in advance

  const targetDate = scheduled_date ? String(scheduled_date).trim() : todayIST;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json({ error: 'Invalid scheduled_date format. Must be YYYY-MM-DD.' }, { status: 400 });
  }

  if (targetDate < todayIST) {
    return NextResponse.json({ error: 'Scheduled date cannot be in the past.' }, { status: 400 });
  }

  if (targetDate > maxDateIST) {
    return NextResponse.json({ error: 'You can only schedule questions up to 1 month (30 days) in advance.' }, { status: 400 });
  }

  // Case 1: Target date is today -> roll out immediately into tasks table
  if (targetDate === todayIST) {
    const uniqueStudentIds = Array.from(new Set(targetStudentIds)).filter(Boolean);
    const adminClient = createAdminSupabaseClient();

    const recipientLabel = normalizedTargetYear
      ? (normalizedTargetYear === 'all' ? 'all years' : `Year ${normalizedTargetYear}`)
      : 'your cohort';

    // Batch query existing tasks for these students on todayIST
    const { data: existingTasks } = await adminClient
      .from('tasks')
      .select('assigned_to')
      .in('assigned_to', uniqueStudentIds)
      .eq('platform', parsed.platform)
      .eq('problem_slug_or_id', parsed.problemSlugOrId)
      .eq('assigned_date', todayIST);

    const alreadyAssignedSet = new Set((existingTasks || []).map((t: any) => t.assigned_to));
    const studentsToAssign = uniqueStudentIds.filter((id) => !alreadyAssignedSet.has(id));

    if (studentsToAssign.length === 0) {
      return NextResponse.json({
        success: true,
        rolledOutNow: true,
        message: `This question was already assigned to ${recipientLabel} for today.`,
        count: 0,
      });
    }

    const taskRows = studentsToAssign.map((studentId) => ({
      assigned_by: user.id,
      assigned_to: studentId,
      platform: parsed.platform,
      problem_slug_or_id: parsed.problemSlugOrId,
      status: 'Pending',
      assigned_date: todayIST,
    }));

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
      rolledOutNow: true,
      message: `Assigned task to ${tasks.length} student(s) of ${recipientLabel} for today!`,
      count: tasks.length,
    });
  }

  // Case 2: Target date is in the future (within next 30 days) -> queue in scheduled_tasks table
  const adminClient = createAdminSupabaseClient();

  // Check if an identical scheduled task is already queued for this date
  let dupQuery = adminClient
    .from('scheduled_tasks')
    .select('id')
    .eq('mentor_id', user.id)
    .eq('platform', parsed.platform)
    .eq('problem_slug_or_id', parsed.problemSlugOrId)
    .eq('scheduled_date', targetDate)
    .eq('status', 'pending');

  if (normalizedTargetYear) {
    dupQuery = dupQuery.eq('target_year', normalizedTargetYear);
  }

  const { data: existingSched } = await dupQuery.limit(1);
  if (existingSched && existingSched.length > 0) {
    return NextResponse.json({
      error: `This question is already scheduled for ${targetDate}.`
    }, { status: 400 });
  }

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

  let { data: scheduledTask, error: schedError } = await adminClient
    .from('scheduled_tasks')
    .insert(insertPayload)
    .select()
    .single();

  // Automatic fallback: If target_year column does not exist yet in DB schema, encode in problem_slug_or_id
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
    if (schedError.code === '42P01' || schedError.message?.includes('scheduled_tasks')) {
      return NextResponse.json(
        { error: 'Database table scheduled_tasks does not exist yet. Please run supabase/scheduled_tasks.sql in your Supabase SQL editor.' },
        { status: 500 }
      );
    }
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
    rolledOutNow: false,
    message: `Question scheduled for ${targetDate}. It will roll out automatically to ${targetLabel} on that day!`,
    scheduledTask,
  });
}

// ─── DELETE /api/tasks/schedule — cancel an upcoming scheduled task ─────────
export async function DELETE(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('scheduled_tasks')
    .delete()
    .eq('id', id)
    .eq('mentor_id', user.id)
    .eq('status', 'pending');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Scheduled task cancelled successfully.' });
}

