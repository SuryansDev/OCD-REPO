'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import type { UserProfile, ApprovalStatus, UserRole } from '@/lib/types';
import { Loader2, CheckCircle, XCircle, Shield, ShieldAlert, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

export default function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
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
    
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApproval = async (id: string, status: ApprovalStatus) => {
    await supabase.from('users').update({ approval_status: status }).eq('id', id);
    fetchData(); // Refresh list
  };

  const handleRoleChange = async (id: string, role: UserRole) => {
    await supabase.from('users').update({ role }).eq('id', id);
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

  return (
    <div className="min-h-screen bg-surface-50">
      <Navbar fullName={profile?.full_name || ''} role="admin" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-surface-900">Admin Dashboard</h1>
          <p className="text-surface-500 text-sm mt-1">Manage user approvals and role hierarchy.</p>
        </div>

        {/* Pending Approvals */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ShieldAlert className="text-amber-500 w-5 h-5" /> Pending Approvals ({pendingUsers.length})
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role Requested</th>
                  <th className="px-4 py-3">Details (Year/Branch)</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {pendingUsers.map(u => (
                  <tr key={u.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-surface-900">{u.full_name}</td>
                    <td className="px-4 py-3 text-surface-500">{u.email}</td>
                    <td className="px-4 py-3 capitalize">{u.role}</td>
                    <td className="px-4 py-3 text-surface-500 text-xs">
                      {u.year && <span>Y: {u.year} </span>}
                      {u.branch && <span>B: {u.branch}</span>}
                      <br/>
                      {u.roll_number && <span>Roll: {u.roll_number}</span>}
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
                    <td colSpan={5} className="px-4 py-6 text-center text-surface-400">No pending approvals.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* User Management & Hierarchy */}
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" /> Manage Users
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-100 text-surface-600 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Current Role</th>
                  <th className="px-4 py-3 text-right">Promote / Demote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {otherUsers.map(u => (
                  <tr key={u.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-surface-900">{u.full_name}</td>
                    <td className="px-4 py-3 text-surface-500">{u.email}</td>
                    <td className="px-4 py-3 capitalize">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${u.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {u.approval_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-600 uppercase text-xs">{u.role}</td>
                    <td className="px-4 py-3 flex justify-end gap-2">
                      {u.role === 'mentee' && (
                        <button onClick={() => handleRoleChange(u.id, 'mentor')} className="btn-secondary py-1 px-2 text-xs flex gap-1">
                          <ArrowUpCircle className="w-3 h-3 text-brand-500" /> Make Mentor
                        </button>
                      )}
                      {u.role === 'mentor' && (
                        <>
                          <button onClick={() => handleRoleChange(u.id, 'admin')} className="btn-secondary py-1 px-2 text-xs flex gap-1">
                            <ArrowUpCircle className="w-3 h-3 text-purple-500" /> Make Admin
                          </button>
                          <button onClick={() => handleRoleChange(u.id, 'mentee')} className="btn-secondary py-1 px-2 text-xs flex gap-1">
                            <ArrowDownCircle className="w-3 h-3 text-amber-500" /> Make Mentee
                          </button>
                        </>
                      )}
                      {u.role === 'admin' && u.id !== profile.id && (
                        <button onClick={() => handleRoleChange(u.id, 'mentor')} className="btn-secondary py-1 px-2 text-xs flex gap-1">
                          <ArrowDownCircle className="w-3 h-3 text-amber-500" /> Make Mentor
                        </button>
                      )}
                    </td>
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
