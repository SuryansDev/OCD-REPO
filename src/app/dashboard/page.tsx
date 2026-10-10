'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PlatformBadge from '@/components/PlatformBadge';
import Confetti from '@/components/Confetti';
import type { UserProfile, Task } from '@/lib/types';
import { Loader2, PlusCircle, CheckCircle, Code2, Link as LinkIcon, UserPlus, Clock, AlertCircle, X } from 'lucide-react';

export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // My mentee role state
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

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
                <h3 className="text-xl font-bold text-surface-900">{selectedTaskGroup.problem_slug_or_id}</h3>
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


      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        
        {/* --- MENTEE SECTION (My Assignments) --- */}
        <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-100 rounded-lg text-brand-600">
                <Code2 className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold text-surface-900">My Assignments</h2>
            </div>
            
            {myTasks.filter(t => t.status === 'Pending').length > 0 && (
              <button 
                onClick={handleSyncProgress}
                disabled={syncing}
                className="btn-primary shadow-brand-500/30 shadow-lg px-6"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                {syncing ? 'Syncing...' : 'Sync Progress'}
              </button>
            )}
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myTasks.length === 0 ? (
              <div className="col-span-full card p-8 text-center text-surface-500 border-dashed border-2">
                You have no pending assignments right now.
              </div>
            ) : (
              myTasks.map((task) => (
                <div key={task.id} className={`card p-5 flex flex-col transition-colors ${task.status === 'Completed' ? 'bg-emerald-50/50 border-emerald-100' : 'hover:border-brand-200'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <PlatformBadge platform={task.platform as any} />
                    <span className="text-xs font-semibold text-surface-400 bg-surface-100 px-2 py-1 rounded-md">
                      {new Date(task.assigned_date).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-surface-900 text-lg mb-1">{task.problem_slug_or_id}</h3>
                  <div className="flex-1" />
                  
                  <div className="mt-4 pt-4 border-t border-surface-100/50 flex items-center justify-between">
                    {task.status === 'Completed' ? (
                      <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                        <CheckCircle className="w-5 h-5" /> Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm font-bold text-amber-500">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>


        {/* --- MENTOR SECTION (My Mentees & Assigning) --- */}
        <section className="animate-fade-in pt-8 border-t border-surface-200" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Mentorship Management</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Request Mentor & Manage Mentees */}
            <div className="space-y-6">
              <div className="card p-6">
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

              <div className="card p-6">
                <h3 className="text-lg font-bold text-surface-900 mb-4">My Cohort ({myMentees.length})</h3>
                {myMentees.length === 0 ? (
                  <p className="text-sm text-surface-500">You don't have any mentees yet.</p>
                ) : (
                  <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {myMentees.map(m => (
                      <li 
                        key={m.id} 
                        onClick={() => setSelectedMentee(m)}
                        className="flex items-center justify-between p-3 rounded-xl bg-surface-50 border border-surface-200 hover:border-brand-300 hover:bg-brand-50 cursor-pointer transition-all group"
                      >
                        <div>
                          <div className="font-bold text-surface-900 group-hover:text-brand-700 transition-colors">{m.full_name}</div>
                          <div className="text-xs text-surface-500">{m.email} &bull; Year {m.year}</div>
                        </div>
                        {menteeStats[m.id]?.hasAlert && (
                          <div className="bg-red-100 text-red-600 p-1.5 rounded-lg" title="Inactive for > 48 hours">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
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
                        <span className="font-bold text-surface-900">{group.problem_slug_or_id}</span>
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
