import { getMsUntilNextMidnightIST, getTodayIST } from '@/lib/dateUtils';
import { executeDailySync } from '@/lib/syncEngine';

declare global {
  // eslint-disable-next-line no-var
  var __ocdSchedulerInitialized: boolean | undefined;
  // eslint-disable-next-line no-var
  var __ocdSchedulerTimer: NodeJS.Timeout | undefined;
}

/**
 * In-process background scheduler for daily sync at 00:00 AM IST.
 * Ensures the sync runs automatically even when self-hosted or run locally
 * without requiring external webhooks or third-party cron services.
 */
export function initAutoRefreshScheduler() {
  if (globalThis.__ocdSchedulerInitialized) {
    return;
  }

  globalThis.__ocdSchedulerInitialized = true;

  function scheduleNextRun() {
    const msUntilMidnight = getMsUntilNextMidnightIST();
    const hours = (msUntilMidnight / (1000 * 60 * 60)).toFixed(2);
    console.log(
      `[AutoRefresh] In-process scheduler active. Next daily sync scheduled at 00:00 AM IST (in ${hours} hours, current IST date: ${getTodayIST()}).`
    );

    if (globalThis.__ocdSchedulerTimer) {
      clearTimeout(globalThis.__ocdSchedulerTimer);
    }

    globalThis.__ocdSchedulerTimer = setTimeout(async () => {
      try {
        console.log('[AutoRefresh] Midnight IST reached (00:00 AM IST). Executing automatic daily sync...');
        await executeDailySync({ source: 'auto_scheduler' });
      } catch (err) {
        console.error('[AutoRefresh] Error during automatic daily sync:', err);
      } finally {
        // Schedule next midnight run
        scheduleNextRun();
      }
    }, msUntilMidnight);
  }

  scheduleNextRun();
}

