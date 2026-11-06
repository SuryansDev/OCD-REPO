import { getMsUntilNextMidnightIST, getTodayIST } from './dateUtils';
import { executeDailySync, rollOutScheduledTasks, triggerDailySyncIfFirstVisitToday } from './syncEngine';
import { createAdminSupabaseClient } from './supabase/admin';

declare global {
  // eslint-disable-next-line no-var
  var __ocdSchedulerInitialized: boolean | undefined;
  // eslint-disable-next-line no-var
  var __ocdSchedulerTimer: NodeJS.Timeout | undefined;
}

/**
 * In-process background scheduler for daily sync at 4:00 AM IST.
 * Ensures the sync runs automatically even when self-hosted or run locally
 * without requiring external webhooks or third-party cron services.
 */
export function initAutoRefreshScheduler() {
  if (globalThis.__ocdSchedulerInitialized) {
    return;
  }

  globalThis.__ocdSchedulerInitialized = true;

  // Immediately roll out any scheduled tasks that became due while the server was offline
  try {
    const adminClient = createAdminSupabaseClient();
    rollOutScheduledTasks(adminClient)
      .then((res) => {
        if (res.rolledOutCount > 0) {
          console.log(
            `[AutoRefresh] Startup catch-up: Rolled out ${res.rolledOutCount} scheduled task(s) (${res.totalTasksCreated} mentee tasks assigned).`
          );
        }
      })
      .catch((err) => {
        console.error('[AutoRefresh] Startup catch-up rollout error:', err);
      });

    triggerDailySyncIfFirstVisitToday(adminClient).catch((err) => {
      console.error('[AutoRefresh] Startup daily sync check error:', err);
    });
  } catch (err) {
    console.error('[AutoRefresh] Could not initialize startup catch-up client:', err);
  }

  function scheduleNextRun() {
    const msUntilSync = getMsUntilNextMidnightIST();
    const hours = (msUntilSync / (1000 * 60 * 60)).toFixed(2);
    console.log(
      `[AutoRefresh] In-process scheduler active. Next daily sync scheduled at 4:00 AM IST (in ${hours} hours, current IST date: ${getTodayIST()}).`
    );

    if (globalThis.__ocdSchedulerTimer) {
      clearTimeout(globalThis.__ocdSchedulerTimer);
    }

    globalThis.__ocdSchedulerTimer = setTimeout(async () => {
      try {
        console.log('[AutoRefresh] 4:00 AM IST reached. Executing automatic daily sync...');
        await executeDailySync({ source: 'auto_scheduler' });
      } catch (err) {
        console.error('[AutoRefresh] Error during automatic daily sync:', err);
      } finally {
        // Schedule next daily run
        scheduleNextRun();
      }
    }, msUntilSync);
  }

  scheduleNextRun();
}

