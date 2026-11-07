export async function register() {
  // Never run background scheduler during build phase or in serverless environments (Vercel)
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.VERCEL) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initAutoRefreshScheduler } = await import('@/lib/autoRefreshScheduler');
      initAutoRefreshScheduler();
    } catch (err) {
      console.warn('[Instrumentation] Could not initialize scheduler:', err);
    }
  }
}

