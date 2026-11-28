import type { ContestPlatform, UpcomingContest } from '@/lib/types';

export const CONTEST_PLATFORMS: ContestPlatform[] = [
  'Codeforces',
  'AtCoder',
  'CodeChef',
  'LeetCode',
];

export const PLATFORM_HOME_URLS: Record<ContestPlatform, string> = {
  Codeforces: 'https://codeforces.com/contests',
  AtCoder: 'https://atcoder.jp/contests/',
  CodeChef: 'https://www.codechef.com/contests',
  LeetCode: 'https://leetcode.com/contest/',
};

export interface PlatformStyleMeta {
  short: string;
  dot: string;
  calendarChip: string;
}

export const PLATFORM_STYLES: Record<ContestPlatform, PlatformStyleMeta> = {
  Codeforces: {
    short: 'CF',
    dot: 'bg-[#1F8ACB]',
    calendarChip:
      'border-l-2 border-l-[#1F8ACB] bg-sky-50 text-surface-800 hover:bg-sky-100 dark:bg-sky-950/65 dark:text-sky-100 dark:hover:bg-sky-900/75',
  },
  AtCoder: {
    short: 'AC',
    dot: 'bg-slate-700 dark:bg-slate-300',
    calendarChip:
      'border-l-2 border-l-slate-700 dark:border-l-slate-300 bg-surface-100 text-surface-800 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700',
  },
  CodeChef: {
    short: 'CC',
    dot: 'bg-[#8B5E3C] dark:bg-[#E69F5C]',
    calendarChip:
      'border-l-2 border-l-[#8B5E3C] dark:border-l-[#E69F5C] bg-orange-50 text-surface-800 hover:bg-orange-100 dark:bg-orange-950/60 dark:text-orange-100 dark:hover:bg-orange-900/70',
  },
  LeetCode: {
    short: 'LC',
    dot: 'bg-[#FFA116]',
    calendarChip:
      'border-l-2 border-l-[#FFA116] bg-amber-50 text-surface-800 hover:bg-amber-100 dark:bg-amber-950/55 dark:text-amber-100 dark:hover:bg-amber-900/70',
  },
};

export function getTimeZoneOption(useIST: boolean): string | undefined {
  return useIST ? 'Asia/Kolkata' : undefined;
}

export function getDateKeyInZone(input: string | Date, useIST: boolean): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getTimeZoneOption(useIST),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatTimeInZone(iso: string, useIST: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getTimeZoneOption(useIST),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatShortTime24InZone(iso: string, useIST: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: getTimeZoneOption(useIST),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateHeading(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const utcDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate);
}

export function formatShortDateInZone(iso: string, useIST: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getTimeZoneOption(useIST),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const totalMinutes = Math.round(seconds / 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
}

export function formatCountdown(targetIso: string, nowMs: number): string {
  const diffMs = new Date(targetIso).getTime() - nowMs;
  if (Number.isNaN(diffMs)) return '';
  if (diffMs <= 0) return 'Now';

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function formatCompactContestName(contest: UpcomingContest): string {
  let name = contest.name.trim();
  if (contest.platform === 'Codeforces') {
    name = name.replace(/^Codeforces\s+/i, '');
  } else if (contest.platform === 'AtCoder') {
    name = name
      .replace(/^AtCoder Beginner Contest\s+/i, 'ABC ')
      .replace(/^AtCoder Regular Contest\s+/i, 'ARC ')
      .replace(/^AtCoder Grand Contest\s+/i, 'AGC ')
      .replace(/^AtCoder Heuristic Contest\s+/i, 'AHC ');
  } else if (contest.platform === 'LeetCode') {
    name = name
      .replace(/^Biweekly Contest\s+/i, 'Biweekly ')
      .replace(/^Weekly Contest\s+/i, 'Weekly ');
  }
  return name;
}

export function buildGoogleCalendarUrl(contest: UpcomingContest): string {
  const formatGCalDate = (iso: string) =>
    iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[${contest.platform}] ${contest.name}`,
    dates: `${formatGCalDate(contest.startTime)}/${formatGCalDate(contest.endTime)}`,
    details: `Platform: ${contest.platform}\nContest Link: ${contest.url}`,
    location: contest.url,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
