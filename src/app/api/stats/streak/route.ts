import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { recalculateUserStreak } from '@/lib/syncEngine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
          } catch {}
        },
      },
    }
  );
}

/**
 * POST /api/stats/streak
 * Immediately recalculates the authenticated student's IST streak in user_stats
 * after manual task completion toggles (e.g. CSES or YouTube self-checks).
 */
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminClient = createAdminSupabaseClient();
    const streak = await recalculateUserStreak(adminClient, user.id);
    return NextResponse.json(
      { success: true, streak },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to recalculate streak' },
      { status: 500 }
    );
  }
}
