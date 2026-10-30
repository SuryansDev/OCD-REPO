/**
 * Utility functions for handling IST (Indian Standard Time, UTC+5:30) dates and midnight scheduling.
 */

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata (IST).
 */
export function getTodayIST(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Returns date formatted as YYYY-MM-DD in Asia/Kolkata (IST) offset by `days` from today.
 */
export function getDateOffsetIST(days: number): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(new Date());
  const y = parseInt(parts.find((p) => p.type === 'year')!.value);
  const m = parseInt(parts.find((p) => p.type === 'month')!.value) - 1;
  const d = parseInt(parts.find((p) => p.type === 'day')!.value);

  const target = new Date(Date.UTC(y, m, d + days));
  const tY = target.getUTCFullYear();
  const tM = String(target.getUTCMonth() + 1).padStart(2, '0');
  const tD = String(target.getUTCDate()).padStart(2, '0');
  return `${tY}-${tM}-${tD}`;
}

/**
 * Formats a YYYY-MM-DD date into a friendly label for mentors (e.g. "Today", "Tomorrow (Sat, Oct 31)", "Mon, Nov 2", etc.).
 */
export function formatScheduledDateLabel(dateStr: string, todayStr?: string): string {
  const today = todayStr || getTodayIST();
  if (dateStr === today) return 'Today';

  const tomorrow = getDateOffsetIST(1);
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();

  if (dateStr === tomorrow) {
    return `Tomorrow (${weekday}, ${month} ${day})`;
  }
  return `${weekday}, ${month} ${day}`;
}

/**
 * Calculates milliseconds remaining until the next 00:00:00 AM IST.
 */
export function getMsUntilNextMidnightIST(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  const y = parseInt(parts.year, 10);
  const m = parseInt(parts.month, 10) - 1;
  const d = parseInt(parts.day, 10);

  // Next midnight IST is (y, m, d + 1, 0, 0, 0) in IST.
  // IST offset is UTC+5:30 = 19,800,000 ms
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nextMidnightIstUtcMs = Date.UTC(y, m, d + 1, 0, 0, 0) - IST_OFFSET_MS;
  const msUntil = nextMidnightIstUtcMs - now.getTime();
  return msUntil > 0 ? msUntil : 1000;
}

