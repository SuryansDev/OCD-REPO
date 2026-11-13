'use client';

import React, { useState, useMemo } from 'react';
import type { ScheduledTask, Task, UserProfile, Platform } from '@/lib/types';
import { formatProblemTitle, getTaskLink, extractTargetYear } from '@/lib/taskParser';
import { formatScheduledDateLabel, getTodayIST, getDateOffsetIST } from '@/lib/dateUtils';
import PlatformBadge from '@/components/PlatformBadge';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, 
  ExternalLink, Loader2, Sparkles, PlusCircle, Filter, List, 
  Maximize2, Minimize2, CheckCircle2, Clock, AlertCircle, Info
} from 'lucide-react';

interface ScheduleCalendarProps {
  todayIST: string;
  maxScheduleDateIST: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  scheduledTasks: ScheduledTask[];
  allCohortTasks?: Task[];
  allUsers?: UserProfile[];
  onDeleteScheduledTask?: (id: number) => Promise<void> | void;
  deletingScheduledId?: number | null;
  isCommonMentorOrAdmin?: boolean;
  currentUserId?: string;
  onQuickScheduleFocus?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleCalendar({
  todayIST,
  maxScheduleDateIST,
  selectedDate,
  onSelectDate,
  scheduledTasks,
  allCohortTasks = [],
  allUsers = [],
  onDeleteScheduledTask,
  deletingScheduledId,
  isCommonMentorOrAdmin = false,
  currentUserId,
  onQuickScheduleFocus,
}: ScheduleCalendarProps) {
  // Calendar view mode: 'calendar' vs 'queue' (list)
  const [viewMode, setViewMode] = useState<'calendar' | 'queue'>('calendar');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedYearFilter, setSelectedYearFilter] = useState<'all' | '1' | '2' | '3' | '4' | 'cohort'>('all');
  const [queueSearch, setQueueSearch] = useState('');

  // Initial displayed month and year based on selectedDate or todayIST
  const initialDate = selectedDate || todayIST || getTodayIST();
  const [initY, initM] = initialDate.split('-').map(Number);

  const [displayedYear, setDisplayedYear] = useState<number>(initY || new Date().getFullYear());
  const [displayedMonth, setDisplayedMonth] = useState<number>((initM ? initM - 1 : new Date().getMonth()));

  // Active / pending scheduled tasks
  const pendingScheduledTasks = useMemo(() => {
    return scheduledTasks.filter((t) => t.status === 'pending');
  }, [scheduledTasks]);

  // Audience metadata helper
  const getAudienceMeta = (targetYear: string | null | undefined, taskMentorId?: string, mentorName?: string) => {
    if (targetYear === '1') {
      return {
        label: 'Year 1',
        short: 'Y1',
        key: '1',
        bgLight: 'bg-blue-50 dark:bg-blue-950/70',
        text: 'text-blue-700 dark:text-blue-300',
        border: 'border-blue-200 dark:border-blue-800',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        dot: 'bg-blue-500',
      };
    }
    if (targetYear === '2') {
      return {
        label: 'Year 2',
        short: 'Y2',
        key: '2',
        bgLight: 'bg-purple-50 dark:bg-purple-950/70',
        text: 'text-purple-700 dark:text-purple-300',
        border: 'border-purple-200 dark:border-purple-800',
        badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        dot: 'bg-purple-500',
      };
    }
    if (targetYear === '3') {
      return {
        label: 'Year 3',
        short: 'Y3',
        key: '3',
        bgLight: 'bg-emerald-50 dark:bg-emerald-950/70',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        dot: 'bg-emerald-500',
      };
    }
    if (targetYear === '4') {
      return {
        label: 'Year 4',
        short: 'Y4',
        key: '4',
        bgLight: 'bg-amber-50 dark:bg-amber-950/70',
        text: 'text-amber-800 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800',
        badge: 'bg-amber-100 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800',
        dot: 'bg-amber-500',
      };
    }
    if (targetYear === 'all') {
      return {
        label: 'All Years',
        short: 'All',
        key: 'all',
        bgLight: 'bg-indigo-50 dark:bg-indigo-950/70',
        text: 'text-indigo-700 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-indigo-800',
        badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        dot: 'bg-indigo-500',
      };
    }

    const isMine = !taskMentorId || !currentUserId || taskMentorId === currentUserId;
    const label = isMine 
      ? 'My Cohort' 
      : mentorName 
      ? `${mentorName}'s Cohort` 
      : 'Cohort Mentees';

    return {
      label,
      short: 'Cohort',
      key: 'cohort',
      bgLight: 'bg-rose-50 dark:bg-rose-950/70',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-800',
      badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      dot: 'bg-rose-500',
    };
  };

