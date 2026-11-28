'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import ContestCard from '@/components/ContestCard';
import PlatformLogo from '@/components/PlatformLogo';
import { toast } from '@/components/Toast';
import type {
  ContestPlatform,
  ContestsApiResponse,
  PlatformFetchStatus,
  UpcomingContest,
  UserProfile,
} from '@/lib/types';
import {
  CONTEST_PLATFORMS,
  PLATFORM_HOME_URLS,
  PLATFORM_STYLES,
  formatCompactContestName,
  formatDateHeading,
  formatShortTime24InZone,
  getDateKeyInZone,
} from '@/lib/contestMeta';
import { stepDateString } from '@/lib/dateUtils';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  List,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarCell {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isInAllowedMonths: boolean;
  isToday: boolean;
  isSelected: boolean;
  contests: UpcomingContest[];
}

export default function ContestCalendarPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contests, setContests] = useState<UpcomingContest[]>([]);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformFetchStatus[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Controls
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [useIST, setUseIST] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | ContestPlatform>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Live clock for countdowns & active/upcoming transitions
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const todayKey = useMemo(() => getDateKeyInZone(new Date(nowMs), useIST), [nowMs, useIST]);
  const tomorrowKey = useMemo(() => stepDateString(todayKey, 1), [todayKey]);
  const weekEndKey = useMemo(() => stepDateString(todayKey, 7), [todayKey]);

  const [todayYear, todayMonthIndex] = useMemo(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return [y, (m || 1) - 1];
  }, [todayKey]);

  const minTotalMonths = todayYear * 12 + todayMonthIndex;
  const maxTotalMonths = minTotalMonths + 1;

  const maxAllowedDateKey = useMemo(() => {
    const nextY = todayMonthIndex === 11 ? todayYear + 1 : todayYear;
    const nextM = todayMonthIndex === 11 ? 0 : todayMonthIndex + 1;
    const lastDay = new Date(Date.UTC(nextY, nextM + 1, 0)).getUTCDate();
    return `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }, [todayYear, todayMonthIndex]);

  const [selectedDate, setSelectedDate] = useState<string>(() => getDateKeyInZone(new Date(), true));
  const [displayedYear, setDisplayedYear] = useState<number>(() => {
    const [y] = getDateKeyInZone(new Date(), true).split('-').map(Number);
    return y;
  });
  const [displayedMonth, setDisplayedMonth] = useState<number>(() => {
    const [, m] = getDateKeyInZone(new Date(), true).split('-').map(Number);
    return m - 1;
  });

  const displayedTotalMonths = displayedYear * 12 + displayedMonth;
  const isAtMinMonth = displayedTotalMonths <= minTotalMonths;
  const isAtMaxMonth = displayedTotalMonths >= maxTotalMonths;

  useEffect(() => {
    if (displayedTotalMonths < minTotalMonths) {
      setDisplayedYear(todayYear);
      setDisplayedMonth(todayMonthIndex);
    } else if (displayedTotalMonths > maxTotalMonths) {
      const nextY = todayMonthIndex === 11 ? todayYear + 1 : todayYear;
      const nextM = todayMonthIndex === 11 ? 0 : todayMonthIndex + 1;
      setDisplayedYear(nextY);
      setDisplayedMonth(nextM);
    }
  }, [displayedTotalMonths, minTotalMonths, maxTotalMonths, todayYear, todayMonthIndex]);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadContests = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      setFetchError(null);

      try {
        const res = await fetch(`/api/contests${forceRefresh ? '?refresh=true' : ''}`, {
          cache: 'no-store',
        });

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        const data: ContestsApiResponse & { error?: string } = await res.json().catch(() => ({
          contests: [],
          platformStatuses: [],
          fetchedAt: new Date().toISOString(),
          cached: false,
          error: 'Failed to parse server response',
        }));

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load upcoming contests');
        }

        setContests(Array.isArray(data.contests) ? data.contests : []);
        setPlatformStatuses(Array.isArray(data.platformStatuses) ? data.platformStatuses : []);
        setFetchedAt(data.fetchedAt || null);

        if (forceRefresh) {
          const failed = (data.platformStatuses || []).filter((s) => !s.ok);
          if (failed.length === 0) {
            toast.success(
              'Contests Updated',
              `Loaded ${data.contests?.length || 0} upcoming & live contests.`
            );
          } else {
            toast.warning(
              'Partial Refresh',
              `Updated with warnings for: ${failed.map((f) => f.platform).join(', ')}`
            );
          }
        }
      } catch (err: any) {
        const msg = err?.message || 'Could not load upcoming contests.';
        setFetchError(msg);
        if (forceRefresh) toast.error('Refresh Failed', msg);
      } finally {
        setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    let active = true;

    const init = async () => {
      const [authResult] = await Promise.all([
        supabase.auth.getUser(),
        loadContests(false),
      ]);

      if (!active) return;

      const user = authResult.data?.user;
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: userProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!active) return;
      if (!userProfile) {
        router.push('/login');
        return;
      }

      setProfile(userProfile);
      setLoading(false);
    };

    init();
    return () => {
      active = false;
    };
  }, [supabase, router, loadContests]);

  const handleToggleTimezone = () => {
    const nextUseIST = !useIST;
    const nextToday = getDateKeyInZone(new Date(nowMs), nextUseIST);
    setUseIST(nextUseIST);
    if (selectedDate === todayKey) {
      setSelectedDate(nextToday);
      const [y, m] = nextToday.split('-').map(Number);
      setDisplayedYear(y);
      setDisplayedMonth(m - 1);
    }
  };

  const activeContests = useMemo(() => {
    return contests
      .filter((c) => new Date(c.endTime).getTime() > nowMs)
      .map((c) => ({
        ...c,
        phase: (new Date(c.startTime).getTime() <= nowMs ? 'live' : 'upcoming') as 'live' | 'upcoming',
      }));
  }, [contests, nowMs]);

  const platformCounts = useMemo(() => {
    const counts: Record<'all' | ContestPlatform, number> = {
      all: activeContests.length,
      Codeforces: 0,
      AtCoder: 0,
      CodeChef: 0,
      LeetCode: 0,
    };
    activeContests.forEach((c) => {
      counts[c.platform] += 1;
    });
    return counts;
  }, [activeContests]);

  const summaryStats = useMemo(() => {
    let liveCount = 0;
    let weekCount = 0;

    activeContests.forEach((c) => {
      const dateKey = getDateKeyInZone(c.startTime, useIST);
      if (c.phase === 'live') liveCount += 1;
      if (dateKey <= weekEndKey) weekCount += 1;
    });

    return { liveCount, weekCount, totalCount: activeContests.length };
  }, [activeContests, useIST, weekEndKey]);

  const filteredContests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeContests.filter((c) => {
      if (selectedPlatform !== 'all' && c.platform !== selectedPlatform) return false;
      if (q) {
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPlatform = c.platform.toLowerCase().includes(q);
        const matchesRated = (c.ratedInfo || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPlatform && !matchesRated) return false;
      }
      return true;
    });
  }, [activeContests, selectedPlatform, searchQuery]);

  const liveContests = useMemo(
    () => filteredContests.filter((c) => c.phase === 'live'),
    [filteredContests]
  );

  const contestsByDate = useMemo(() => {
    const map = new Map<string, UpcomingContest[]>();
    filteredContests.forEach((c) => {
      const dateKey = getDateKeyInZone(c.startTime, useIST);
      if (!dateKey) return;
      const existing = map.get(dateKey) || [];
      existing.push(c);
      map.set(dateKey, existing);
    });
    return map;
  }, [filteredContests, useIST]);

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(displayedYear, displayedMonth, 1).getDay();
    const totalDaysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const prevMonthDays = new Date(displayedYear, displayedMonth, 0).getDate();

    const days: CalendarCell[] = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const m = displayedMonth === 0 ? 12 : displayedMonth;
      const y = displayedMonth === 0 ? displayedYear - 1 : displayedYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const cellTotal = y * 12 + (m - 1);
      const isInAllowedMonths = cellTotal >= minTotalMonths && cellTotal <= maxTotalMonths;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isInAllowedMonths,
        isToday: dateStr === todayKey,
        isSelected: dateStr === selectedDate,
        contests: isInAllowedMonths ? contestsByDate.get(dateStr) || [] : [],
      });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cellTotal = displayedYear * 12 + displayedMonth;
      const isInAllowedMonths = cellTotal >= minTotalMonths && cellTotal <= maxTotalMonths;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isInAllowedMonths,
        isToday: dateStr === todayKey,
        isSelected: dateStr === selectedDate,
        contests: contestsByDate.get(dateStr) || [],
      });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const m = displayedMonth === 11 ? 1 : displayedMonth + 2;
      const y = displayedMonth === 11 ? displayedYear + 1 : displayedYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const cellTotal = y * 12 + (m - 1);
      const isInAllowedMonths = cellTotal >= minTotalMonths && cellTotal <= maxTotalMonths;
      days.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: false,
        isInAllowedMonths,
        isToday: dateStr === todayKey,
        isSelected: dateStr === selectedDate,
        contests: isInAllowedMonths ? contestsByDate.get(dateStr) || [] : [],
      });
    }

    return days;
  }, [displayedYear, displayedMonth, minTotalMonths, maxTotalMonths, todayKey, selectedDate, contestsByDate]);

  const selectedDateContests = useMemo(
    () => contestsByDate.get(selectedDate) || [],
    [contestsByDate, selectedDate]
  );

  const nextAvailableContestDate = useMemo(() => {
    const keys = Array.from(contestsByDate.keys())
      .filter((k) => k >= todayKey && k <= maxAllowedDateKey)
      .sort();
    return keys[0] || null;
  }, [contestsByDate, todayKey, maxAllowedDateKey]);

  const groupedAgendaSections = useMemo(() => {
    const live: UpcomingContest[] = [];
    const todayList: UpcomingContest[] = [];
    const tomorrowList: UpcomingContest[] = [];
    const thisWeekList: UpcomingContest[] = [];
    const laterList: UpcomingContest[] = [];

    filteredContests.forEach((c) => {
      if (c.phase === 'live') {
        live.push(c);
        return;
      }
      const key = getDateKeyInZone(c.startTime, useIST);
      if (key === todayKey) todayList.push(c);
      else if (key === tomorrowKey) tomorrowList.push(c);
      else if (key <= weekEndKey) thisWeekList.push(c);
      else laterList.push(c);
    });

    return [
      { id: 'live', title: 'Live Now', items: live },
      { id: 'today', title: 'Today', items: todayList },
      { id: 'tomorrow', title: 'Tomorrow', items: tomorrowList },
      { id: 'week', title: 'Later This Week', items: thisWeekList },
      { id: 'later', title: 'Upcoming Later', items: laterList },
    ].filter((section) => section.items.length > 0);
  }, [filteredContests, useIST, todayKey, tomorrowKey, weekEndKey]);

  const selectDateAndSyncMonth = (dateStr: string) => {
    const [y, m] = dateStr.split('-').map(Number);
    if (!y || !m) return;
    const total = y * 12 + (m - 1);
    if (total < minTotalMonths || total > maxTotalMonths) return;
    setSelectedDate(dateStr);
    setDisplayedYear(y);
    setDisplayedMonth(m - 1);
  };

  const handlePrevMonth = () => {
    if (isAtMinMonth) return;
    setDisplayedMonth((prev) => {
      if (prev === 0) {
        setDisplayedYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    if (isAtMaxMonth) return;
    setDisplayedMonth((prev) => {
      if (prev === 11) {
        setDisplayedYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  const failedPlatforms = useMemo(
    () => platformStatuses.filter((s) => !s.ok),
    [platformStatuses]
  );

  const localTzName = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch {
      return 'Local';
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-950 transition-colors duration-150">
        <div className="h-16 border-b border-surface-200 dark:border-surface-800 bg-white/80 dark:bg-surface-900/80" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="w-52 h-7 skeleton" />
              <div className="w-72 h-4 skeleton" />
            </div>
            <div className="w-64 h-10 skeleton" />
          </div>
          <div className="h-12 skeleton" />
          <div className="h-[520px] skeleton" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 pb-16 transition-colors duration-150">
      <Navbar fullName={profile?.full_name || ''} role={(profile?.role || 'user') as any} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-5">
        {/* ─── HEADER ─────────────────────────────────────────────────────── */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-surface-900 dark:text-surface-100 tracking-tight">
                Contest Calendar
              </h1>
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {summaryStats.liveCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {summaryStats.liveCount} Live
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full bg-surface-200/70 dark:bg-surface-800 text-surface-700 dark:text-surface-300 tabular-nums">
                  {summaryStats.weekCount} this week
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-200/70 dark:bg-surface-800 text-surface-600 dark:text-surface-400 tabular-nums">
                  {summaryStats.totalCount} total
                </span>
              </div>
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              Track upcoming rounds across Codeforces, AtCoder, CodeChef, and LeetCode. Click any contest to open it directly.
            </p>
          </div>

          {/* View + Timezone + Refresh Controls */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="inline-flex items-center p-1 rounded-xl bg-surface-100 dark:bg-surface-850 border border-surface-200 dark:border-surface-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white dark:bg-surface-800 text-brand-600 dark:text-brand-300 shadow-sm border border-surface-200/80 dark:border-surface-700'
                    : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-surface-800 text-brand-600 dark:text-brand-300 shadow-sm border border-surface-200/80 dark:border-surface-700'
                    : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleTimezone}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-850 hover:border-surface-300 dark:hover:border-surface-700 transition-colors"
              title={`Showing ${useIST ? 'IST (Asia/Kolkata)' : localTzName}. Click to switch.`}
            >
              <Globe className="w-3.5 h-3.5 text-surface-400" />
              <span>{useIST ? 'IST' : localTzName}</span>
            </button>

            <button
              type="button"
              onClick={() => loadContests(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-850 hover:border-surface-300 dark:hover:border-surface-700 transition-colors disabled:opacity-50"
              title="Refresh contests"
              aria-label="Refresh contests"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-500' : ''}`} />
            </button>
          </div>
        </header>

        {/* ─── UNIFIED PLATFORM FILTER & SEARCH BAR ───────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Platform Filter Pills with Official Logos */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedPlatform('all')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                selectedPlatform === 'all'
                  ? 'bg-brand-50 text-brand-700 border-brand-300 ring-1 ring-brand-500/20 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-700'
                  : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-300 border-surface-200/90 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'
              }`}
            >
              <span>All</span>
              <span className="opacity-70 tabular-nums">{platformCounts.all}</span>
            </button>

            {CONTEST_PLATFORMS.map((platform) => {
              const isSelected = selectedPlatform === platform;
              const status = platformStatuses.find((s) => s.platform === platform);

              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setSelectedPlatform(isSelected ? 'all' : platform)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? 'bg-brand-50 text-brand-700 border-brand-300 ring-1 ring-brand-500/20 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-700'
                      : 'bg-white dark:bg-surface-900 text-surface-700 dark:text-surface-200 border-surface-200/90 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'
                  }`}
                >
                  <PlatformLogo platform={platform} framed className="w-5 h-5" />
                  <span>{platform}</span>
                  <span className="opacity-70 tabular-nums">{platformCounts[platform]}</span>
                  {status && !status.ok && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-500"
                      title={status.error || 'Sync warning'}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contests…"
              className="w-full pl-8 pr-8 py-1.5 rounded-xl text-xs bg-white dark:bg-surface-900 border border-surface-200/90 dark:border-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sync Warning */}
        {(fetchError || failedPlatforms.length > 0) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200/80 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {fetchError
                  ? fetchError
                  : `Could not refresh ${failedPlatforms
                      .map((f) => `${f.platform}${f.stale ? ' (showing cached)' : ''}`)
                      .join(', ')}.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => loadContests(true)}
              disabled={refreshing}
              className="font-semibold underline hover:no-underline self-end sm:self-center shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live Contests Spotlight (only when any are running) */}
        {liveContests.length > 0 && viewMode === 'calendar' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {liveContests.map((contest) => (
              <ContestCard
                key={contest.id}
                contest={contest}
                useIST={useIST}
                nowMs={nowMs}
                variant="live"
              />
            ))}
          </section>
        )}

        {/* ─── MAIN VIEW: CALENDAR OR LIST ────────────────────────────────── */}
        {viewMode === 'calendar' ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Hairline Calendar Grid */}
            <div className="xl:col-span-8 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm overflow-hidden">
              {/* Month Toolbar */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-surface-200 dark:border-surface-800">
                <div className="flex items-center gap-3">
                  <h2 className="text-base sm:text-lg font-bold text-surface-900 dark:text-surface-100">
                    {MONTH_NAMES[displayedMonth]} {displayedYear}
                  </h2>
                  <button
                    type="button"
                    onClick={() => selectDateAndSyncMonth(todayKey)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200 transition-colors"
                  >
                    Today
                  </button>
                  {nextAvailableContestDate && (
                    <button
                      type="button"
                      onClick={() => selectDateAndSyncMonth(nextAvailableContestDate)}
                      className="hidden sm:inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50 transition-colors"
                    >
                      Next contest →
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    disabled={isAtMinMonth}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isAtMinMonth
                        ? 'opacity-30 cursor-not-allowed text-surface-400 dark:text-surface-600'
                        : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300'
                    }`}
                    title={isAtMinMonth ? 'Past months are disabled' : 'Previous month'}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    disabled={isAtMaxMonth}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isAtMaxMonth
                        ? 'opacity-30 cursor-not-allowed text-surface-400 dark:text-surface-600'
                        : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300'
                    }`}
                    title={isAtMaxMonth ? 'Only current and next month are active' : 'Next month'}
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 bg-surface-50 dark:bg-surface-850 border-b border-surface-200 dark:border-surface-800 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
                {WEEKDAY_NAMES.map((day) => (
                  <div key={day} className="py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* 1px Hairline Cell Grid (cells must be 100% opaque so grid borders don't bleed through) */}
              <div className="grid grid-cols-7 gap-px bg-surface-200 dark:bg-surface-800">
                {calendarDays.map((day) => {
                  const hasContests = day.contests.length > 0;
                  const visibleContests = day.contests.slice(0, 3);
                  const hiddenCount = day.contests.length - visibleContests.length;

                  return (
                    <div
                      key={day.dateStr}
                      role={day.isInAllowedMonths ? 'button' : undefined}
                      tabIndex={day.isInAllowedMonths ? 0 : -1}
                      aria-disabled={!day.isInAllowedMonths}
                      onClick={() => {
                        if (day.isInAllowedMonths) {
                          selectDateAndSyncMonth(day.dateStr);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (day.isInAllowedMonths && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          selectDateAndSyncMonth(day.dateStr);
                        }
                      }}
                      className={`min-h-[76px] sm:min-h-[112px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors select-none ${
                        !day.isInAllowedMonths
                          ? 'bg-[#f8f9fc] dark:bg-[#0d0f18] cursor-not-allowed'
                          : day.isSelected
                          ? 'bg-[#eef2ff] dark:bg-[#191e36] ring-2 ring-inset ring-brand-500 dark:ring-brand-400 cursor-pointer'
                          : day.isCurrentMonth
                          ? 'bg-white dark:bg-surface-900 hover:bg-surface-50 dark:hover:bg-surface-850 cursor-pointer'
                          : 'bg-[#f8f9fc] dark:bg-[#0d0f18] hover:bg-surface-100 dark:hover:bg-surface-900 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums ${
                            !day.isInAllowedMonths
                              ? 'text-surface-300 dark:text-surface-700'
                              : day.isToday
                              ? 'bg-brand-600 text-white font-bold shadow-sm'
                              : day.isSelected
                              ? 'text-brand-700 dark:text-brand-300 font-bold'
                              : day.isCurrentMonth
                              ? 'text-surface-800 dark:text-surface-100'
                              : 'text-surface-400 dark:text-surface-600'
                          }`}
                        >
                          {day.dayNum}
                        </span>
                        {hasContests && (
                          <span className="text-[10px] font-medium text-surface-400 dark:text-surface-500 sm:hidden tabular-nums">
                            {day.contests.length}
                          </span>
                        )}
                      </div>

                      {/* Desktop/Tablet: Sleek Event Chips with Official Platform Logo */}
                      <div className="hidden sm:flex flex-col gap-1 mt-1.5">
                        {visibleContests.map((contest) => {
                          const style = PLATFORM_STYLES[contest.platform];
                          const timeStr = formatShortTime24InZone(contest.startTime, useIST);
                          const shortTitle = formatCompactContestName(contest);
                          return (
                            <a
                              key={contest.id}
                              href={contest.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`${contest.platform}: ${contest.name} (${timeStr})`}
                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors truncate ${style.calendarChip}`}
                            >
                              <PlatformLogo platform={contest.platform} framed className="w-4 h-4 rounded-[4px] p-[1px]" />
                              <span className="tabular-nums opacity-75 text-[10px] shrink-0">
                                {timeStr}
                              </span>
                              <span className="truncate">{shortTitle}</span>
                            </a>
                          );
                        })}
                        {hiddenCount > 0 && (
                          <span className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 px-1">
                            +{hiddenCount} more
                          </span>
                        )}
                      </div>

                      {/* Mobile: Clean Platform Dots */}
                      {hasContests && (
                        <div className="flex sm:hidden flex-wrap items-center gap-1 mt-2">
                          {day.contests.slice(0, 4).map((contest) => (
                            <span
                              key={contest.id}
                              className={`w-1.5 h-1.5 rounded-full ${PLATFORM_STYLES[contest.platform].dot}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Inspector */}
            <aside className="xl:col-span-4 xl:sticky xl:top-24 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-surface-200 dark:border-surface-800">
                <div>
                  <h3 className="text-base font-bold text-surface-900 dark:text-surface-100">
                    {formatDateHeading(selectedDate)}
                  </h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                    {selectedDate === todayKey
                      ? 'Today'
                      : selectedDate === tomorrowKey
                      ? 'Tomorrow'
                      : selectedDate < todayKey
                      ? 'Past date'
                      : 'Upcoming'}{' '}
                    · {selectedDateContests.length}{' '}
                    {selectedDateContests.length === 1 ? 'contest' : 'contests'}
                  </p>
                </div>
              </div>

              {selectedDateContests.length > 0 ? (
                <div className="space-y-2.5">
                  {selectedDateContests.map((contest) => (
                    <ContestCard
                      key={contest.id}
                      contest={contest}
                      useIST={useIST}
                      nowMs={nowMs}
                      variant="compact"
                    />
                  ))}
                </div>
              ) : (
                <div className="py-10 px-4 rounded-xl bg-surface-50 dark:bg-surface-850 border border-dashed border-surface-200 dark:border-surface-700 text-center space-y-3">
                  <CalendarIcon className="w-7 h-7 mx-auto text-surface-300 dark:text-surface-600" />
                  <div>
                    <p className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                      No contests scheduled
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                      {selectedPlatform !== 'all' || searchQuery
                        ? 'Try clearing your active filter.'
                        : 'Select a day with events or jump ahead.'}
                    </p>
                  </div>
                  {nextAvailableContestDate && nextAvailableContestDate !== selectedDate && (
                    <button
                      type="button"
                      onClick={() => selectDateAndSyncMonth(nextAvailableContestDate)}
                      className="btn-secondary py-1.5 px-3 text-xs"
                    >
                      Jump to next contest
                    </button>
                  )}
                </div>
              )}

              {/* Direct Platform Directory Links */}
              <div className="pt-3 border-t border-surface-100 dark:border-surface-800 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
                  Official Platforms
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CONTEST_PLATFORMS.map((platform) => (
                    <a
                      key={platform}
                      href={PLATFORM_HOME_URLS[platform]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium bg-surface-50 dark:bg-surface-850 hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-800 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <PlatformLogo platform={platform} framed className="w-6 h-6" />
                        <span className="truncate">{platform}</span>
                      </span>
                      <ExternalLink className="w-3 h-3 text-surface-400 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* ─── LIST / AGENDA VIEW ─────────────────────────────────────────── */
          <div className="space-y-6">
            {groupedAgendaSections.length > 0 ? (
              groupedAgendaSections.map((section) => (
                <section key={section.id} className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <h2
                      className={`text-xs font-bold uppercase tracking-wider ${
                        section.id === 'live'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-surface-500 dark:text-surface-400'
                      }`}
                    >
                      {section.title}
                    </h2>
                    <span className="text-xs font-semibold text-surface-400 dark:text-surface-500 tabular-nums">
                      {section.items.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((contest) => (
                      <ContestCard
                        key={contest.id}
                        contest={contest}
                        useIST={useIST}
                        nowMs={nowMs}
                        variant={section.id === 'live' ? 'live' : 'default'}
                      />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200/90 dark:border-surface-800 p-12 text-center space-y-3">
                <CalendarDays className="w-9 h-9 mx-auto text-surface-300 dark:text-surface-600" />
                <div>
                  <h3 className="text-base font-bold text-surface-900 dark:text-surface-100">
                    No matching upcoming contests
                  </h3>
                  <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    {selectedPlatform !== 'all' || searchQuery
                      ? 'Try clearing your active platform or search filter.'
                      : 'No upcoming contests were found right now.'}
                  </p>
                </div>
                {(selectedPlatform !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlatform('all');
                      setSearchQuery('');
                    }}
                    className="btn-secondary py-2 px-4 text-xs"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer Sync Metadata */}
        {fetchedAt && (
          <p className="text-center text-xs text-surface-400 dark:text-surface-500">
            Synced {new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Official contest links for Codeforces, AtCoder, CodeChef, and LeetCode
          </p>
        )}
      </main>
    </div>
  );
}
