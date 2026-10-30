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

// ─── POST /api/tasks/schedule — schedule a question up to 7 days ahead ──────
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

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

  // Get all active mentees for this mentor
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

  const todayIST = getTodayIST();
  const maxDateIST = getDateOffsetIST(7); // Up to a week in advance

  const targetDate = scheduled_date ? String(scheduled_date).trim() : todayIST;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json({ error: 'Invalid scheduled_date format. Must be YYYY-MM-DD.' }, { status: 400 });
  }

  if (targetDate < todayIST) {
    return NextResponse.json({ error: 'Scheduled date cannot be in the past.' }, { status: 400 });
  }

  if (targetDate > maxDateIST) {
    return NextResponse.json({ error: 'You can only schedule questions up to a week (7 days) in advance.' }, { status: 400 });
  }

  // Case 1: Target date is today -> roll out immediately into tasks table
  if (targetDate === todayIST) {
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
      rolledOutNow: true,
      message: `Assigned task to ${tasks.length} mentee(s) for today!`,
      count: tasks.length,
    });
  }

  // Case 2: Target date is in the future (within next 7 days) -> queue in scheduled_tasks table
  const { data: existingScheduled } = await supabase
    .from('scheduled_tasks')
    .select('id')
    .eq('mentor_id', user.id)
    .eq('scheduled_date', targetDate)
    .eq('platform', parsed.platform)
    .eq('problem_slug_or_id', parsed.problemSlugOrId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingScheduled) {
    return NextResponse.json(
      { error: 'This question is already scheduled for this date.' },
      { status: 400 }
    );
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

  return NextResponse.json({
    success: true,
    rolledOutNow: false,
    message: `Question scheduled for ${targetDate}. It will roll out automatically to your cohort at 00:00 AM IST!`,
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