  // Group scheduled tasks by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, ScheduledTask[]>();
    pendingScheduledTasks.forEach((t) => {
      const arr = map.get(t.scheduled_date) || [];
      arr.push(t);
      map.set(t.scheduled_date, arr);
    });
    return map;
  }, [pendingScheduledTasks]);

  // Counts per year for the filter bar
  const countsPerYear = useMemo(() => {
    const counts = { all: pendingScheduledTasks.length, '1': 0, '2': 0, '3': 0, '4': 0, cohort: 0 };
    pendingScheduledTasks.forEach((t) => {
      const yr = extractTargetYear(t);
      if (yr === '1') counts['1']++;
      else if (yr === '2') counts['2']++;
      else if (yr === '3') counts['3']++;
      else if (yr === '4') counts['4']++;
      else if (yr === 'all') {
        counts['1']++; counts['2']++; counts['3']++; counts['4']++;
      } else {
        counts.cohort++;
      }
    });
    return counts;
  }, [pendingScheduledTasks]);

  // User map to look up student academic year
  const userYearMap = useMemo(() => {
    const map = new Map<string, string>();
    allUsers.forEach((u) => {
      if (u.id && u.year) {
        map.set(u.id, String(u.year));
      }
    });
    return map;
  }, [allUsers]);

  // Group active rolled-out tasks by date, then by unique problem
  const activeProblemsByDate = useMemo(() => {
    const dateMap = new Map<string, Map<string, {
      key: string;
      platform: Platform;
      problem_slug_or_id: string;
      totalAssigned: number;
      completedCount: number;
      targetYears: Set<string>;
      sampleTask: Task;
    }>>();

    allCohortTasks.forEach((t) => {
      if (!t.assigned_date) return;

      let problemsMap = dateMap.get(t.assigned_date);
      if (!problemsMap) {
        problemsMap = new Map();
        dateMap.set(t.assigned_date, problemsMap);
      }

      const problemKey = `${t.platform}-${t.problem_slug_or_id}`;
      let group = problemsMap.get(problemKey);
      if (!group) {
        group = {
          key: problemKey,
          platform: t.platform,
          problem_slug_or_id: t.problem_slug_or_id,
          totalAssigned: 0,
          completedCount: 0,
          targetYears: new Set<string>(),
          sampleTask: t,
        };
        problemsMap.set(problemKey, group);
      }

      group.totalAssigned += 1;
      if (t.status === 'Completed') {
        group.completedCount += 1;
      }
      const studentYear = userYearMap.get(t.assigned_to);
      if (studentYear) {
        group.targetYears.add(studentYear);
      }
    });

    return dateMap;
  }, [allCohortTasks, userYearMap]);

  // Active unique problems on the currently selected date
  const activeProblemsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const problemsMap = activeProblemsByDate.get(selectedDate);
    if (!problemsMap) return [];

    let list = Array.from(problemsMap.values());
    if (selectedYearFilter !== 'all') {
      if (selectedYearFilter === 'cohort') {
        list = list.filter((p) => p.targetYears.size === 0);
      } else {
        list = list.filter((p) => p.targetYears.has(selectedYearFilter));
      }
    }
    return list;
  }, [activeProblemsByDate, selectedDate, selectedYearFilter]);

  // Today's month and max schedule month bounds
  const [tY, tM] = useMemo(() => {
    return (todayIST || getTodayIST()).split('-').map(Number);
  }, [todayIST]);

  const [maxY, maxM] = useMemo(() => {
    return (maxScheduleDateIST || getDateOffsetIST(30)).split('-').map(Number);
  }, [maxScheduleDateIST]);

  const isAtMinMonth = displayedYear < tY || (displayedYear === tY && displayedMonth <= (tM - 1));
  const isAtMaxMonth = displayedYear > maxY || (displayedYear === maxY && displayedMonth >= (maxM - 1));

  // Ensure selectedDate is never in the past
  React.useEffect(() => {
    if (selectedDate && todayIST && selectedDate < todayIST) {
      onSelectDate(todayIST);
    }
  }, [selectedDate, todayIST, onSelectDate]);

  // Navigation handlers
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

  const handleJumpToToday = () => {
    const [tY, tM] = todayIST.split('-').map(Number);
    if (tY && tM) {
      setDisplayedYear(tY);
      setDisplayedMonth(tM - 1);
    }
    onSelectDate(todayIST);
  };

  // Calendar cells computation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(displayedYear, displayedMonth, 1).getDay(); // 0 is Sunday
    const totalDaysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const prevMonthDays = new Date(displayedYear, displayedMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      isPast: boolean;
      isIn30Days: boolean;
      isBeyond30Days: boolean;
      tasks: ScheduledTask[];
      activeProblems: Array<{
        key: string;
        platform: Platform;
        problem_slug_or_id: string;
        totalAssigned: number;
        completedCount: number;
        targetYears: Set<string>;
        sampleTask: Task;
      }>;
      hasMatchingFilterTask: boolean;
    }> = [];

    // Leading days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const m = displayedMonth === 0 ? 12 : displayedMonth;
      const y = displayedMonth === 0 ? displayedYear - 1 : displayedYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayTasks = tasksByDate.get(dateStr) || [];
      const dayActiveMap = activeProblemsByDate.get(dateStr);
      const dayActiveProblems = dayActiveMap ? Array.from(dayActiveMap.values()) : [];

      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayIST,
        isSelected: dateStr === selectedDate,
        isPast: dateStr < todayIST,
        isIn30Days: dateStr >= todayIST && dateStr <= maxScheduleDateIST,
        isBeyond30Days: dateStr > maxScheduleDateIST,
        tasks: dayTasks,
        activeProblems: dayActiveProblems,
        hasMatchingFilterTask: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTasks = tasksByDate.get(dateStr) || [];
      const dayActiveMap = activeProblemsByDate.get(dateStr);
      const dayActiveProblems = dayActiveMap ? Array.from(dayActiveMap.values()) : [];
      const totalDayQuestions = dayTasks.length + dayActiveProblems.length;

      // Check if tasks match selected year filter
      const matchesFilter = selectedYearFilter === 'all' 
        ? totalDayQuestions > 0 
        : dayTasks.some((t) => {
            const yr = extractTargetYear(t);
            if (selectedYearFilter === 'cohort') return !yr;
            return yr === selectedYearFilter || yr === 'all';
          }) || dayActiveProblems.some((p) => {
            if (selectedYearFilter === 'cohort') return p.targetYears.size === 0;
            return p.targetYears.has(selectedYearFilter);
          });

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateStr === todayIST,
        isSelected: dateStr === selectedDate,
        isPast: dateStr < todayIST,
        isIn30Days: dateStr >= todayIST && dateStr <= maxScheduleDateIST,
        isBeyond30Days: dateStr > maxScheduleDateIST,
        tasks: dayTasks,
        activeProblems: dayActiveProblems,
        hasMatchingFilterTask: matchesFilter,
      });
    }

    // Trailing days from next month to complete the week grid (up to 35 or 42 cells)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const m = displayedMonth === 11 ? 1 : displayedMonth + 2;
      const y = displayedMonth === 11 ? displayedYear + 1 : displayedYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayTasks = tasksByDate.get(dateStr) || [];
      const dayActiveMap = activeProblemsByDate.get(dateStr);
      const dayActiveProblems = dayActiveMap ? Array.from(dayActiveMap.values()) : [];

      days.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: false,
        isToday: dateStr === todayIST,
        isSelected: dateStr === selectedDate,
        isPast: dateStr < todayIST,
        isIn30Days: dateStr >= todayIST && dateStr <= maxScheduleDateIST,
        isBeyond30Days: dateStr > maxScheduleDateIST,
        tasks: dayTasks,
        activeProblems: dayActiveProblems,
        hasMatchingFilterTask: false,
      });
    }

    return days;
  }, [displayedYear, displayedMonth, todayIST, maxScheduleDateIST, selectedDate, tasksByDate, activeProblemsByDate, selectedYearFilter]);

  // Selected date scheduled tasks
  const selectedDateTasks = useMemo(() => {
    return tasksByDate.get(selectedDate) || [];
  }, [tasksByDate, selectedDate]);

  // Filtered queue tasks (for Queue / List view)
  const filteredQueueTasks = useMemo(() => {
    return pendingScheduledTasks.filter((t) => {
      const targetYear = extractTargetYear(t);
      if (selectedYearFilter !== 'all') {
        if (selectedYearFilter === 'cohort' && targetYear) return false;
        if (selectedYearFilter !== 'cohort' && targetYear !== selectedYearFilter && targetYear !== 'all') return false;
      }
      if (queueSearch.trim()) {
        const q = queueSearch.toLowerCase().trim();
        const matchesTitle = t.problem_slug_or_id.toLowerCase().includes(q);
        const matchesPlatform = t.platform.toLowerCase().includes(q);
        const matchesDate = t.scheduled_date.includes(q);
        const matchesYear = targetYear ? targetYear.includes(q) : 'cohort'.includes(q);
        return matchesTitle || matchesPlatform || matchesDate || matchesYear;
      }
      return true;
    });
  }, [pendingScheduledTasks, selectedYearFilter, queueSearch]);

  const selectedDateLabel = useMemo(() => {
    return formatScheduledDateLabel(selectedDate, todayIST);
  }, [selectedDate, todayIST]);

  const selectedDateFormatted = useMemo(() => {
    if (!selectedDate) return '';
    const parts = selectedDate.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }
    return selectedDate;
  }, [selectedDate]);

  // Determine whether the logged-in user has permission to cancel/delete a scheduled task
  const canDeleteTask = (task: ScheduledTask) => {
    if (!currentUserId) return false;
    const isOwner = task.mentor_id === currentUserId;
    const targetYear = extractTargetYear(task);
    const isYearWide = !!targetYear;
    // Owner can always cancel their own question.
    // Common Mentor or Admin can manage year-wide curriculum questions.
    return isOwner || (isCommonMentorOrAdmin && isYearWide);
  };

  return (
    <div className={`transition-all duration-200 ${isExpanded ? 'fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto' : ''}`}>
      <div className={`w-full bg-white dark:bg-surface-900 rounded-2xl border border-brand-200 dark:border-brand-900/70 shadow-xs flex flex-col ${isExpanded ? 'max-w-4xl max-h-[92vh] overflow-y-auto p-6 border-2 shadow-2xl' : 'p-4 sm:p-5'}`}>
        
        {/* ─── CALENDAR TOP BAR: TITLE, TABS & CONTROLS ───────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/80 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-surface-900 dark:text-surface-100 flex items-center gap-1.5">
                  Rollout Calendar
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                    Next 30 Days
                  </span>
                </h4>
              </div>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                Click any upcoming day to pick rollout date and inspect assigned questions by year.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-center">
            {/* View Mode Toggle: Calendar vs Queue List */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white dark:bg-surface-700 text-brand-600 dark:text-brand-400 shadow-2xs font-bold'
                    : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'
                }`}
                title="Calendar view"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('queue')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                  viewMode === 'queue'
                    ? 'bg-white dark:bg-surface-700 text-brand-600 dark:text-brand-400 shadow-2xs font-bold'
                    : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'
                }`}
                title="Queue list view"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Queue</span>
                <span className="text-[10px] ml-0.5 px-1.5 py-0.2 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 font-black">
                  {pendingScheduledTasks.length}
                </span>
              </button>
            </div>

            {/* Expand / Minimize Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg border border-surface-200 dark:border-surface-700 text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              title={isExpanded ? 'Minimize calendar' : 'Expand calendar'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ─── AUDIENCE / YEAR FILTER CHIPS ───────────────────────────────── */}
        <div className="pt-3 pb-2 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-[11px] font-bold text-surface-500 dark:text-surface-400 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3 text-surface-400" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setSelectedYearFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedYearFilter === 'all'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
              }`}
            >
              All Years ({countsPerYear.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedYearFilter('1')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedYearFilter === '1'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Year 1 ({countsPerYear['1']})
            </button>
            <button
              type="button"
              onClick={() => setSelectedYearFilter('2')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedYearFilter === '2'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 hover:bg-purple-100'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              Year 2 ({countsPerYear['2']})
            </button>
            <button
              type="button"
              onClick={() => setSelectedYearFilter('3')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedYearFilter === '3'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Year 3 ({countsPerYear['3']})
            </button>
            <button
              type="button"
              onClick={() => setSelectedYearFilter('4')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedYearFilter === '4'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Year 4 ({countsPerYear['4']})
            </button>
            {countsPerYear.cohort > 0 && (
              <button
                type="button"
                onClick={() => setSelectedYearFilter('cohort')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedYearFilter === 'cohort'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Cohort ({countsPerYear.cohort})
              </button>
            )}
          </div>
        </div>

        {/* ─── VIEW MODE: CALENDAR VIEW ────────────────────────────────────── */}
        {viewMode === 'calendar' ? (
          <div>
            {/* Month Navigation Header */}
            <div className="flex items-center justify-between py-2.5 px-1">
              <div className="flex items-center gap-2">
                <h5 className="text-sm font-bold text-surface-900 dark:text-surface-100">
                  {MONTH_NAMES[displayedMonth]} {displayedYear}
                </h5>
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 transition-colors"
                  title="Jump to Today"
                >
                  Today
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  disabled={isAtMinMonth}
                  className={`p-1 rounded-lg transition-colors ${
                    isAtMinMonth
                      ? 'opacity-25 cursor-not-allowed text-surface-400'
                      : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300'
                  }`}
                  title={isAtMinMonth ? 'Cannot navigate to past months' : 'Previous month'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  disabled={isAtMaxMonth}
                  className={`p-1 rounded-lg transition-colors ${
                    isAtMaxMonth
                      ? 'opacity-25 cursor-not-allowed text-surface-400'
                      : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300'
                  }`}
                  title={isAtMaxMonth ? 'Cannot navigate beyond 30 days' : 'Next month'}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday Column Headers */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-[11px] uppercase tracking-wider text-surface-400 dark:text-surface-500 py-1 border-b border-surface-100 dark:border-surface-800 mb-1">
              {WEEKDAY_NAMES.map((name) => (
                <div key={name} className="py-1">
                  {name}
                </div>
              ))}
            </div>

            {/* Calendar Grid Days */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {calendarDays.map((day) => {
                const isSelected = day.isSelected;
                const isToday = day.isToday;
                const isIn30Days = day.isIn30Days;
                const isPast = day.isPast;
                const isCurrentMonth = day.isCurrentMonth;
                const totalDayQuestions = day.tasks.length + day.activeProblems.length;
                const hasTasks = totalDayQuestions > 0;

                const isSelectable = !isPast && !day.isBeyond30Days && (isIn30Days || isToday);

                // Cell styling
                let cellStyle = 'bg-white dark:bg-surface-850 border border-surface-200 dark:border-surface-800';
                if (!isCurrentMonth) {
                  cellStyle = 'bg-surface-50/40 dark:bg-surface-900/30 border-transparent text-surface-400/50 dark:text-surface-600/50 opacity-40 cursor-not-allowed';
                } else if (isPast) {
                  cellStyle = 'bg-surface-100/40 dark:bg-surface-900/40 border-surface-200/30 dark:border-surface-800/30 text-surface-400/50 dark:text-surface-600/50 opacity-35 cursor-not-allowed';
                } else if (day.isBeyond30Days) {
                  cellStyle = 'bg-surface-50/40 dark:bg-surface-900/20 border-dashed border-surface-200/40 text-surface-300 dark:text-surface-600 opacity-40 cursor-not-allowed';
                }

                if (isSelected && isSelectable) {
                  cellStyle = 'ring-2 ring-brand-500 dark:ring-brand-400 bg-brand-50/80 dark:bg-brand-950/70 border-brand-400 dark:border-brand-600 shadow-xs';
                } else if (isToday) {
                  cellStyle = 'ring-2 ring-emerald-500/80 dark:ring-emerald-500/70 bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700';
                } else if (isSelectable && hasTasks) {
                  cellStyle += ' hover:border-brand-400 dark:hover:border-brand-600';
                }

                // If year filter is active and this day has a task for that year, give distinct accent
                if (selectedYearFilter !== 'all' && day.hasMatchingFilterTask && isSelectable) {
                  cellStyle += ' border-brand-400 dark:border-brand-500 bg-brand-50/30 dark:bg-brand-950/20';
                }

                // Compute unique years present on this day (exactly one badge per year)
                const uniqueAudiences = Array.from(
                  (() => {
                    const audienceMap = new Map<string, { meta: ReturnType<typeof getAudienceMeta>; count: number }>();

                    // From pending scheduled tasks
                    day.tasks.forEach((task) => {
                      const yr = extractTargetYear(task);
                      const meta = getAudienceMeta(yr);
                      if (!audienceMap.has(meta.key)) {
                        audienceMap.set(meta.key, { meta, count: 1 });
                      } else {
                        audienceMap.get(meta.key)!.count += 1;
                      }
                    });

                    // From active rolled-out questions
                    day.activeProblems.forEach((prob) => {
                      if (prob.targetYears.size > 0) {
                        prob.targetYears.forEach((yr) => {
                          const meta = getAudienceMeta(yr);
                          if (!audienceMap.has(meta.key)) {
                            audienceMap.set(meta.key, { meta, count: 1 });
                          } else {
                            audienceMap.get(meta.key)!.count += 1;
                          }
                        });
                      } else {
                        const meta = getAudienceMeta(null);
                        if (!audienceMap.has(meta.key)) {
                          audienceMap.set(meta.key, { meta, count: 1 });
                        } else {
                          audienceMap.get(meta.key)!.count += 1;
                        }
                      }
                    });

                    return audienceMap.values();
                  })()
                ).sort((a, b) => {
                  const order: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, all: 5, cohort: 6 };
                  return (order[a.meta.key] || 99) - (order[b.meta.key] || 99);
                });

                return (
                  <div
                    key={day.dateStr}
                    onClick={() => {
                      if (isSelectable) {
                        onSelectDate(day.dateStr);
                      }
                    }}
                    className={`min-h-[58px] sm:min-h-[68px] rounded-xl p-1.5 sm:p-2 flex flex-col justify-between transition-all select-none relative ${cellStyle} ${
                      isSelectable ? 'cursor-pointer hover:shadow-xs' : 'cursor-not-allowed'
                    }`}
                    title={
                      isPast
                        ? `${day.dateStr} (Past date — cannot schedule in the past)`
                        : day.isBeyond30Days
                        ? `${day.dateStr} (Beyond 30-day window)`
                        : `${day.dateStr}${isToday ? ' (Today)' : ''}${hasTasks ? ` • ${totalDayQuestions} question(s) across ${uniqueAudiences.length} group(s)` : ''}`
                    }
                  >
                    {/* Top Row: Date Number and Status Pills */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-bold leading-none ${
                          isSelected && isSelectable
                            ? 'text-brand-700 dark:text-brand-300 font-black'
                            : isToday
                            ? 'text-emerald-700 dark:text-emerald-400 font-black'
                            : isPast
                            ? 'text-surface-400/60 dark:text-surface-600/60 line-through decoration-surface-300 dark:decoration-surface-700'
                            : isCurrentMonth
                            ? 'text-surface-800 dark:text-surface-100'
                            : 'text-surface-400 dark:text-surface-600'
                        }`}
                      >
                        {day.dayNum}
                      </span>

                      {/* Small Today Label */}
                      {isToday && (
                        <span className="text-[9px] font-black uppercase tracking-tight px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          Today
                        </span>
                      )}

                      {/* Total Question Count if multiple questions */}
                      {hasTasks && totalDayQuestions > 1 && (
                        <span 
                          className="text-[9px] font-semibold px-1 py-0.2 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400"
                          title={`${totalDayQuestions} questions scheduled/assigned`}
                        >
                          {totalDayQuestions} Qs
                        </span>
                      )}
                    </div>

                    {/* Middle / Bottom: Distinct Target Audience Badges (One per year group) */}
                    <div className="mt-1 flex flex-wrap gap-1 items-center">
                      {uniqueAudiences.map(({ meta, count }) => (
                        <span
                          key={meta.key}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-tight border ${meta.badge}`}
                          title={`${meta.label} (${count} question${count > 1 ? 's' : ''} scheduled)`}
                        >
                          {meta.short}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ─── SELECTED DAY BREAKDOWN INSPECTOR ───────────────────────── */}
            <div className="mt-5 pt-4 border-t border-surface-200 dark:border-surface-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                  <h5 className="text-sm font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
                    <span>{selectedDateFormatted}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700">
                      {selectedDate === todayIST ? '⚡ Today' : selectedDateLabel}
                    </span>
                  </h5>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-surface-500 dark:text-surface-400">
                    {selectedDateTasks.length > 0 && activeProblemsForSelectedDate.length > 0 ? (
                      `${selectedDateTasks.length} scheduled • ${activeProblemsForSelectedDate.length} active`
                    ) : selectedDateTasks.length > 0 ? (
                      `${selectedDateTasks.length} ${selectedDateTasks.length === 1 ? 'question' : 'questions'} scheduled`
                    ) : activeProblemsForSelectedDate.length > 0 ? (
                      `${activeProblemsForSelectedDate.length} active ${activeProblemsForSelectedDate.length === 1 ? 'question' : 'questions'}`
                    ) : (
                      '0 questions scheduled'
                    )}
                  </span>
                </div>
              </div>

              {/* Scheduled Questions for Selected Date */}
              {selectedDateTasks.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateTasks.map((task) => {
                    const targetYear = extractTargetYear(task);
                    const mentorName = task.mentor?.full_name;
                    const meta = getAudienceMeta(targetYear, task.mentor_id, mentorName);

                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800 hover:border-brand-300 dark:hover:border-brand-700 shadow-2xs transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          {/* Audience Badge */}
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border shrink-0 ${meta.badge}`}>
                            {meta.label}
                          </span>

                          {/* Problem Title & External Link */}
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-bold text-surface-900 dark:text-surface-100 text-xs sm:text-sm truncate">
                              {formatProblemTitle(task.problem_slug_or_id, task.platform)}
                            </span>
                            <a
                              href={getTaskLink(task)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shrink-0"
                              title="Open problem in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>

                          {mentorName && (
                            <span className="hidden md:inline text-[11px] text-surface-400 dark:text-surface-500 italic shrink-0">
                              by {mentorName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 ml-2">
                          <PlatformBadge platform={task.platform} />
                          {onDeleteScheduledTask && canDeleteTask(task) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Are you sure you want to cancel the scheduled question "${formatProblemTitle(task.problem_slug_or_id, task.platform)}" for ${selectedDateLabel}?`)) {
                                  onDeleteScheduledTask(task.id);
                                }
                              }}
                              disabled={deletingScheduledId === task.id}
                              className="p-1.5 rounded-lg text-surface-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                              title="Cancel scheduled question"
                            >
                              {deletingScheduledId === task.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : activeProblemsForSelectedDate.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-50/60 dark:bg-surface-850/60 border border-dashed border-surface-200 dark:border-surface-800 text-center flex flex-col items-center justify-center gap-1.5">
                  <CalendarIcon className="w-5 h-5 text-surface-300 dark:text-surface-600" />
                  <p className="text-xs font-semibold text-surface-600 dark:text-surface-400">
                    No questions scheduled for {selectedDateLabel} yet.
                  </p>
                  <p className="text-[11px] text-surface-400 dark:text-surface-500 max-w-sm">
                    Enter a problem link in the assignment form above to queue a question for this day!
                  </p>
                  {onQuickScheduleFocus && selectedDate >= todayIST && (
                    <button
                      type="button"
                      onClick={onQuickScheduleFocus}
                      className="mt-1 btn-secondary text-xs py-1 px-3 inline-flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-brand-600" /> Schedule for this date
                    </button>
                  )}
                </div>
              ) : null}

              {/* Active Questions Rolled Out / Assigned on this Date */}
              {activeProblemsForSelectedDate.length > 0 && (
                <div className={selectedDateTasks.length > 0 ? "mt-4 pt-3 border-t border-surface-100 dark:border-surface-800/60" : "mt-2"}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-surface-600 dark:text-surface-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active Questions on this Date ({activeProblemsForSelectedDate.length})
                    </span>
                    <span className="text-[10px] text-surface-400 dark:text-surface-500 font-medium">
                      Assigned to students
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activeProblemsForSelectedDate.map((group) => {
                      const allDone = group.completedCount === group.totalAssigned && group.totalAssigned > 0;
                      return (
                        <div
                          key={group.key}
                          className="flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800 hover:border-brand-300 dark:hover:border-brand-700 shadow-2xs transition-all text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <PlatformBadge platform={group.platform} />

                            {Array.from(group.targetYears).sort().map((yr) => (
                              <span
                                key={yr}
                                className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0"
                              >
                                Y{yr}
                              </span>
                            ))}

                            <div className="min-w-0 flex items-center gap-2">
                              <span className="font-bold text-surface-900 dark:text-surface-100 text-xs sm:text-sm truncate">
                                {formatProblemTitle(group.problem_slug_or_id, group.platform)}
                              </span>
                              <a
                                href={getTaskLink(group.sampleTask)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shrink-0"
                                title="Open problem link in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 ml-2">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                              allDone
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : group.completedCount > 0
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700'
                            }`}>
                              {group.totalAssigned === 1
                                ? (group.completedCount === 1 ? 'Completed' : 'Pending')
                                : `${group.completedCount}/${group.totalAssigned} solved`
                              }
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── VIEW MODE: QUEUE LIST VIEW ────────────────────────────────── */
          <div className="py-2 space-y-3">
            {/* Search Queue */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search upcoming questions by name, platform, date, year..."
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                className="input-field text-xs py-1.5 bg-white dark:bg-surface-850 w-full"
              />
            </div>

            {filteredQueueTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-surface-500 dark:text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-xl">
                No scheduled questions match your filter.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {filteredQueueTasks.map((task) => {
                  const targetYear = extractTargetYear(task);
                  const meta = getAudienceMeta(targetYear, task.mentor_id, task.mentor?.full_name);
                  const isSelected = selectedDate === task.scheduled_date;

                  return (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between text-xs p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 shadow-xs'
                          : 'border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-850 hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {/* Date badge */}
                        <button
                          type="button"
                          onClick={() => {
                            onSelectDate(task.scheduled_date);
                            setViewMode('calendar');
                          }}
                          className="font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/80 border border-brand-200 dark:border-brand-800 px-2 py-1 rounded-lg text-[11px] whitespace-nowrap hover:bg-brand-100"
                          title="Click to view on calendar"
                        >
                          {formatScheduledDateLabel(task.scheduled_date, todayIST)}
                        </button>

                        {/* Audience badge */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${meta.badge}`}>
                          {meta.label}
                        </span>

                        {/* Problem title */}
                        <span className="font-bold text-surface-900 dark:text-surface-100 truncate">
                          {formatProblemTitle(task.problem_slug_or_id, task.platform)}
                        </span>

                        <a
                          href={getTaskLink(task)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-surface-400 hover:text-brand-600 transition-colors shrink-0"
                          title="Open problem link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <PlatformBadge platform={task.platform} />
                        {onDeleteScheduledTask && canDeleteTask(task) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Cancel scheduled question for ${formatScheduledDateLabel(task.scheduled_date, todayIST)}?`)) {
                                onDeleteScheduledTask(task.id);
                              }
                            }}
                            disabled={deletingScheduledId === task.id}
                            className="p-1 rounded text-surface-400 hover:text-rose-600 transition-colors"
                            title="Cancel scheduled question"
                          >
                            {deletingScheduledId === task.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
