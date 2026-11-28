'use client';

import PlatformBadge from '@/components/PlatformBadge';
import type { UpcomingContest } from '@/lib/types';
import {
  buildGoogleCalendarUrl,
  formatCountdown,
  formatDuration,
  formatShortDateInZone,
  formatTimeInZone,
} from '@/lib/contestMeta';
import { CalendarPlus, ExternalLink } from 'lucide-react';

interface ContestCardProps {
  contest: UpcomingContest;
  useIST: boolean;
  nowMs: number;
  variant?: 'default' | 'compact' | 'live';
}

export default function ContestCard({
  contest,
  useIST,
  nowMs,
  variant = 'default',
}: ContestCardProps) {
  const startMs = new Date(contest.startTime).getTime();
  const endMs = new Date(contest.endTime).getTime();
  const isLive = startMs <= nowMs && endMs > nowMs;

  const startDateLabel = formatShortDateInZone(contest.startTime, useIST);
  const startTimeLabel = formatTimeInZone(contest.startTime, useIST);
  const endTimeLabel = formatTimeInZone(contest.endTime, useIST);
  const durationLabel = formatDuration(contest.durationSeconds);
  const countdownLabel = isLive
    ? `${formatCountdown(contest.endTime, nowMs)} left`
    : `in ${formatCountdown(contest.startTime, nowMs)}`;

  const tzSuffix = useIST ? 'IST' : 'Local';
  const isCompact = variant === 'compact';

  return (
    <div
      className={`group rounded-2xl border transition-all duration-200 ${
        isLive || variant === 'live'
          ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/80 hover:border-emerald-300 dark:hover:border-emerald-700'
          : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700 hover:shadow-md'
      } ${isCompact ? 'p-3.5' : 'px-4 py-3.5 sm:px-5 sm:py-4'}`}
    >
      <div
        className={`flex ${
          isCompact ? 'flex-col gap-3' : 'flex-col sm:flex-row sm:items-center justify-between gap-3.5'
        }`}
      >
        {/* Left: Official Logo + Details */}
        <div className="flex items-start gap-3.5 min-w-0">
          <PlatformBadge platform={contest.platform} size={isCompact ? 'sm' : 'md'} className="mt-0.5" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-surface-500 dark:text-surface-400">
                {contest.platform}
              </span>
              {contest.ratedInfo && (
                <>
                  <span className="text-surface-300 dark:text-surface-700">·</span>
                  <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400">
                    {contest.ratedInfo}
                  </span>
                </>
              )}
              {isLive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>

            <a
              href={contest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-sm sm:text-[15px] text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors leading-snug group/link"
            >
              <span className="break-words">{contest.name}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover/link:opacity-80 transition-opacity" />
            </a>

            <p className="mt-1 text-xs text-surface-500 dark:text-surface-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>{startDateLabel}</span>
              <span>·</span>
              <span className="text-surface-700 dark:text-surface-300 font-medium tabular-nums">
                {startTimeLabel} – {endTimeLabel} {tzSuffix}
              </span>
              <span>·</span>
              <span>{durationLabel}</span>
            </p>
          </div>
        </div>

        {/* Right: Countdown + Actions */}
        <div
          className={`flex items-center ${
            isCompact ? 'justify-between pt-2 border-t border-surface-100 dark:border-surface-800/80' : 'justify-between sm:justify-end gap-2.5 shrink-0'
          }`}
        >
          <span
            className={`text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full border ${
              isLive
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-surface-100 text-surface-700 border-surface-200/80 dark:bg-surface-800 dark:text-surface-200 dark:border-surface-700'
            }`}
          >
            {countdownLabel}
          </span>

          <div className="flex items-center gap-1.5">
            <a
              href={buildGoogleCalendarUrl(contest)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              title="Add to Google Calendar"
              aria-label={`Add ${contest.name} to Google Calendar`}
            >
              <CalendarPlus className="w-4 h-4" />
            </a>

            <a
              href={contest.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 ${
                isLive
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-surface-900 hover:bg-brand-600 text-white dark:bg-brand-600 dark:hover:bg-brand-500 dark:text-white'
              }`}
            >
              <span>{isLive ? 'Enter' : 'Open'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
