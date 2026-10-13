'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import type { UserProfile, ApprovalStatus, UserStats } from '@/lib/types';
import { 
  cleanCodeforcesHandle, cleanLeetCodeHandle, 
  getCodeforcesProfileUrl, getLeetCodeProfileUrl 
} from '@/lib/handles';
import { 
  Loader2, CheckCircle, XCircle, Shield, ShieldAlert, Link as LinkIcon,
  ExternalLink, AlertTriangle, Copy, Check, Search, Filter, Edit2, 
  CheckCircle2, RefreshCw, HelpCircle
} from 'lucide-react';

export default function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [mentorshipRequests, setMentorshipRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingRankings, setSyncingRankings] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  // Filters & search
  const [userFilter, setUserFilter] = useState<'all' | 'issues' | 'active' | 'deactivated'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const router = useRouter();
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: userProfile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!userProfile || userProfile.role !== 'admin') {
      router.push('/login');
      return;
    }
    setProfile(userProfile);

    // Fetch all users
    const { data: allUsers } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (allUsers) setUsers(allUsers);
    
    // Fetch user stats for coding profile health tracking
    const { data: stats } = await supabase.from('user_stats').select('*');
    if (stats) {
      const statsMap: Record<string, UserStats> = {};
      stats.forEach((s: any) => { statsMap[s.user_id] = s; });
      setUserStats(statsMap);
    }

    // Fetch mentorship requests
    const { data: reqs } = await supabase.from('mentorship_requests').select(`
      id, status, created_at, mentor_id, mentee_id,
      mentor:users!mentorship_requests_mentor_id_fkey(id, full_name, email, year),
      mentee:users!mentorship_requests_mentee_id_fkey(id, full_name, email, year)
    `).order('created_at', { ascending: false });
    if (reqs) setMentorshipRequests(reqs);

    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApproval = async (id: string, status: ApprovalStatus) => {
    await supabase.from('users').update({ approval_status: status }).eq('id', id);
    if (status !== 'approved') {
      await supabase.from('user_stats').delete().eq('user_id', id);
    }
    fetchData();
  };

  const handleMentorshipApproval = async (reqId: number, mentorId: string, menteeId: string, status: ApprovalStatus) => {
    if (status === 'approved') {
      await supabase.from('mentorships').insert([{ mentor_id: mentorId, mentee_id: menteeId }]);
    }
    await supabase.from('mentorship_requests').update({ status }).eq('id', reqId);
    fetchData();
  };

  const handleCopyNotice = (u: UserProfile, lcError?: string | null, cfError?: string | null) => {
    const text = `Hi ${u.full_name},
We noticed an issue syncing your coding profile on the OCD Dashboard:
${lcError ? `• LeetCode: ${lcError} (If private, please go to LeetCode > Settings > Privacy and set your profile & submission history to Public)` : ''}
${cfError ? `• Codeforces: ${cfError} (Please verify that your handle "${u.cf_handle || 'Not set'}" is correct and active)` : ''}
Please update your profile settings so your contest ratings and tasks can sync properly!`;

    navigator.clipboard.writeText(text);
    setCopiedUserId(u.id);
    setTimeout(() => setCopiedUserId(null), 3000);
  };

  const isIssueUser = useCallback((u: UserProfile) => {
    if (u.role === 'admin') return false;
    const stats = userStats[u.id];
    const lcClean = cleanLeetCodeHandle(u.lc_handle);
    const cfClean = cleanCodeforcesHandle(u.cf_handle);
    
    // Missing handles
    if (!lcClean || !cfClean) return true;
    
    // Explicit sync errors or private settings recorded in user_stats
    if (stats) {
      if (stats.lc_status && stats.lc_status !== 'ok') return true;
      if (stats.cf_status && stats.cf_status !== 'ok') return true;
    }
    return false;
  }, [userStats]);

  const pendingUsers = useMemo(() => users.filter(u => u.approval_status === 'pending'), [users]);
  const otherUsers = useMemo(() => users.filter(u => u.approval_status !== 'pending'), [users]);
  const pendingMentorships = useMemo(() => mentorshipRequests.filter(r => r.status === 'pending'), [mentorshipRequests]);
  const otherMentorships = useMemo(() => mentorshipRequests.filter(r => r.status !== 'pending'), [mentorshipRequests]);

  // List of approved users with API sync/privacy issues
  const issueUsers = useMemo(() => {
    return otherUsers.filter(u => u.approval_status === 'approved' && isIssueUser(u));
  }, [otherUsers, isIssueUser]);

  // Filtered users for the All Users table
  const filteredUsers = useMemo(() => {
    return otherUsers.filter(u => {
      // Tab filter
      if (userFilter === 'issues' && !isIssueUser(u)) return false;
      if (userFilter === 'active' && u.approval_status !== 'approved') return false;
      if (userFilter === 'deactivated' && u.approval_status !== 'rejected') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = u.full_name?.toLowerCase().includes(q);
        const matchesEmail = u.email?.toLowerCase().includes(q);
        const matchesRoll = u.roll_number?.toLowerCase().includes(q);
        const matchesLC = u.lc_handle?.toLowerCase().includes(q);
        const matchesCF = u.cf_handle?.toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesRoll || matchesLC || matchesCF;
      }

      return true;
    });
  }, [otherUsers, userFilter, searchQuery, isIssueUser]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex items-center gap-3 text-surface-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading Admin Dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 pb-16">
      <Navbar fullName={profile?.full_name || ''} role="admin" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 animate-fade-in flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-surface-900 tracking-tight">Admin Dashboard</h1>
            <p className="text-surface-500 text-sm mt-1">Manage user approvals, coding profile health, mentorship cohorts, and rankings.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData()}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2"
              title="Refresh all data"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* ─── SECTION 1: PROFILES WITH API / PRIVACY ISSUES ───────────────── */}
        {issueUsers.length > 0 && (
          <section className="mb-10 animate-fade-in">
            <div className="card border-amber-200 border-2 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-amber-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
                      Coding Profiles Requiring Attention
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-900">
                        {issueUsers.length} {issueUsers.length === 1 ? 'user' : 'users'}
                      </span>
                    </h2>
                    <p className="text-xs text-amber-800 mt-0.5">
                      These student profiles cannot be synced automatically. Common reasons: <strong>LeetCode profile or submissions set to Private</strong>, invalid/missing handles, or Codeforces handle not found.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                {issueUsers.map((u) => {
                  const stats = userStats[u.id];
                  const lcClean = cleanLeetCodeHandle(u.lc_handle);
                  const cfClean = cleanCodeforcesHandle(u.cf_handle);
                  const lcUrl = getLeetCodeProfileUrl(u.lc_handle);
                  const cfUrl = getCodeforcesProfileUrl(u.cf_handle);

                  const lcHasIssue = !lcClean || (stats?.lc_status && stats.lc_status !== 'ok');
                  const cfHasIssue = !cfClean || (stats?.cf_status && stats.cf_status !== 'ok');

                  const lcReason = !lcClean 
                    ? (u.lc_handle ? 'Invalid / placeholder username' : 'Missing LeetCode handle') 
                    : (stats?.lc_error_msg || (stats?.lc_status === 'private_or_not_found' ? 'Profile is Private or username does not exist' : 'API sync error'));

                  const cfReason = !cfClean 
                    ? (u.cf_handle ? 'Invalid / placeholder username' : 'Missing Codeforces handle') 
                    : (stats?.cf_error_msg || 'Codeforces handle not found or private');

                  return (
                    <div 
                      key={u.id}
                      className="bg-white rounded-xl p-4 border border-amber-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-surface-900 text-sm">{u.full_name}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-surface-100 text-surface-600">
                            Year {u.year || 'N/A'} &bull; {u.branch || 'N/A'}
                          </span>
                          <span className="text-xs text-surface-400 font-mono">
                            {u.email}
                          </span>
                        </div>

                        {/* Platform Breakdown */}
                        <div className="grid sm:grid-cols-2 gap-2 mt-2.5 text-xs">
                          {/* LeetCode Status */}
                          <div className={`p-2 rounded-lg border ${lcHasIssue ? 'bg-amber-50/60 border-amber-200 text-amber-900' : 'bg-emerald-50/60 border-emerald-200 text-emerald-800'}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                LeetCode:
                              </span>
                              {lcUrl ? (
                                <a 
                                  href={lcUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-amber-700 hover:text-amber-900 font-medium inline-flex items-center gap-0.5 underline"
                                >
                                  {lcClean || u.lc_handle} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-surface-400 italic">Not set</span>
                              )}
                            </div>
                            {lcHasIssue ? (
                              <p className="text-[11px] text-amber-700 mt-1 font-medium">
                                ⚠️ {lcReason}
                              </p>
                            ) : (
                              <p className="text-[11px] text-emerald-700 mt-1">
                                ✓ Verified ({stats?.lc_total_solved || 0} solved)
                              </p>
                            )}
                          </div>

                          {/* Codeforces Status */}
                          <div className={`p-2 rounded-lg border ${cfHasIssue ? 'bg-red-50/60 border-red-200 text-red-900' : 'bg-emerald-50/60 border-emerald-200 text-emerald-800'}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                                Codeforces:
                              </span>
                              {cfUrl ? (
                                <a 
                                  href={cfUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-700 hover:text-blue-900 font-medium inline-flex items-center gap-0.5 underline"
                                >
                                  {cfClean || u.cf_handle} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-surface-400 italic">Not set</span>
                              )}
                            </div>
                            {cfHasIssue ? (
                              <p className="text-[11px] text-red-700 mt-1 font-medium">
                                ⚠️ {cfReason}
                              </p>
                            ) : (
                              <p className="text-[11px] text-emerald-700 mt-1">
                                ✓ Verified (Rating: {stats?.cf_rating || 'Unrated'})
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <button
                          onClick={() => handleCopyNotice(u, lcHasIssue ? lcReason : null, cfHasIssue ? cfReason : null)}
                          className="px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white hover:bg-surface-50 text-xs font-semibold text-surface-700 flex items-center gap-1 transition-colors"
                          title="Copy student advice message to clipboard"
                        >
                          {copiedUserId === u.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-surface-400" />
                              <span>Copy Notice</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => router.push(`/profile?id=${u.id}`)}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                          title="Edit user profile handles as admin"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Fix Handles
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ─── SECTION 2: ACCOUNT APPROVALS (PENDING USERS) ───────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ShieldAlert className="text-amber-500 w-5 h-5" /> Account Approvals ({pendingUsers.length})
          </h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Details (Year/Branch)</th>
                    <th className="px-4 py-3">Coding Handles</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {pendingUsers.map(u => {
                    const lcClean = cleanLeetCodeHandle(u.lc_handle);
                    const cfClean = cleanCodeforcesHandle(u.cf_handle);
                    const lcUrl = getLeetCodeProfileUrl(u.lc_handle);
                    const cfUrl = getCodeforcesProfileUrl(u.cf_handle);

                    return (
                      <tr key={u.id} className="hover:bg-surface-50">
                        <td className="px-4 py-3 font-medium text-surface-900">{u.full_name}</td>
                        <td className="px-4 py-3 text-surface-500">{u.email}</td>
                        <td className="px-4 py-3 text-surface-500 text-xs">
                          {u.year && <span>Y: {u.year} </span>}
                          {u.branch && <span>B: {u.branch}</span>}
                          {u.roll_number && <div className="text-[11px] text-surface-400">Roll: {u.roll_number}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-amber-700">LC:</span>
                              {lcUrl ? (
                                <a 
                                  href={lcUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-amber-600 hover:text-amber-800 underline inline-flex items-center gap-0.5 font-medium"
                                >
                                  {lcClean} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                  Missing Handle
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-blue-700">CF:</span>
                              {cfUrl ? (
                                <a 
                                  href={cfUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-0.5 font-medium"
                                >
                                  {cfClean} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                  Missing Handle
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleApproval(u.id, 'approved')} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" /> Approve
                            </button>
                            <button onClick={() => handleApproval(u.id, 'rejected')} className="text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                              <XCircle className="w-4 h-4" /> Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pendingUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-surface-400">No pending account approvals.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ─── SECTION 3: MENTORSHIP REQUESTS ──────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <LinkIcon className="text-brand-500 w-5 h-5" /> Mentorship Requests ({pendingMentorships.length})
          </h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Mentee (Requestor)</th>
                    <th className="px-4 py-3">Mentor (Requested)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {pendingMentorships.map(r => (
                    <tr key={r.id} className="hover:bg-surface-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-surface-900">{r.mentee?.full_name}</div>
                        <div className="text-xs text-surface-500">Year: {r.mentee?.year}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-surface-900">{r.mentor?.full_name}</div>
                        <div className="text-xs text-surface-500">Year: {r.mentor?.year}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-amber-600 font-medium text-xs">{r.status}</td>
                      <td className="px-4 py-3 flex justify-end gap-2">
                        <button onClick={() => handleMentorshipApproval(r.id, r.mentor.id, r.mentee.id, 'approved')} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button onClick={() => handleMentorshipApproval(r.id, r.mentor.id, r.mentee.id, 'rejected')} className="text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                  {otherMentorships.map(r => (
                    <tr key={r.id} className="bg-surface-50/50">
                      <td className="px-4 py-3 text-surface-600">{r.mentee?.full_name}</td>
                      <td className="px-4 py-3 text-surface-600">{r.mentor?.full_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  ))}
                  {mentorshipRequests.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-surface-400">No mentorship requests yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ─── SECTION 4: SYSTEM TOOLS ─────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" /> System Operations
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* Sync Leaderboard */}
            <div className="card overflow-hidden p-6 border-emerald-200 border-2 bg-emerald-50/30 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-surface-900">Sync Leaderboard Rankings</h3>
                <p className="text-xs text-surface-600 mt-1 leading-relaxed">
                  Pulls the latest LeetCode &amp; Codeforces stats, contest history, solved counts, streaks, and platform privacy status for all approved students.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-emerald-100 flex items-center justify-between">
                <span className="text-xs text-emerald-800 font-medium">Runs diagnostics automatically</span>
                <button 
                  onClick={async () => {
                    if (!confirm('This will fetch stats from LeetCode & Codeforces for all users. It may take a minute.')) return;
                    setSyncingRankings(true);
                    try {
                      const res = await fetch('/api/leaderboard/sync', { method: 'POST' });
                      const data = await res.json();
                      await fetchData();
                      if (data.issues && data.issues.length > 0) {
                        alert(`${data.message}\n\nNotice: ${data.issues.length} profile(s) could not sync completely. Check the "Coding Profiles Requiring Attention" section above.`);
                      } else {
                        alert(data.message || 'Sync complete!');
                      }
                    } catch {
                      alert('Sync failed.');
                    }
                    setSyncingRankings(false);
                  }}
                  disabled={syncingRankings}
                  className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 text-xs py-2"
                >
                  {syncingRankings ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" /> Sync Rankings Now
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* End of Year Progression */}
            <div className="card overflow-hidden p-6 border-amber-200 border-2 bg-amber-50/30 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-surface-900">End of Year Progression</h3>
                <p className="text-xs text-surface-600 mt-1 leading-relaxed">
                  Mass update student academic years. 1st &rarr; 2nd, 2nd &rarr; 3rd, 3rd &rarr; 4th, and 4th &rarr; <strong>"Alumni"</strong>. Admin accounts are safely excluded.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-amber-100 flex items-center justify-between">
                <span className="text-xs text-amber-800 font-medium">Performs batch rollover</span>
                <button 
                  onClick={async () => {
                    if (!confirm('Are you absolutely sure? This will shift EVERY student in the database up one year.')) return;
                    
                    const updates = otherUsers.filter(u => u.role !== 'admin').map(u => {
                      let next = u.year || '';
                      const yearStr = u.year || '';
                      const currentYearNum = parseInt(yearStr.replace(/\D/g, ''), 10);
                      
                      if (yearStr === 'Alumni') {
                        next = 'Alumni';
                      } else if (currentYearNum === 1 || yearStr.startsWith('1')) {
                        next = '2';
                      } else if (currentYearNum === 2 || yearStr.startsWith('2')) {
                        next = '3';
                      } else if (currentYearNum === 3 || yearStr.startsWith('3')) {
                        next = '4';
                      } else if (currentYearNum === 4 || yearStr.startsWith('4')) {
                        next = 'Alumni';
                      }

                      return { id: u.id, year: next };
                    }).filter(u => u.year !== otherUsers.find(o => o.id === u.id)?.year);

                    if (updates.length > 0) {
                      setLoading(true);
                      await Promise.all(updates.map(u => 
                        supabase.from('users').update({ year: u.year, just_promoted: true }).eq('id', u.id)
                      ));
                      await fetchData();
                      alert(`Successfully progressed ${updates.length} students to their next academic year!`);
                    } else {
                      alert('No users need progression.');
                    }
                  }}
                  className="btn-primary whitespace-nowrap bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 text-xs py-2"
                >
                  Progress Academic Year
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 5: ALL USERS WITH CODING STATUS ─────────────────────── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="text-brand-500 w-5 h-5" /> All Members ({otherUsers.length})
            </h2>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
              <input
                type="text"
                placeholder="Search name, roll, email, handle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs bg-white"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <button
              onClick={() => setUserFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${userFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
            >
              All ({otherUsers.length})
            </button>
            <button
              onClick={() => setUserFilter('issues')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${userFilter === 'issues' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Issues ({issueUsers.length})
            </button>
            <button
              onClick={() => setUserFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${userFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
            >
              Active ({otherUsers.filter(u => u.approval_status === 'approved').length})
            </button>
            <button
              onClick={() => setUserFilter('deactivated')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${userFilter === 'deactivated' ? 'bg-red-600 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
            >
              Deactivated ({otherUsers.filter(u => u.approval_status === 'rejected').length})
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Name &amp; Roll</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Coding Profiles</th>
                    <th className="px-4 py-3">Sync Status</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {filteredUsers.map(u => {
                    const stats = userStats[u.id];
                    const lcClean = cleanLeetCodeHandle(u.lc_handle);
                    const cfClean = cleanCodeforcesHandle(u.cf_handle);
                    const lcUrl = getLeetCodeProfileUrl(u.lc_handle);
                    const cfUrl = getCodeforcesProfileUrl(u.cf_handle);

                    const lcIssue = !lcClean || (stats?.lc_status && stats.lc_status !== 'ok');
                    const cfIssue = !cfClean || (stats?.cf_status && stats.cf_status !== 'ok');
                    const hasAnyIssue = isIssueUser(u);

                    return (
                      <tr key={u.id} className={`hover:bg-surface-50 ${u.approval_status === 'rejected' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-surface-900">{u.full_name}</div>
                          {u.roll_number && (
                            <div className="text-[11px] text-surface-400 font-mono">{u.roll_number}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-surface-700 whitespace-nowrap">
                          {u.year === 'Alumni' ? '🎓 Alumni' : u.year || '—'}
                        </td>
                        <td className="px-4 py-3 text-surface-500 text-xs font-mono">{u.email}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="space-y-1">
                            {/* LeetCode link */}
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-amber-700 text-[10px]">LC:</span>
                              {lcUrl ? (
                                <a 
                                  href={lcUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-amber-700 hover:text-amber-900 underline font-medium inline-flex items-center gap-0.5"
                                >
                                  {lcClean} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-amber-600 italic text-[11px]">Not set</span>
                              )}
                            </div>
                            {/* Codeforces link */}
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-blue-700 text-[10px]">CF:</span>
                              {cfUrl ? (
                                <a 
                                  href={cfUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-700 hover:text-blue-900 underline font-medium inline-flex items-center gap-0.5"
                                >
                                  {cfClean} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-blue-600 italic text-[11px]">Not set</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'admin' ? (
                            <span className="text-surface-400 text-xs">—</span>
                          ) : hasAnyIssue ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                {lcIssue && cfIssue ? 'Both Failing' : lcIssue ? 'LC Private/Error' : 'CF Error/Missing'}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Healthy
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-brand-600 uppercase text-xs">{u.role}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => router.push(`/profile?id=${u.id}`)}
                              className="p-1.5 rounded-lg text-surface-500 hover:text-brand-600 hover:bg-surface-100 transition-colors"
                              title="Edit profile & handles as admin"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {u.approval_status === 'approved' ? (
                              <button
                                onClick={() => {
                                  if (confirm(`Deactivate ${u.full_name}? They will lose access to the dashboard.`)) {
                                    handleApproval(u.id, 'rejected');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all"
                              >
                                <ShieldAlert className="w-3 h-3" /> Deactivate
                              </button>
                            ) : u.approval_status === 'rejected' ? (
                              <button
                                onClick={() => {
                                  if (confirm(`Reactivate ${u.full_name}? They will regain access to the dashboard.`)) {
                                    handleApproval(u.id, 'approved');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-all"
                              >
                                <CheckCircle className="w-3 h-3" /> Reactivate
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-surface-400">
                        {searchQuery ? `No members matching "${searchQuery}"` : 'No members found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
