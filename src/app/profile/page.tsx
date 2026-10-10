'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import type { UserProfile } from '@/lib/types';
import { 
  Loader2, Save, User, Mail, Phone, Hash, BookOpen, GitBranch, 
  ExternalLink, CheckCircle, AlertCircle, ArrowLeft
} from 'lucide-react';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editable fields
  const [lcHandle, setLcHandle] = useState('');
  const [cfHandle, setCfHandle] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const router = useRouter();
  const supabase = createClient();

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: userProfile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!userProfile) { router.push('/login'); return; }

    setProfile(userProfile);
    setLcHandle(userProfile.lc_handle || '');
    setCfHandle(userProfile.cf_handle || '');
    setContactNumber(userProfile.contact_number || '');
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    const { error } = await supabase.from('users').update({
      lc_handle: lcHandle.trim() || null,
      cf_handle: cfHandle.trim() || null,
      contact_number: contactNumber.trim() || null,
    }).eq('id', profile.id);

    if (error) {
      setSaveError('Failed to save changes. Please try again.');
    } else {
      setSaveSuccess(true);
      // Update local profile state
      setProfile(prev => prev ? {
        ...prev,
        lc_handle: lcHandle.trim() || null,
        cf_handle: cfHandle.trim() || null,
        contact_number: contactNumber.trim() || null,
      } : null);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setSaving(false);
  };

  const hasChanges = profile && (
    (lcHandle.trim() || '') !== (profile.lc_handle || '') ||
    (cfHandle.trim() || '') !== (profile.cf_handle || '') ||
    (contactNumber.trim() || '') !== (profile.contact_number || '')
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex items-center gap-3 text-surface-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading Profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Navbar fullName={profile?.full_name || ''} role={profile?.role as any} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Back Button */}
        <button 
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-sm text-surface-500 hover:text-brand-600 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>

        {/* Profile Header */}
        <div className="card p-8 mb-6 animate-fade-in">
          <div className="flex items-center gap-5 mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-brand-500/25">
              {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900">{profile?.full_name}</h1>
              <p className="text-sm text-surface-500 mt-0.5">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  profile?.role === 'admin' 
                    ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                }`}>
                  {profile?.role}
                </span>
                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  profile?.approval_status === 'approved'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : profile?.approval_status === 'pending'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {profile?.approval_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Read-only Details */}
        <div className="card p-6 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-lg font-bold text-surface-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-brand-500" />
            Personal Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-50 rounded-xl p-4 border border-surface-100">
              <div className="flex items-center gap-2 mb-1.5">
                <Mail className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Email</label>
              </div>
              <p className="text-sm font-semibold text-surface-800">{profile?.email}</p>
            </div>

            <div className="bg-surface-50 rounded-xl p-4 border border-surface-100">
              <div className="flex items-center gap-2 mb-1.5">
                <Hash className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Roll Number</label>
              </div>
              <p className="text-sm font-semibold text-surface-800">{profile?.roll_number || '—'}</p>
            </div>

            <div className="bg-surface-50 rounded-xl p-4 border border-surface-100">
              <div className="flex items-center gap-2 mb-1.5">
                <BookOpen className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Year</label>
              </div>
              <p className="text-sm font-semibold text-surface-800">
                {profile?.year === 'Alumni' ? '🎓 Alumni' : profile?.year ? `Year ${profile.year}` : '—'}
              </p>
            </div>

            <div className="bg-surface-50 rounded-xl p-4 border border-surface-100">
              <div className="flex items-center gap-2 mb-1.5">
                <GitBranch className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Branch</label>
              </div>
              <p className="text-sm font-semibold text-surface-800">{profile?.branch || '—'}</p>
            </div>
          </div>
        </div>

        {/* Editable Section */}
        <div className="card p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-lg font-bold text-surface-900 mb-1 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-brand-500" />
            Platform Profiles & Contact
          </h2>
          <p className="text-xs text-surface-400 mb-5">You can update these fields anytime.</p>

          <div className="space-y-4">
            {/* LeetCode Handle */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 mb-1.5">
                LeetCode Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={lcHandle}
                  onChange={(e) => setLcHandle(e.target.value)}
                  placeholder="e.g. johndoe"
                  className="input-field pl-10"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 rounded platform-lc flex items-center justify-center">
                    <span className="text-[10px] font-black text-white">LC</span>
                  </div>
                </div>
              </div>
              {lcHandle && (
                <a 
                  href={`https://leetcode.com/u/${lcHandle}`} 
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 mt-1.5 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> View on LeetCode
                </a>
              )}
            </div>

            {/* Codeforces Handle */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 mb-1.5">
                Codeforces Handle
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={cfHandle}
                  onChange={(e) => setCfHandle(e.target.value)}
                  placeholder="e.g. tourist"
                  className="input-field pl-10"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 rounded platform-cf flex items-center justify-center">
                    <span className="text-[10px] font-black text-white">CF</span>
                  </div>
                </div>
              </div>
              {cfHandle && (
                <a 
                  href={`https://codeforces.com/profile/${cfHandle}`} 
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1.5 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> View on Codeforces
                </a>
              )}
            </div>

            {/* Contact Number */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 mb-1.5">
                Mobile Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="input-field pl-10"
                />
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              </div>
            </div>
          </div>

          {/* Save Button & Status */}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="btn-primary"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-4 h-4" /> Save Changes</>
              )}
            </button>

            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold animate-fade-in">
                <CheckCircle className="w-4 h-4" /> Saved successfully!
              </div>
            )}
            {saveError && (
              <div className="flex items-center gap-1.5 text-red-600 text-sm font-semibold animate-fade-in">
                <AlertCircle className="w-4 h-4" /> {saveError}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
