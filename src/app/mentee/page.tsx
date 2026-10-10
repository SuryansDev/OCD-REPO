'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PlatformBadge from '@/components/PlatformBadge';
import ConfettiCelebration from '@/components/Confetti';
import type { UserProfile, Task } from '@/lib/types';
import {
  ExternalLink,
  CheckCircle2,
  Loader2,
  Clock,
  AlertTriangle,
  Sparkles,
  CalendarDays,
} from 'lucide-react';

export default function MenteeDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todayTask, setTodayTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    message: string;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

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

    if (!userProfile || userProfile.role !== 'mentee') {
      router.push('/login');
      return;
    }

    setProfile(userProfile);

    // Fetch today's task
    const today = new Date().toISOString().split('T')[0];
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user.id)
      .eq('assigned_date', today)
      .order('created_at', { ascending: false })
      .limit(1);

    setTodayTask(tasks && tasks.length > 0 ? tasks[0] : null);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVerify = async () => {
    if (!todayTask) return;
    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: todayTask.id }),
      });

      const data = await res.json();
      setVerifyResult(data);

      if (data.verified) {
        setShowConfetti(true);
        setTodayTask((prev) => (prev ? { ...prev, status: 'Completed' } : null));
        setTimeout(() => setShowConfetti(false), 4000);
      }
    } catch {
      setVerifyResult({
        verified: false,
        message: 'Network error. Please try again.',
      });
    } finally {
      setVerifying(false);
    }
  };

  // Build problem link
  const getProblemLink = (task: Task) => {
    if (task.platform === 'Codeforces') {
      // Handle "1920/A" or "1920A" formats
      const id = task.problem_slug_or_id;
      if (id.includes('/')) {
        const [contestId, index] = id.split('/');
        return `https://codeforces.com/contest/${contestId}/problem/${index}`;
      }
      const match = id.match(/^(\d+)([A-Za-z]\d*)$/);
      if (match) {
        return `https://codeforces.com/contest/${match[1]}/problem/${match[2]}`;
      }
      return `https://codeforces.com/problemset/problem/${id}`;
    }
    // LeetCode
    const slug = task.problem_slug_or_id.toLowerCase().trim();
    return `https://leetcode.com/problems/${slug}/`;
  };

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
      {showConfetti && <ConfettiCelebration />}
      <Navbar fullName={profile?.full_name || ''} role="mentee" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-surface-900">
            Good {getGreeting()},{' '}
            <span className="gradient-text">{profile?.full_name?.split(' ')[0]}</span>
          </h1>
          <div className="flex items-center gap-2 mt-2 text-surface-300 text-sm">
            <CalendarDays className="w-4 h-4" />
            <span>{formatDate(new Date())}</span>
          </div>
        </div>

        {/* Task Card */}
        {todayTask ? (
          <div className="card p-6 sm:p-8 animate-slide-up">
            {/* Status Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-surface-900">Today&apos;s Challenge</h2>
              {todayTask.status === 'Completed' ? (
                <span className="badge-completed">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completed
                </span>
              ) : (
                <span className="badge-pending">
                  <Clock className="w-3.5 h-3.5" />
                  Pending
                </span>
              )}
            </div>

            {/* Problem Info */}
            <div className="flex items-start gap-4 mb-6">
              <PlatformBadge platform={todayTask.platform} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-1">
                  {todayTask.platform} Problem
                </p>
                <p className="text-xl font-bold text-surface-900 font-mono truncate">
                  {todayTask.problem_slug_or_id}
                </p>
              </div>
            </div>

            {/* External link */}
            <a
              href={getProblemLink(todayTask)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full mb-4"
            >
              <ExternalLink className="w-4 h-4" />
              Solve Problem on {todayTask.platform}
            </a>

            {/* Verify button */}
            {todayTask.status === 'Pending' && (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="btn-primary w-full"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Verify Completion
                  </>
                )}
              </button>
            )}

            {/* Success state */}
            {todayTask.status === 'Completed' && (
              <div className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 mt-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    Problem Solved! 🎉
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Great job completing today&apos;s challenge
                  </p>
                </div>
              </div>
            )}

            {/* Verify result message */}
            {verifyResult && !verifyResult.verified && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 mt-4 animate-scale-in">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Not yet verified
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {verifyResult.message}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No task state */
          <div className="card p-8 sm:p-12 text-center animate-slide-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-100 mb-4">
              <CalendarDays className="w-8 h-8 text-surface-300" />
            </div>
            <h2 className="text-lg font-bold text-surface-900 mb-2">
              No Task Today
            </h2>
            <p className="text-sm text-surface-300 max-w-sm mx-auto">
              Your mentor hasn&apos;t assigned a problem for today yet. Check back later!
            </p>
          </div>
        )}

        {/* Profile handles info */}
        <div className="mt-6 card p-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-sm font-bold text-surface-900 mb-3">Your Handles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-50">
              <PlatformBadge platform="Codeforces" size="sm" />
              <div>
                <p className="text-[11px] text-surface-300 font-medium">Codeforces</p>
                <p className="text-sm font-semibold text-surface-900 font-mono">
                  {profile?.cf_handle || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-50">
              <PlatformBadge platform="LeetCode" size="sm" />
              <div>
                <p className="text-[11px] text-surface-300 font-medium">LeetCode</p>
                <p className="text-sm font-semibold text-surface-900 font-mono">
                  {profile?.lc_handle || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Helpers
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
