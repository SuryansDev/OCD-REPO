'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PlatformBadge from '@/components/PlatformBadge';
import Confetti from '@/components/Confetti';
import type { UserProfile, Task } from '@/lib/types';
import { 
  Loader2, PlusCircle, CheckCircle, CheckCircle2, CircleDashed, Code2, 
  Link as LinkIcon, UserPlus, Clock, AlertCircle, X, ExternalLink, 
  Trophy, Flame, BarChart3, Award, ChevronLeft, ChevronRight 
} from 'lucide-react';

const getTaskLink = (task: any) => {
  if (task.platform === 'LeetCode') {
    return `https://leetcode.com/problems/${task.problem_slug_or_id}`;
  } else if (task.platform === 'Codeforces') {
    const match = task.problem_slug_or_id.match(/^(\d+)([A-Za-z]\d*)$/);
    if (match) {
      return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
    } else if (task.problem_slug_or_id.includes('/')) {
      const parts = task.problem_slug_or_id.split('/');
      return `https://codeforces.com/problemset/problem/${parts[0]}/${parts[1]}`;
    }
    return `https://codeforces.com/problemset/problem/${task.problem_slug_or_id}`;
  }
  return '#';
};

const formatProblemTitle = (slugOrId: string, platform: string) => {
  if (platform === 'LeetCode') {
    return slugOrId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return slugOrId;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // My mentee role state
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [taskPage, setTaskPage] = useState(1);

  // My mentor role state
  const [myMentees, setMyMentees] = useState<UserProfile[]>([]);
  const [myMentors, setMyMentors] = useState<UserProfile[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [menteeAllTasks, setMenteeAllTasks] = useState<any[]>([]);
  const [taskLink, setTaskLink] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Request mentor state
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // Modals state
  const [selectedTaskGroup, setSelectedTaskGroup] = useState<any | null>(null);
  const [selectedMentee, setSelectedMentee] = useState<UserProfile | null>(null);
  const [showPromotion, setShowPromotion] = useState(false);

  // Leaderboard state
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [latestContests, setLatestContests] = useState<{
    lc?: { title?: string; titleSlug?: string; startTime?: string; duration?: number };
    cf?: { id?: number; name?: string; relatedNames?: string[]; startTime?: string; totalContestParticipants?: number | null };
  }>({});
  const [leaderboardTab, setLeaderboardTab] = useState<'streak' | 'lc_rating' | 'cf_rating' | 'total_solved' | 'lc_contest' | 'cf_contest'>('streak');
  const [leaderboardPage, setLeaderboardPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: userProfile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!userProfile) { router.push('/login'); return; }
    setProfile(userProfile);
    if (userProfile.just_promoted && userProfile.year !== 'Alumni') {
      setShowPromotion(true);
    }

    // Fetch tasks assigned to me
    const { data: mTasks } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('created_at', { ascending: false });
    if (mTasks) setMyTasks(mTasks);

    // Fetch my mentees
    const { data: menteeships } = await supabase.from('mentorships').select('mentee:users!mentorships_mentee_id_fkey(*)').eq('mentor_id', user.id);
    const mentees = menteeships ? menteeships.map((m: any) => m.mentee) : [];
    setMyMentees(mentees);

    // Fetch my mentors
    const { data: mentorships } = await supabase.from('mentorships').select('mentor:users!mentorships_mentor_id_fkey(*)').eq('mentee_id', user.id);
    const mentors = mentorships ? mentorships.map((m: any) => m.mentor) : [];
    setMyMentors(mentors);

    // Fetch all tasks for my mentees (to calculate progress and alerts)
    if (mentees.length > 0) {
      const menteeIds = mentees.map((m: any) => m.id);
      const { data: allMenteeTasks } = await supabase.from('tasks').select('*').in('assigned_to', menteeIds);
      if (allMenteeTasks) setMenteeAllTasks(allMenteeTasks);
    }

    // Fetch tasks I assigned (with mentee details)
    const { data: aTasks } = await supabase.from('tasks').select('*, assignee:users!tasks_assigned_to_fkey(id, full_name, email)').eq('assigned_by', user.id).order('created_at', { ascending: false });
    if (aTasks) setAssignedTasks(aTasks);

    // Fetch all users for requesting mentors
    const { data: users } = await supabase.from('users').select('*').neq('id', user.id);
    if (users) setAllUsers(users);

    // Fetch pending requests I made (asking someone to be my mentor)
    const { data: reqs } = await supabase.from('mentorship_requests').select('*, mentor:users!mentorship_requests_mentor_id_fkey(full_name)').eq('mentee_id', user.id).eq('status', 'pending');
    if (reqs) setPendingRequests(reqs);

    // Fetch leaderboard data
    try {
      const lbRes = await fetch('/api/leaderboard/sync');
      if (lbRes.ok) {
        const lbData = await lbRes.json();
        if (lbData.stats) setLeaderboardData(lbData.stats);
        if (lbData.latest_contests) setLatestContests(lbData.latest_contests);
      }
    } catch {}

    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived state for Task Groups (Grouping by platform + problem_id)
  const groupedTasks = useMemo(() => {
    const groups: Record<string, any> = {};
    assignedTasks.forEach(task => {
      const key = `${task.platform}-${task.problem_slug_or_id}-${task.assigned_date}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          platform: task.platform,
          problem_slug_or_id: task.problem_slug_or_id,
          assigned_date: task.assigned_date,
          tasks: []
        };
      }
      groups[key].tasks.push(task);
    });
    return Object.values(groups);
  }, [assignedTasks]);

  // Derived state for Mentee Progress & Alerts
  const menteeStats = useMemo(() => {
    const stats: Record<string, any> = {};
    const now = new Date().getTime();
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

    myMentees.forEach(m => {
      const mTasks = menteeAllTasks.filter(t => t.assigned_to === m.id);
      const completedTasks = mTasks.filter(t => t.status === 'Completed' && t.completed_at);
      
      // Find most recent completion time
      let lastCompletedTime = 0;
      completedTasks.forEach(t => {
        const time = new Date(t.completed_at).getTime();
        if (time > lastCompletedTime) lastCompletedTime = time;
      });

      // Alert if no completed tasks in last 48 hours (or never completed any)
      const hasAlert = (now - lastCompletedTime) > TWO_DAYS_MS;

      stats[m.id] = {
        totalAssigned: mTasks.length,
        totalCompleted: completedTasks.length,
        hasAlert,
        lastCompletedTime
      };
    });
    return stats;
  }, [myMentees, menteeAllTasks]);


  const handleSyncProgress = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.verifiedCount > 0) {
        setShowConfetti(true);
        fetchData();
        setTimeout(() => setShowConfetti(false), 5000);
        alert(data.message);
      } else {
        alert(data.message || 'No new verified submissions found.');
      }
    } catch (e) {
      alert('Verification sync failed. Try again.');
    }
    setSyncing(false);
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskLink || myMentees.length === 0) return;
    setAssigning(true);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: taskLink }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setTaskLink('');
        fetchData();
      } else {
        alert(data.error || 'Failed to assign task');
      }
    } catch (e) {
      alert('Network error.');
    }
    setAssigning(false);
  };

  const handleRequestMentor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMentorId) return;
    setRequesting(true);
    
    // Check if already requested or linked
    const { error } = await supabase.from('mentorship_requests').insert([
      { mentor_id: selectedMentorId, mentee_id: profile!.id }
    ]);
    
    if (error) {
      alert('Failed to request or request already exists.');
    } else {
      setSelectedMentorId('');
      fetchData();
    }
    setRequesting(false);
  };

  const handleAcknowledgePromotion = async () => {
    setShowPromotion(false);
    await supabase.from('users').update({ just_promoted: false }).eq('id', profile!.id);
  };

  const handleRemoveMentee = async (menteeId: string, menteeName: string) => {
    if (!confirm(`Are you sure you want to remove ${menteeName} from your cohort? This will delete the mentorship link.`)) return;
    
    const { error } = await supabase
      .from('mentorships')
      .delete()
      .eq('mentor_id', profile!.id)
      .eq('mentee_id', menteeId);

    if (error) {
      alert('Failed to remove mentee. Please try again.');
    } else {
      // Remove from local state immediately
      setMyMentees(prev => prev.filter(m => m.id !== menteeId));
    }
  };

  // Sort tasks: newest problem at the top
  const sortedTasks = useMemo(() => {
    return [...myTasks].sort((a, b) => {
      const timeA = new Date(a.created_at || a.assigned_date).getTime();
      const timeB = new Date(b.created_at || b.assigned_date).getTime();
      return timeB - timeA;
    });
  }, [myTasks]);

  const TASKS_PER_PAGE = 10;
  const totalTaskPages = Math.max(1, Math.ceil(sortedTasks.length / TASKS_PER_PAGE));
  const safeTaskPage = Math.min(Math.max(1, taskPage), totalTaskPages);
  const paginatedTasks = sortedTasks.slice(
    (safeTaskPage - 1) * TASKS_PER_PAGE,
    safeTaskPage * TASKS_PER_PAGE
  );

  const completedCount = useMemo(() => {
    return myTasks.filter((t) => t.status === 'Completed').length;
  }, [myTasks]);

  const handleTabChange = (tab: typeof leaderboardTab) => {
    setLeaderboardTab(tab);
    setLeaderboardPage(1);
  };

  // Sorted leaderboard entries based on active tab
  const sortedLeaderboard = useMemo(() => {
    let sorted = [...leaderboardData];

    const targetLCName = latestContests.lc?.title || (
      sorted
        .filter((s) => s.lc_latest_contest_date)
        .sort((a, b) => new Date(b.lc_latest_contest_date).getTime() - new Date(a.lc_latest_contest_date).getTime())[0]?.lc_latest_contest_name
    ) || '';

    const targetCFName = latestContests.cf?.name || (
      sorted
        .filter((s) => s.cf_latest_contest_date)
        .sort((a, b) => new Date(b.cf_latest_contest_date).getTime() - new Date(a.cf_latest_contest_date).getTime())[0]?.cf_latest_contest_name
    ) || '';

    const targetCFNames = latestContests.cf?.relatedNames?.length
      ? latestContests.cf.relatedNames
      : (targetCFName ? [targetCFName] : []);

    if (leaderboardTab === 'streak') {
      sorted.sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0));
    } else if (leaderboardTab === 'lc_rating') {
      sorted.sort((a, b) => (b.lc_rating || 0) - (a.lc_rating || 0));
    } else if (leaderboardTab === 'cf_rating') {
      sorted.sort((a, b) => (b.cf_rating || 0) - (a.cf_rating || 0));
    } else if (leaderboardTab === 'total_solved') {
      sorted.sort((a, b) => ((b.lc_total_solved || 0) + (b.cf_total_solved || 0)) - ((a.lc_total_solved || 0) + (a.cf_total_solved || 0)));
    } else if (leaderboardTab === 'lc_contest') {
      sorted = targetLCName ? sorted.filter((s) => s.lc_latest_contest_name && s.lc_latest_contest_name === targetLCName) : [];
      sorted.sort((a, b) => (a.lc_latest_contest_rank || 999999) - (b.lc_latest_contest_rank || 999999));
    } else if (leaderboardTab === 'cf_contest') {
      sorted = targetCFNames.length > 0 ? sorted.filter((s) => s.cf_latest_contest_name && targetCFNames.includes(s.cf_latest_contest_name)) : [];
      sorted.sort((a, b) => (a.cf_latest_contest_rank || 999999) - (b.cf_latest_contest_rank || 999999));
    }

    return sorted;
  }, [leaderboardData, leaderboardTab, latestContests]);

  const LEADERBOARD_PER_PAGE = 5;
  const totalLeaderboardPages = Math.max(1, Math.ceil(sortedLeaderboard.length / LEADERBOARD_PER_PAGE));
  const safeLeaderboardPage = Math.min(Math.max(1, leaderboardPage), totalLeaderboardPages);
  const paginatedLeaderboard = sortedLeaderboard.slice(
    (safeLeaderboardPage - 1) * LEADERBOARD_PER_PAGE,
    safeLeaderboardPage * LEADERBOARD_PER_PAGE
  );

  const myRankIndex = sortedLeaderboard.findIndex((entry) => entry.user_id === profile?.id);
  const myEntry = myRankIndex !== -1 ? sortedLeaderboard[myRankIndex] : null;
  const myRank = myRankIndex !== -1 ? myRankIndex + 1 : null;

  const targetLCName = latestContests.lc?.title || (
    leaderboardData
      .filter((s) => s.lc_latest_contest_date)
      .sort((a, b) => new Date(b.lc_latest_contest_date).getTime() - new Date(a.lc_latest_contest_date).getTime())[0]?.lc_latest_contest_name
  ) || 'Latest Contest';

  const targetCFName = latestContests.cf?.name || (
    leaderboardData
      .filter((s) => s.cf_latest_contest_date)
      .sort((a, b) => new Date(b.cf_latest_contest_date).getTime() - new Date(a.cf_latest_contest_date).getTime())[0]?.cf_latest_contest_name
  ) || 'Latest Contest';

  const targetCFNames = latestContests.cf?.relatedNames?.length
    ? latestContests.cf.relatedNames
    : (targetCFName ? [targetCFName] : []);

  const lcParticipantsCount = leaderboardData.filter((s) => s.lc_latest_contest_name && s.lc_latest_contest_name === targetLCName).length;
  const cfParticipantsCount = leaderboardData.filter((s) => s.cf_latest_contest_name && (targetCFNames.length > 0 ? targetCFNames.includes(s.cf_latest_contest_name) : s.cf_latest_contest_name === targetCFName)).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (profile?.year === 'Alumni') {
    return (
      <div className="min-h-screen bg-surface-50 relative overflow-hidden">
        <Confetti />
        <Navbar fullName={profile.full_name} role={profile.role as any} />
        
        <main className="max-w-4xl mx-auto px-4 py-24 relative z-10 flex flex-col items-center text-center animate-fade-in">
          <div className="w-24 h-24 bg-gradient-to-tr from-amber-400 to-yellow-200 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-amber-500/30">
            <span className="text-5xl">🎓</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-black text-surface-900 tracking-tight mb-6">
            Welcome to the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-yellow-400">Hall of Fame</span>
          </h1>
          
          <p className="text-lg text-surface-600 max-w-2xl leading-relaxed mb-12">
            You have successfully completed your journey and are now officially an OCD Alumni. 
            Thank you for your incredible service, dedication, and the knowledge you passed down 
            to your mentees. OCD will forever remember your legacy!
          </p>

          <div className="grid sm:grid-cols-2 gap-6 w-full max-w-2xl">
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-amber-100 shadow-xl shadow-amber-900/5">
              <div className="text-4xl font-black text-amber-600 mb-2">{myMentees.length}</div>
              <div className="text-sm font-bold text-surface-500 uppercase tracking-wider">Lives Mentored</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-emerald-100 shadow-xl shadow-emerald-900/5">
              <div className="text-4xl font-black text-emerald-600 mb-2">{assignedTasks.length}</div>
              <div className="text-sm font-bold text-surface-500 uppercase tracking-wider">Tasks Assigned</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Filter users based on search
  const availableMentorsToRequest = allUsers
    .filter(u => !myMentors.find(m => m.id === u.id));

  return (
    <div className="min-h-screen bg-surface-50 relative">
      {showConfetti && <Confetti />}
      {showPromotion && <Confetti />}
      <Navbar fullName={profile?.full_name || ''} role={profile?.role as any} />

      {/* --- MODAL: PROMOTION --- */}
      {showPromotion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-8">
            <div className="w-20 h-20 bg-gradient-to-tr from-brand-400 to-brand-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-brand-500/30">
              <span className="text-4xl">🚀</span>
            </div>
            <h2 className="text-3xl font-black text-surface-900 tracking-tight mb-2">Congratulations!</h2>
            <p className="text-surface-600 mb-8 leading-relaxed">
              You have successfully completed the academic year and have been promoted to <strong className="text-brand-600">Year {profile?.year}</strong>. Keep up the great work!
            </p>
            <button 
              onClick={handleAcknowledgePromotion}
              className="btn-primary w-full py-3 text-lg"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL: TASK GROUP DETAILS --- */}
      {selectedTaskGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-surface-100 flex justify-between items-center bg-surface-50">
              <div>
                <a 
                  href={getTaskLink(selectedTaskGroup)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xl font-bold text-brand-600 hover:text-brand-800 transition-colors w-fit group"
                >
                  {selectedTaskGroup.problem_slug_or_id}
                  <ExternalLink className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
                <p className="text-xs font-semibold text-surface-500 mt-1 uppercase tracking-wider">{selectedTaskGroup.platform} &bull; Assigned {new Date(selectedTaskGroup.assigned_date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setSelectedTaskGroup(null)} className="p-2 text-surface-400 hover:text-surface-700 hover:bg-surface-200 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-100 text-center">
                  <div className="text-2xl font-black text-surface-900">{selectedTaskGroup.tasks.length}</div>
                  <div className="text-[10px] font-bold text-surface-500 uppercase mt-1">Total Assigned</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-center">
                  <div className="text-2xl font-black text-emerald-700">{selectedTaskGroup.tasks.filter((t: any) => t.status === 'Completed').length}</div>
                  <div className="text-[10px] font-bold text-emerald-600 uppercase mt-1">Completed</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-center">
                  <div className="text-2xl font-black text-amber-700">{selectedTaskGroup.tasks.filter((t: any) => t.status !== 'Completed').length}</div>
                  <div className="text-[10px] font-bold text-amber-600 uppercase mt-1">Pending</div>
                </div>
              </div>

              <h4 className="text-sm font-bold text-surface-900 mb-3 border-b border-surface-100 pb-2">Mentees Still Pending</h4>
              <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {selectedTaskGroup.tasks.filter((t: any) => t.status !== 'Completed').map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 text-sm">
                    <span className="font-medium text-surface-900">{t.assignee?.full_name}</span>
                    <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded-md">Pending</span>
                  </li>
                ))}
                {selectedTaskGroup.tasks.filter((t: any) => t.status !== 'Completed').length === 0 && (
                  <p className="text-sm text-surface-500 italic text-center py-4">Everyone has completed this task!</p>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: MENTEE PROGRESS --- */}
      {selectedMentee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5 border-b border-surface-100 flex justify-between items-start bg-surface-50">
              <div>
                <h3 className="text-lg font-bold text-surface-900">{selectedMentee.full_name}</h3>
                <p className="text-xs font-semibold text-surface-500 mt-1">{selectedMentee.email} &bull; Year {selectedMentee.year}</p>
              </div>
              <button onClick={() => setSelectedMentee(null)} className="p-2 text-surface-400 hover:text-surface-700 hover:bg-surface-200 rounded-lg transition-colors -mt-1 -mr-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {menteeStats[selectedMentee.id]?.hasAlert && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm">Inactivity Alert</div>
                    <div className="text-xs mt-1">This mentee has not completed any assigned tasks in the last 48 hours.</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-100 text-center">
                  <div className="text-3xl font-black text-surface-900">{menteeStats[selectedMentee.id]?.totalAssigned || 0}</div>
                  <div className="text-xs font-bold text-surface-500 uppercase mt-2">Total Assigned</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-center">
                  <div className="text-3xl font-black text-emerald-700">{menteeStats[selectedMentee.id]?.totalCompleted || 0}</div>
                  <div className="text-xs font-bold text-emerald-600 uppercase mt-2">Total Done</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        
        {/* --- TOP SECTION: MY ASSIGNMENTS (LEFT) & LEADERBOARD (RIGHT) --- */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* LEFT: MY ASSIGNMENTS */}
          <div className="card p-6 overflow-hidden flex flex-col animate-fade-in shadow-sm hover:shadow-md transition-all" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-100 rounded-xl text-brand-600 shadow-sm shadow-brand-500/10">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-surface-900">My Assignments</h2>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {completedCount} of {myTasks.length} solved
                  </p>
                </div>
              </div>
              
              {myTasks.filter(t => t.status === 'Pending').length > 0 && (
                <button 
                  onClick={handleSyncProgress}
                  disabled={syncing}
                  className="btn-primary py-1.5 px-3.5 text-xs shadow-md shadow-brand-500/20"
                >
                  {syncing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {syncing ? 'Syncing...' : 'Sync Progress'}
                </button>
              )}
            </div>

            {/* LeetCode-style Problem Table */}
            <div className="border border-surface-200 rounded-xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-100/80 text-surface-600 font-semibold uppercase text-[11px] tracking-wider border-b border-surface-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">Status</th>
                      <th className="py-2.5 px-4">Problem</th>
                      <th className="py-2.5 px-3 w-20 text-center">Platform</th>
                      <th className="py-2.5 px-3 w-24 text-right">Assigned</th>
                      <th className="py-2.5 px-4 w-24 text-right">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-200/80">
                    {myTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-surface-400">
                          <Code2 className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                          <p className="font-semibold text-surface-700 text-sm">No assignments assigned yet</p>
                          <p className="text-xs text-surface-400 mt-1">When your mentor assigns questions, they will appear here.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-surface-50/80 transition-colors group">
                          {/* Solved / Unsolved Icon */}
                          <td className="py-3 px-3 text-center">
                            {task.status === 'Completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : (
                              <CircleDashed className="w-4 h-4 text-surface-300 mx-auto group-hover:text-amber-500 transition-colors" />
                            )}
                          </td>

                          {/* Problem Title Link */}
                          <td className="py-3 px-4">
                            <a 
                              href={getTaskLink(task)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="font-semibold text-surface-900 group-hover:text-brand-600 inline-flex items-center gap-1.5 max-w-[200px] sm:max-w-[260px] truncate transition-colors"
                              title={task.problem_slug_or_id}
                            >
                              <span className="truncate">{formatProblemTitle(task.problem_slug_or_id, task.platform)}</span>
                              <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-brand-500 shrink-0 transition-opacity" />
                            </a>
                          </td>

                          {/* Platform Pill */}
                          <td className="py-3 px-3 text-center">
                            {task.platform === 'LeetCode' ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                                LC
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80">
                                CF
                              </span>
                            )}
                          </td>

                          {/* Assigned Date */}
                          <td className="py-3 px-3 text-right text-xs text-surface-400 whitespace-nowrap">
                            {new Date(task.assigned_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </td>

                          {/* State Pill */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {task.status === 'Completed' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle className="w-3 h-3" /> Solved
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Slider / Pagination Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-surface-50/70 border-t border-surface-200">
                <span className="text-xs text-surface-500 font-medium order-2 sm:order-1">
                  Showing {sortedTasks.length === 0 ? 0 : (safeTaskPage - 1) * TASKS_PER_PAGE + 1}–{Math.min(safeTaskPage * TASKS_PER_PAGE, sortedTasks.length)} of {sortedTasks.length} questions
                </span>

                <div className="flex items-center gap-2 order-1 sm:order-2">
                  <button 
                    onClick={() => setTaskPage(p => Math.max(1, p - 1))} 
                    disabled={safeTaskPage <= 1}
                    className="p-1 rounded-lg border border-surface-200 bg-white hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed text-surface-600 transition-all shadow-sm"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <input 
                    type="range" 
                    min="1" 
                    max={totalTaskPages} 
                    value={safeTaskPage} 
                    onChange={(e) => setTaskPage(Number(e.target.value))}
                    disabled={totalTaskPages <= 1}
                    className="w-20 accent-brand-600 h-1.5 bg-surface-200 rounded-lg cursor-pointer disabled:opacity-40"
                    title="Slide through questions"
                  />

                  <span className="text-xs font-semibold text-surface-700 min-w-[50px] text-center">
                    {safeTaskPage} / {totalTaskPages}
                  </span>

                  <button 
                    onClick={() => setTaskPage(p => Math.min(totalTaskPages, p + 1))} 
                    disabled={safeTaskPage >= totalTaskPages}
                    className="p-1 rounded-lg border border-surface-200 bg-white hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed text-surface-600 transition-all shadow-sm"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: LEADERBOARD + MY COHORT */}
          <div className="space-y-6">
            {/* LEADERBOARD CARD */}
            <div className="card p-6 overflow-hidden flex flex-col animate-fade-in shadow-sm hover:shadow-md transition-all" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600 shadow-sm shadow-amber-500/10">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-surface-900">Leaderboard</h2>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {sortedLeaderboard.length} participants ranked
                    </p>
                  </div>
                </div>
              </div>

              {/* Leaderboard Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-3">
                {([
                  { key: 'streak', label: '🔥 Streak', icon: Flame },
                  { key: 'lc_rating', label: 'LC Rating', icon: BarChart3 },
                  { key: 'cf_rating', label: 'CF Rating', icon: BarChart3 },
                  { key: 'total_solved', label: 'Total Solved', icon: Award },
                  { key: 'lc_contest', label: 'LC Contest', icon: Trophy },
                  { key: 'cf_contest', label: 'CF Contest', icon: Trophy },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      leaderboardTab === tab.key
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30'
                        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* PINNED USER STANDING CARD (Always at top so you never have to find your rank) */}
              {myEntry ? (
                <div className="bg-gradient-to-r from-brand-50 via-indigo-50/70 to-purple-50 border border-brand-200/90 rounded-2xl p-3.5 mb-3 shadow-xs flex items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-black text-sm shadow-md shadow-brand-500/25 shrink-0">
                      {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-brand-600 text-white px-1.5 py-0.5 rounded-md">
                          YOUR RANKING
                        </span>
                        <span className="text-xs font-semibold text-surface-500">Year {myEntry.user?.year === 'Alumni' ? '🎓' : myEntry.user?.year}</span>
                      </div>
                      <p className="font-bold text-surface-900 text-sm truncate">
                        {myEntry.user?.full_name}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 bg-white/90 backdrop-blur-sm border border-brand-200/80 rounded-xl px-3 py-1.5 shadow-xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-surface-400">
                      {leaderboardTab === 'streak' && 'Streak'}
                      {leaderboardTab === 'lc_rating' && 'LC Rating'}
                      {leaderboardTab === 'cf_rating' && 'CF Rating'}
                      {leaderboardTab === 'total_solved' && 'Solved'}
                      {leaderboardTab === 'lc_contest' && 'Rank'}
                      {leaderboardTab === 'cf_contest' && 'Rank'}
                    </div>
                    <div className="text-base font-black text-brand-700">
                      {leaderboardTab === 'streak' && (
                        <span className="text-orange-600 flex items-center justify-end gap-1">
                          {myEntry.current_streak || 0} 🔥
                        </span>
                      )}
                      {leaderboardTab === 'lc_rating' && (
                        <span className="text-amber-600">
                          {myEntry.lc_rating ? Math.round(myEntry.lc_rating) : '—'}
                        </span>
                      )}
                      {leaderboardTab === 'cf_rating' && (
                        <span className="text-blue-600">
                          {myEntry.cf_rating || '—'}
                        </span>
                      )}
                      {leaderboardTab === 'total_solved' && (
                        <span className="text-emerald-600">
                          {(myEntry.lc_total_solved || 0) + (myEntry.cf_total_solved || 0)}
                        </span>
                      )}
                      {leaderboardTab === 'lc_contest' && (
                        <span className="text-amber-600">
                          {myEntry.lc_latest_contest_rank ? `#${myEntry.lc_latest_contest_rank.toLocaleString()}` : '—'}
                        </span>
                      )}
                      {leaderboardTab === 'cf_contest' && (
                        <span className="text-blue-600">
                          {myEntry.cf_latest_contest_rank ? `#${myEntry.cf_latest_contest_rank.toLocaleString()}` : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-surface-50 border border-surface-200 rounded-xl p-2.5 mb-3 text-xs text-surface-500 flex items-center justify-between">
                  <span className="font-medium">Your Ranking: Not yet ranked in this category</span>
                  <span className="text-surface-400 text-[11px]">—</span>
                </div>
              )}

              {/* Contest Info Banner (when on LC Contest or CF Contest tabs) */}
              {leaderboardTab === 'lc_contest' && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3 mb-3 flex items-center justify-between gap-2 shadow-sm text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                      LeetCode Contest
                    </span>
                    <h4 className="font-bold text-surface-900 truncate mt-1">{targetLCName}</h4>
                  </div>
                  <div className="bg-white/90 border border-amber-200/60 rounded-lg px-2.5 py-1 text-right shrink-0">
                    <div className="text-[9px] font-bold uppercase text-surface-400">Turnout</div>
                    <div className="text-sm font-black text-amber-600">{lcParticipantsCount} members</div>
                  </div>
                </div>
              )}

              {leaderboardTab === 'cf_contest' && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl p-3 mb-3 flex items-center justify-between gap-2 shadow-sm text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded">
                      Codeforces Contest
                    </span>
                    <h4 className="font-bold text-surface-900 truncate mt-1">{targetCFName}</h4>
                  </div>
                  <div className="bg-white/90 border border-blue-200/60 rounded-lg px-2.5 py-1 text-right shrink-0">
                    <div className="text-[9px] font-bold uppercase text-surface-400">Turnout</div>
                    <div className="text-sm font-black text-blue-600">{cfParticipantsCount} members</div>
                  </div>
                </div>
              )}

              {/* Leaderboard Table with 5 participants at a time */}
              <div className="border border-surface-200 rounded-xl overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-100/80 text-surface-600 font-semibold uppercase text-[11px] tracking-wider border-b border-surface-200">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-2 w-12 text-center">Year</th>
                        {leaderboardTab === 'streak' && (
                          <>
                            <th className="py-2.5 px-3 text-right">Streak</th>
                            <th className="py-2.5 px-3 text-right">Max</th>
                          </>
                        )}
                        {leaderboardTab === 'lc_rating' && (
                          <th className="py-2.5 px-3 text-right">LC Rating</th>
                        )}
                        {leaderboardTab === 'cf_rating' && (
                          <>
                            <th className="py-2.5 px-3 text-right">CF Rating</th>
                            <th className="py-2.5 px-3 text-right">Max</th>
                          </>
                        )}
                        {leaderboardTab === 'total_solved' && (
                          <>
                            <th className="py-2.5 px-2 text-right">LC</th>
                            <th className="py-2.5 px-2 text-right">CF</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                          </>
                        )}
                        {leaderboardTab === 'lc_contest' && (
                          <>
                            <th className="py-2.5 px-3">Contest</th>
                            <th className="py-2.5 px-3 text-right">Rank</th>
                            <th className="py-2.5 px-3 text-right">Solved</th>
                          </>
                        )}
                        {leaderboardTab === 'cf_contest' && (
                          <>
                            <th className="py-2.5 px-3">Contest</th>
                            <th className="py-2.5 px-3 text-right">Rank</th>
                            <th className="py-2.5 px-3 text-right">Rating</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-200/80">
                      {sortedLeaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-surface-400">
                            <Trophy className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                            <p className="font-semibold text-surface-700 text-sm">No leaderboard data found</p>
                            <p className="text-xs text-surface-400 mt-1">
                              {leaderboardTab === 'lc_contest' || leaderboardTab === 'cf_contest' 
                                ? 'No participants in this contest yet.' 
                                : 'Rankings will appear once synced.'}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        paginatedLeaderboard.map((entry, index) => {
                          const actualRank = (safeLeaderboardPage - 1) * LEADERBOARD_PER_PAGE + index;
                          const isMe = entry.user_id === profile?.id;
                          return (
                            <tr 
                              key={entry.user_id} 
                              className={`hover:bg-surface-50 transition-colors ${isMe ? 'bg-brand-50/50 font-semibold' : ''}`}
                            >
                              <td className="py-2.5 px-3 text-center text-xs">
                                {actualRank === 0 ? '🥇' : actualRank === 1 ? '🥈' : actualRank === 2 ? '🥉' : (
                                  <span className="text-surface-400 font-bold">{actualRank + 1}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-surface-900 truncate max-w-[140px]">
                                {entry.user?.full_name}
                                {isMe && (
                                  <span className="ml-1.5 text-[9px] font-bold bg-brand-100 text-brand-700 px-1 py-0.2 rounded">YOU</span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-center text-xs text-surface-500">
                                {entry.user?.year === 'Alumni' ? '🎓' : entry.user?.year}
                              </td>
                              
                              {leaderboardTab === 'streak' && (
                                <>
                                  <td className="py-2.5 px-3 text-right">
                                    <span className={`font-bold ${(entry.current_streak || 0) > 0 ? 'text-orange-600' : 'text-surface-400'}`}>
                                      {entry.current_streak || 0} {(entry.current_streak || 0) > 0 ? '🔥' : ''}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-surface-400 text-xs">
                                    {entry.max_streak || 0}
                                  </td>
                                </>
                              )}

                              {leaderboardTab === 'lc_rating' && (
                                <td className="py-2.5 px-3 text-right font-bold text-amber-600">
                                  {entry.lc_rating ? Math.round(entry.lc_rating) : '—'}
                                </td>
                              )}

                              {leaderboardTab === 'cf_rating' && (
                                <>
                                  <td className="py-2.5 px-3 text-right font-bold text-blue-600">
                                    {entry.cf_rating || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-surface-400 text-xs">
                                    {entry.cf_max_rating || '—'}
                                  </td>
                                </>
                              )}

                              {leaderboardTab === 'total_solved' && (
                                <>
                                  <td className="py-2.5 px-2 text-right font-semibold text-amber-600 text-xs">
                                    {entry.lc_total_solved || 0}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-semibold text-blue-600 text-xs">
                                    {entry.cf_total_solved || 0}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-black text-emerald-600">
                                    {(entry.lc_total_solved || 0) + (entry.cf_total_solved || 0)}
                                  </td>
                                </>
                              )}

                              {leaderboardTab === 'lc_contest' && (
                                <>
                                  <td className="py-2.5 px-3 text-xs text-surface-600 max-w-[120px] truncate" title={entry.lc_latest_contest_name}>
                                    {entry.lc_latest_contest_name || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-amber-600 text-xs">
                                    {entry.lc_latest_contest_rank?.toLocaleString() || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-600 text-xs">
                                    {entry.lc_latest_contest_solved ?? '—'}
                                  </td>
                                </>
                              )}

                              {leaderboardTab === 'cf_contest' && (
                                <>
                                  <td className="py-2.5 px-3 text-xs text-surface-600 max-w-[120px] truncate" title={entry.cf_latest_contest_name}>
                                    {entry.cf_latest_contest_name || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-blue-600 text-xs">
                                    {entry.cf_latest_contest_rank?.toLocaleString() || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-600 text-xs">
                                    {entry.cf_latest_contest_rating || '—'}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Slider / Pagination Footer for Leaderboard */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-surface-50/70 border-t border-surface-200">
                  <span className="text-xs text-surface-500 font-medium order-2 sm:order-1">
                    Showing {sortedLeaderboard.length === 0 ? 0 : (safeLeaderboardPage - 1) * LEADERBOARD_PER_PAGE + 1}–{Math.min(safeLeaderboardPage * LEADERBOARD_PER_PAGE, sortedLeaderboard.length)} of {sortedLeaderboard.length} participants
                  </span>

                  <div className="flex items-center gap-2 order-1 sm:order-2">
                    <button 
                      onClick={() => setLeaderboardPage(p => Math.max(1, p - 1))} 
                      disabled={safeLeaderboardPage <= 1}
                      className="p-1 rounded-lg border border-surface-200 bg-white hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed text-surface-600 transition-all shadow-sm"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <input 
                      type="range" 
                      min="1" 
                      max={totalLeaderboardPages} 
                      value={safeLeaderboardPage} 
                      onChange={(e) => setLeaderboardPage(Number(e.target.value))}
                      disabled={totalLeaderboardPages <= 1}
                      className="w-20 accent-brand-600 h-1.5 bg-surface-200 rounded-lg cursor-pointer disabled:opacity-40"
                      title="Slide through participants"
                    />

                    <span className="text-xs font-semibold text-surface-700 min-w-[50px] text-center">
                      {safeLeaderboardPage} / {totalLeaderboardPages}
                    </span>

                    <button 
                      onClick={() => setLeaderboardPage(p => Math.min(totalLeaderboardPages, p + 1))} 
                      disabled={safeLeaderboardPage >= totalLeaderboardPages}
                      className="p-1 rounded-lg border border-surface-200 bg-white hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed text-surface-600 transition-all shadow-sm"
                      title="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {leaderboardData[0]?.synced_at && (
                  <div className="px-4 py-2 bg-surface-50/50 text-[11px] text-surface-400 border-t border-surface-100 flex items-center justify-between">
                    <span>Last synced: {new Date(leaderboardData[0].synced_at).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* MY COHORT CARD (Placed below Leaderboard) */}
            <div className="card p-6 overflow-hidden flex flex-col animate-fade-in shadow-sm hover:shadow-md transition-all" style={{ animationDelay: '0.25s' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-100 rounded-xl text-purple-600 shadow-sm shadow-purple-500/10">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-surface-900">My Cohort</h3>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {myMentees.length} {myMentees.length === 1 ? 'mentee' : 'mentees'} enrolled
                    </p>
                  </div>
                </div>
              </div>

              {myMentees.length === 0 ? (
                <div className="p-6 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl">
                  <UserPlus className="w-7 h-7 text-surface-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-surface-600">No mentees in your cohort yet</p>
                  <p className="text-xs text-surface-400 mt-1">When students request you and an admin approves, they will appear here.</p>
                </div>
              ) : (
                <ul className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {myMentees.map(m => (
                    <li 
                      key={m.id} 
                      onClick={() => setSelectedMentee(m)}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-50/70 border border-surface-200 hover:border-brand-300 hover:bg-brand-50/40 cursor-pointer transition-all group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-surface-900 group-hover:text-brand-700 transition-colors text-sm truncate">
                          {m.full_name}
                        </div>
                        <div className="text-xs text-surface-500 truncate">
                          {m.email} &bull; Year {m.year}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {menteeStats[m.id]?.hasAlert && (
                          <div className="bg-red-100 text-red-600 p-1.5 rounded-lg" title="Inactive for > 48 hours">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMentee(m.id, m.full_name);
                          }}
                          className="p-1.5 rounded-lg text-surface-300 hover:text-red-600 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                          title={`Remove ${m.full_name} from cohort`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>


        {/* --- BOTTOM SECTION: MENTORSHIP MANAGEMENT (As earlier) --- */}
        <section className="animate-fade-in pt-8 border-t border-surface-200" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Mentorship Management</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Request Mentor */}
            <div className="card p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-surface-900 mb-4">Request a Mentor</h3>
                
                <form onSubmit={handleRequestMentor} className="space-y-3">
                  <div className="flex gap-2">
                    <select 
                      value={selectedMentorId} 
                      onChange={e => setSelectedMentorId(e.target.value)}
                      className="input-field flex-1 text-sm"
                      required
                    >
                      <option value="">Select a mentor...</option>
                      {availableMentorsToRequest.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name} (Year: {u.year})</option>
                      ))}
                    </select>
                    <button type="submit" disabled={requesting} className="btn-secondary whitespace-nowrap">
                      {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Request'}
                    </button>
                  </div>
                </form>

                {pendingRequests.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-surface-100">
                    <p className="text-xs font-semibold text-surface-500 uppercase mb-2">Pending Requests</p>
                    <ul className="space-y-2">
                      {pendingRequests.map(r => (
                        <li key={r.id} className="flex items-center gap-2 text-sm text-surface-600 bg-surface-50 p-2 rounded-lg border border-surface-200">
                          <Clock className="w-4 h-4 text-amber-500" /> Waiting for Admin to approve mentor: <span className="font-medium text-surface-900">{r.mentor?.full_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Assign Tasks */}
            <div className="card p-6 border-brand-200 border-2 bg-brand-50/30 flex flex-col">
              <h3 className="text-lg font-bold text-surface-900 mb-1">Assign Task to Cohort</h3>
              <p className="text-sm text-surface-500 mb-6">Paste a Codeforces or LeetCode problem URL. It will be assigned to all your approved mentees.</p>
              
              <form onSubmit={handleAssignTask} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Problem Link</label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                    <input
                      type="url"
                      placeholder="https://leetcode.com/problems/..."
                      value={taskLink}
                      onChange={(e) => setTaskLink(e.target.value)}
                      className="input-field pl-10 bg-white"
                      required
                      disabled={myMentees.length === 0}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={assigning || myMentees.length === 0} 
                  className="btn-primary w-full"
                >
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  Assign Task
                </button>
                {myMentees.length === 0 && (
                  <p className="text-xs text-amber-600 text-center font-medium mt-2">
                    You need at least one mentee to assign tasks.
                  </p>
                )}
              </form>

              <div className="mt-8 pt-6 border-t border-brand-100 flex-1 flex flex-col min-h-0">
                <h4 className="text-sm font-bold text-surface-900 mb-3">Recently Assigned (Click for details)</h4>
                {groupedTasks.length === 0 ? (
                   <p className="text-xs text-surface-500">No tasks assigned yet.</p>
                ) : (
                  <ul className="space-y-2 overflow-y-auto pr-2">
                    {groupedTasks.map(group => (
                      <li 
                        key={group.key} 
                        onClick={() => setSelectedTaskGroup(group)}
                        className="flex items-center justify-between text-sm p-3 rounded-lg bg-white border border-brand-100 hover:border-brand-300 hover:shadow-sm cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-surface-900">{group.problem_slug_or_id}</span>
                          <a 
                            href={getTaskLink(group)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-surface-400 hover:text-brand-600 transition-colors"
                            title="Open Problem Link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-surface-500 bg-surface-50 px-2 py-1 rounded">{group.platform}</span>
                          <div className="flex items-center gap-1 text-xs font-bold text-surface-400">
                            <span className="text-emerald-600">{group.tasks.filter((t: any) => t.status === 'Completed').length}</span>
                            <span>/</span>
                            <span>{group.tasks.length}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}
