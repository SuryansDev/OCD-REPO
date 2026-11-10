import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cleanCodeforcesHandle, cleanLeetCodeHandle } from '@/lib/handles';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { syncSingleUserStats } from '@/lib/syncEngine';

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

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const targetUserId = body.userId || user.id;

    // Check permission: editing own profile OR admin
    const { data: callerProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = callerProfile?.role === 'admin';
    if (targetUserId !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required to alter other users' }, { status: 403 });
    }

    const cleanedLc = cleanLeetCodeHandle(body.lc_handle) || null;
    const cleanedCf = cleanCodeforcesHandle(body.cf_handle) || null;
    const cleanedContact = body.contact_number !== undefined
      ? (String(body.contact_number).trim() || null)
      : undefined;

    const adminClient = createAdminSupabaseClient();

    const updatePayload: Record<string, any> = {
      lc_handle: cleanedLc,
      cf_handle: cleanedCf,
    };
    if (cleanedContact !== undefined) {
      updatePayload.contact_number = cleanedContact;
    }

    const { data: updatedUser, error: updateError } = await adminClient
      .from('users')
      .update(updatePayload)
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError || !updatedUser) {
      return NextResponse.json({ error: updateError?.message || 'Failed to update user profile' }, { status: 500 });
    }

    // Immediately trigger on-demand sync for this user to refresh ratings and solved counts
    let syncResult = null;
    try {
      syncResult = await syncSingleUserStats(adminClient, targetUserId);
    } catch (syncErr: any) {
      console.error(`[Profile API] Error syncing user stats for ${targetUserId}:`, syncErr);
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      sync: syncResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
