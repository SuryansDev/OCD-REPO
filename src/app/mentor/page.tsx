'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PlatformBadge from '@/components/PlatformBadge';
import type { UserProfile, Platform } from '@/lib/types';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  X,
  Users,
  CalendarDays,
  TrendingUp,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface MenteeStatus {
  id: string;
  full_name: string;
  email: string;
  cf_handle: string | null;
  lc_handle: string | null;
  taskStatus: 'Completed' | 'Pending' | 'No Task';
}

interface TodayTaskInfo {
  platform: Platform;
  problem_slug_or_id: string;
}

export default function MentorDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mentees, setMentees] = useState<MenteeStatus[]>([]);
  const [todayTask, setTodayTask] = useState<TodayTaskInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Form state
  const [platform, setPlatform] = useState<Platform>('Codeforces');
  const [problemId, setProblemId] = useState('');

  const router = useRouter();
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    // Fetch profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'mentor') {
      router.push('/login');
      return;
    }

    setProfile(userProfile);

    // Fetch mentees via mentorships
    const { data: mentorships } = await supabase
      .from('mentorships')
      .select('mentee_id')
      .eq('mentor_id', user.id);

    if (!mentorships?.length) {
      setMentees([]);
      setLoading(false);
      return;
    }

    const menteeIds = mentorships.map((m) => m.mentee_id);

    // Fetch mentee profiles
    const { data: menteeProfiles } = await supabase
      .from('users')
      .select('id, full_name, email, cf_handle, lc_handle')
      .in('id', menteeIds);

    // Fetch today's tasks assigned by this mentor
    const today = new Date().toISOString().split('T')[0];
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_by', user.id)
      .eq('assigned_date', today);

    // Determine today's problem info (from any task today)
    if (tasks && tasks.length > 0) {
      setTodayTask({
        platform: tasks[0].platform,
        problem_slug_or_id: tasks[0].problem_slug_or_id,
      });
    }

    // Map mentee statuses
    const statusMap = new Map<string, string>();
    tasks?.forEach((t) => {
      statusMap.set(t.assigned_to, t.status);
    });

    const menteeStatuses: MenteeStatus[] = (menteeProfiles || []).map((mp) => ({
      id: mp.id,
      full_name: mp.full_name,
      email: mp.email,
      cf_handle: mp.cf_handle,
      lc_handle: mp.lc_handle,
      taskStatus: (statusMap.get(mp.id) as MenteeStatus['taskStatus']) || 'No Task',
    }));

    // Sort: completed first, then pending, then no task
    menteeStatuses.sort((a, b) => {
      const order = { Completed: 0, Pending: 1, 'No Task': 2 };
      return order[a.taskStatus] - order[b.taskStatus];
    });

    setMentees(menteeStatuses);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, problemSlugOrId: problemId }),
      });

      const data = await res.json();

      if (data.success) {
        setCreateResult({ success: true, message: data.message });
        setProblemId('');
        // Refresh dashboard
        setTimeout(() => {
          setShowModal(false);
          setCreateResult(null);
          fetchData();
        }, 1500);
      } else {
        setCreateResult({ success: false, message: data.error });
      }
    } catch {
      setCreateResult({
        success: false,
        message: 'Network error. Please try again.',
      });
    } finally {
      setCreating(false);
    }
  };

  const solvedCount = mentees.filter((m) => m.taskStatus === 'Completed').length;
  const assignedCount = mentees.filter((m) => m.taskStatus !== 'No Task').length;
  const totalMentees = mentees.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex items-center gap-3 text-surface-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Navbar fullName={profile?.full_name || ''} role="mentor" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">
              Mentor Dashboard
            </h1>
            <div className="flex items-center gap-2 mt-2 text-surface-300 text-sm">
              <CalendarDays className="w-4 h-4" />
              <span>{formatDate(new Date())}</span>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create Task
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {/* Solve Fraction — the big stat */}
          <div className="sm:col-span-2 card p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-surface-300 uppercase tracking-wider">
                  Solved Today
                </p>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-6xl sm:text-7xl font-black gradient-text tabular-nums">
                {solvedCount}
              </span>
              <span className="text-3xl sm:text-4xl font-bold text-surface-200">
                / {assignedCount > 0 ? assignedCount : totalMentees}
              </span>
            </div>
            <p className="text-sm text-surface-300 mt-2">
              {assignedCount > 0
                ? `${assignedCount} mentee${assignedCount !== 1 ? 's' : ''} assigned`
                : 'No tasks assigned today'}
            </p>

            {/* Progress bar */}
            {assignedCount > 0 && (
              <div className="mt-4 h-2 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${(solvedCount / assignedCount) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>

          {/* Today's Problem */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <p className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-4">
              Today&apos;s Problem
            </p>
            {todayTask ? (
              <div className="flex flex-col items-start gap-3">
                <PlatformBadge platform={todayTask.platform} size="md" />
                <p className="text-lg font-bold text-surface-900 font-mono break-all">
                  {todayTask.problem_slug_or_id}
                </p>
                <p className="text-xs text-surface-300">{todayTask.platform}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-4">
                <Sparkles className="w-8 h-8 text-surface-200 mb-2" />
                <p className="text-sm text-surface-300">No problem yet</p>
                <p className="text-xs text-surface-300 mt-1">
                  Click &quot;Create Task&quot; to assign one
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Mentee List */}
        <div className="card animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between p-5 border-b border-surface-200">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-surface-300" />
              <h2 className="text-base font-bold text-surface-900">Your Cohort</h2>
            </div>
            <span className="text-xs font-semibold text-surface-300 bg-surface-100 px-2.5 py-1 rounded-lg">
              {totalMentees} mentee{totalMentees !== 1 ? 's' : ''}
            </span>
          </div>

          {mentees.length > 0 ? (
            <div className="divide-y divide-surface-100">
              {mentees.map((mentee, idx) => (
                <div
                  key={mentee.id}
                  className="flex items-center justify-between p-4 sm:p-5 hover:bg-surface-50/50 transition-colors"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                      {mentee.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-surface-900">
                        {mentee.full_name}
                      </p>
                      <p className="text-xs text-surface-300">{mentee.email}</p>
                    </div>
                  </div>
                  <div>
                    {mentee.taskStatus === 'Completed' ? (
                      <span className="badge-completed">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Solved
                      </span>
                    ) : mentee.taskStatus === 'Pending' ? (
                      <span className="badge-pending">
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-surface-100 text-surface-300">
                        <AlertCircle className="w-3.5 h-3.5" />
                        No Task
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-surface-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-surface-900 mb-1">
                No mentees yet
              </p>
              <p className="text-xs text-surface-300">
                Add mentees to your cohort via the mentorships table.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-surface-950/40 backdrop-blur-sm animate-fade-in"
            onClick={() => {
              setShowModal(false);
              setCreateResult(null);
            }}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 bg-white rounded-3xl shadow-2xl border border-surface-200 p-6 sm:p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-surface-900">
                Assign Today&apos;s Problem
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setCreateResult(null);
                }}
                className="p-1.5 rounded-lg text-surface-300 hover:text-surface-800 hover:bg-surface-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-5">
              {/* Platform Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  Platform
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPlatform('Codeforces')}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 ${
                      platform === 'Codeforces'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-surface-200 hover:border-surface-300'
                    }`}
                  >
                    <PlatformBadge platform="Codeforces" size="sm" />
                    <span className="text-sm font-semibold text-surface-900">
                      Codeforces
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatform('LeetCode')}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 ${
                      platform === 'LeetCode'
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-surface-200 hover:border-surface-300'
                    }`}
                  >
                    <PlatformBadge platform="LeetCode" size="sm" />
                    <span className="text-sm font-semibold text-surface-900">
                      LeetCode
                    </span>
                  </button>
                </div>
              </div>

              {/* Problem ID */}
              <div className="space-y-1.5">
                <label
                  htmlFor="problem-id"
                  className="text-xs font-semibold text-surface-800 uppercase tracking-wider"
                >
                  {platform === 'Codeforces'
                    ? 'Problem ID (e.g. 1920/A or 1920A)'
                    : 'Problem Slug (e.g. two-sum)'}
                </label>
                <input
                  id="problem-id"
                  type="text"
                  value={problemId}
                  onChange={(e) => setProblemId(e.target.value)}
                  placeholder={
                    platform === 'Codeforces' ? '1920/A' : 'two-sum'
                  }
                  className="input-field font-mono"
                  required
                />
              </div>

              {/* Result */}
              {createResult && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-xl text-sm animate-scale-in ${
                    createResult.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {createResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {createResult.message}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={creating || !problemId.trim()}
                className="btn-primary w-full"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Assigning…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Assign to All Mentees
                  </>
                )}
              </button>

              <p className="text-xs text-surface-300 text-center">
                This will assign the problem to all {totalMentees} mentee
                {totalMentees !== 1 ? 's' : ''} in your cohort.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
