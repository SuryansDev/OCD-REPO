import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
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

/**
 * GET /api/tasks/mentees
 *
 * Fetches all tasks assigned to the authenticated mentor's mentees,
 * regardless of whether the question was assigned by this mentor,
 * a common mentor, or an administrator.
 */
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminSupabaseClient();

  // Find all mentees of this mentor
  const { data: mentorships, error: mentorError } = await adminClient
    .from('mentorships')
    .select('mentee_id')
    .eq('mentor_id', user.id);

  if (mentorError) {
    return NextResponse.json({ error: mentorError.message }, { status: 500 });
  }

  const menteeIds = (mentorships || []).map((m: any) => m.mentee_id);

  if (menteeIds.length === 0) {
    return NextResponse.json({ tasks: [], count: 0 });
  }

  // Fetch all tasks for these mentees with assignee & assigner details
  const { data: tasks, error: tasksError } = await adminClient
    .from('tasks')
    .select(`
      id,
      assigned_by,
      assigned_to,
      platform,
      problem_slug_or_id,
      status,
      assigned_date,
      completed_at,
      created_at,
      assignee:users!tasks_assigned_to_fkey(id, full_name, email, year, branch, roll_number),
      assigner:users!tasks_assigned_by_fkey(id, full_name, role)
    `)
    .in('assigned_to', menteeIds)
    .order('created_at', { ascending: false });

  if (tasksError) {
    // If foreign key naming alias issues occur, fallback to flat select
    const { data: fallbackTasks, error: fallbackError } = await adminClient
      .from('tasks')
      .select('*')
      .in('assigned_to', menteeIds)
      .order('created_at', { ascending: false });

    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: fallbackTasks || [], count: fallbackTasks?.length || 0 });
  }

  return NextResponse.json({ tasks: tasks || [], count: tasks?.length || 0 });
}
