import { NextRequest, NextResponse } from 'next/server';
import { executeDailySync } from '@/lib/syncEngine';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

async function handleCronSync(request: NextRequest) {
  // Verify authorization via CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronKeyHeader = request.headers.get('x-cron-secret') || request.headers.get('x-cron-key');
  const { searchParams } = new URL(request.url);
  const cronParam = searchParams.get('cron_secret') || searchParams.get('key');

  const expectedSecret = process.env.CRON_SECRET;
  const isAuthorized = Boolean(
    expectedSecret && (
      authHeader === `Bearer ${expectedSecret}` ||
      cronKeyHeader === expectedSecret ||
      cronParam === expectedSecret
    )
  );

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing CRON_SECRET' },
      { status: 401 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const result = await executeDailySync({
    supabaseClient: supabase,
    source: 'cron_endpoint',
  });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleCronSync(request);
}

export async function POST(request: NextRequest) {
  return handleCronSync(request);
}

