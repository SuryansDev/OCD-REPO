import { NextRequest, NextResponse } from 'next/server';
import { executeDailySync } from '@/lib/syncEngine';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

async function handleCronSync(request: NextRequest) {
  // Verify authorization via CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronKeyHeader = request.headers.get('x-cron-secret') || request.headers.get('x-cron-key');
  const { searchParams } = new URL(request.url);
  const cronParam = searchParams.get('cron_secret') || searchParams.get('key');

  const expectedSecret = process.env.CRON_SECRET;
  const isAuthorized = Boolean(
    expectedSecret &&
      (authHeader === `Bearer ${expectedSecret}` ||
        cronKeyHeader === expectedSecret ||
        cronParam === expectedSecret)
  );

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing CRON_SECRET' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const force = searchParams.get('force') === 'true';
    const budgetParam = parseInt(searchParams.get('budget') || '', 10);
    // Stay cleanly below Vercel cron/serverless timeout ceilings (~48s default) while guaranteeing
    // 100% completion of task rollouts, IST streaks (<1s), and stale-first LC/CF platform updates.
    const maxExecutionMs =
      Number.isFinite(budgetParam) && budgetParam >= 10_000 && budgetParam <= 240_000
        ? budgetParam
        : 48_000;

    const supabase = createAdminSupabaseClient();
    const result = await executeDailySync({
      supabaseClient: supabase,
      source: 'cron_endpoint',
      maxExecutionMs,
      skipFreshHours: force ? 0 : 6,
      force,
    });

    return NextResponse.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err: any) {
    console.error('[CronSync] Unhandled error during cron sync:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal cron sync error',
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCronSync(request);
}

export async function POST(request: NextRequest) {
  return handleCronSync(request);
}
