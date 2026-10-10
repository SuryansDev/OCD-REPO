'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import type { UserProfile, ApprovalStatus } from '@/lib/types';
import { Loader2, CheckCircle, XCircle, Shield, ShieldAlert, Link as LinkIcon } from 'lucide-react';

export default function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [mentorshipRequests, setMentorshipRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

    const { data: allUsers } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (allUsers) setUsers(allUsers);
    
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
    fetchData();
  };

  const handleMentorshipApproval = async (reqId: number, mentorId: string, menteeId: string, status: ApprovalStatus) => {
    if (status === 'approved') {
      // Insert into mentorships table
      await supabase.from('mentorships').insert([{ mentor_id: mentorId, mentee_id: menteeId }]);
    }
    // Update request status
    await supabase.from('mentorship_requests').update({ status }).eq('id', reqId);
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex items-center gap-3 text-surface-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading Admin Dashboard…</span>
        </div>
      </div>
    );
  }

  const pendingUsers = users.filter(u => u.approval_status === 'pending');
  const otherUsers = users.filter(u => u.approval_status !== 'pending');
  const pendingMentorships = mentorshipRequests.filter(r => r.status === 'pending');
  const otherMentorships = mentorshipRequests.filter(r => r.status !== 'pending');

  return (
    <div className="min-h-screen bg-surface-50">
      <Navbar fullName={profile?.full_name || ''} role="admin" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-surface-900">Admin Dashboard</h1>
          <p className="text-surface-500 text-sm mt-1">Manage user approvals, mentorship links, and system hierarchy.</p>
        </div>

        {/* User Approvals */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ShieldAlert className="text-amber-500 w-5 h-5" /> Account Approvals ({pendingUsers.length})
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Details (Year/Branch)</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {pendingUsers.map(u => (
                  <tr key={u.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-surface-900">{u.full_name}</td>
                    <td className="px-4 py-3 text-surface-500">{u.email}</td>
                    <td className="px-4 py-3 text-surface-500 text-xs">
                      {u.year && <span>Y: {u.year} </span>}
                      {u.branch && <span>B: {u.branch}</span>}
                    </td>
                    <td className="px-4 py-3 flex justify-end gap-2">
                      <button onClick={() => handleApproval(u.id, 'approved')} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button onClick={() => handleApproval(u.id, 'rejected')} className="text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-surface-400">No pending account approvals.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Mentorship Requests */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <LinkIcon className="text-brand-500 w-5 h-5" /> Mentorship Requests ({pendingMentorships.length})
          </h2>
          <div className="card overflow-hidden">
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
        </section>

        {/* System Tools */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" /> System Operations
          </h2>
          <div className="card overflow-hidden p-6 border-brand-200 border-2 bg-brand-50/30 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-surface-900">End of Year Progression</h3>
              <p className="text-sm text-surface-600 mt-1 max-w-xl">
                Mass update everyone's academic year. 1st years become 2nd years, 2nd years become 3rd years, 
                and 4th years are proudly graduated into <strong>"Alumni"</strong> status.
              </p>
            </div>
            <button 
              onClick={async () => {
                if (!confirm('Are you absolutely sure? This will shift EVERY user in the database up one year.')) return;
                
                const updates = otherUsers.map(u => {
                  let next = u.year;
                  const currentYearNum = parseInt(u.year.replace(/\D/g, ''), 10);
                  
                  if (u.year === 'Alumni') {
                    next = 'Alumni';
                  } else if (currentYearNum === 1 || u.year.startsWith('1')) {
                    next = '2';
                  } else if (currentYearNum === 2 || u.year.startsWith('2')) {
                    next = '3';
                  } else if (currentYearNum === 3 || u.year.startsWith('3')) {
                    next = '4';
                  } else if (currentYearNum === 4 || u.year.startsWith('4')) {
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
                } else {
                  alert('No users need progression.');
                }
              }}
              className="btn-primary whitespace-nowrap bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
            >
              Progress Academic Year
            </button>
          </div>
        </section>

        {/* User Management */}
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" /> All Users
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {otherUsers.map(u => (
                  <tr key={u.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-surface-900">{u.full_name}</td>
                    <td className="px-4 py-3 font-bold text-surface-700">{u.year === 'Alumni' ? '🎓 Alumni' : u.year}</td>
                    <td className="px-4 py-3 text-surface-500">{u.email}</td>
                    <td className="px-4 py-3 capitalize">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${u.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {u.approval_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-600 uppercase text-xs">{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
