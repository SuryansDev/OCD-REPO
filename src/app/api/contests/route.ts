import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getUpcomingContests } from '@/lib/contests';

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
          } catch {
            // Cookie writes may be disallowed in certain contexts
          }
        },
      },
    }
  );
}

// GET /api/contests — fetch upcoming & live contests from Codeforces, AtCoder, CodeChef, and LeetCode
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const data = await getUpcomingContests(forceRefresh);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch upcoming contests' },
      { status: 500 }
    );
  }
}
