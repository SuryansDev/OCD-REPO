'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { toast } from '@/components/Toast';
import type { UserProfile } from '@/lib/types';
import { 
  cleanCodeforcesHandle, cleanLeetCodeHandle, 
  getCodeforcesProfileUrl, getLeetCodeProfileUrl 
} from '@/lib/handles';
import { 
  Loader2, Save, User, Mail, Phone, Hash, BookOpen, GitBranch, 
  ExternalLink, CheckCircle, AlertCircle, ArrowLeft, Palette, Sparkles
} from 'lucide-react';
import { useRatingColorPreference } from '@/lib/ratingColors';
import { updateCachedProfile } from '@/lib/dashboardCache';

function ProfileContent() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Preference for Codeforces rating colors (defaults to false)
  const [showRatingColors, setShowRatingColors] = useRatingColorPreference();

  // Editable fields
  const [lcHandle, setLcHandle] = useState('');
  const [cfHandle, setCfHandle] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('id');
  const supabase = createClient();

  const isOwnProfile = !targetUserId || (currentUser && currentUser.id === targetUserId);
  const canEdit = isOwnProfile || currentUser?.role === 'admin';

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: loggedInProfile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!loggedInProfile) { router.push('/login'); return; }
    setCurrentUser(loggedInProfile);

    // If an id param was supplied, fetch that user's profile
    const profileIdToFetch = targetUserId || user.id;
    const { data: userProfile } = await supabase.from('users').select('*').eq('id', profileIdToFetch).single();
    if (!userProfile) {
      // Fallback to own profile if target not found
      setProfile(loggedInProfile);
      setLcHandle(loggedInProfile.lc_handle || '');
      setCfHandle(loggedInProfile.cf_handle || '');
      setContactNumber(loggedInProfile.contact_number || '');
    } else {
      setProfile(userProfile);
      setLcHandle(userProfile.lc_handle || '');
      setCfHandle(userProfile.cf_handle || '');
      setContactNumber(userProfile.contact_number || '');
    }
    setLoading(false);
  }, [supabase, router, targetUserId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    if (!profile || !canEdit) return;
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    const cleanedLc = cleanLeetCodeHandle(lcHandle) || null;
    const cleanedCf = cleanCodeforcesHandle(cfHandle) || null;
    const cleanedContact = contactNumber.trim() || null;

    try {
      const res = await fetch('/api/users/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          lc_handle: cleanedLc,
          cf_handle: cleanedCf,
          contact_number: cleanedContact,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        const errorMsg = data?.error || 'Failed to save changes. Please try again.';
        setSaveError(errorMsg);
        toast.error('Save Failed', errorMsg);
      } else {
        setSaveSuccess(true);
        toast.success(
          'Profile Saved',
          isOwnProfile
            ? 'Your coding handles and profile details have been saved.'
            : `Successfully updated ${profile.full_name}'s profile handles.`
        );
        setLcHandle(cleanedLc || '');
        setCfHandle(cleanedCf || '');
        setContactNumber(cleanedContact || '');
        setProfile(prev => prev ? {
          ...prev,
          lc_handle: cleanedLc,
          cf_handle: cleanedCf,
          contact_number: cleanedContact,
        } : null);
        if (isOwnProfile) {
          updateCachedProfile({
            lc_handle: cleanedLc,
            cf_handle: cleanedCf,
            contact_number: cleanedContact,
          });
        }
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to save changes. Please try again.';
      setSaveError(errorMsg);
      toast.error('Save Failed', errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = profile && canEdit && (
    (cleanLeetCodeHandle(lcHandle) || '') !== (cleanLeetCodeHandle(profile.lc_handle) || '') ||
    (cleanCodeforcesHandle(cfHandle) || '') !== (cleanCodeforcesHandle(profile.cf_handle) || '') ||
    (contactNumber.trim() || '') !== (profile.contact_number || '')
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 transition-colors duration-150">
        <div className="flex items-center gap-3 text-surface-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading Profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 transition-colors duration-150">
      <Navbar fullName={currentUser?.full_name || profile?.full_name || ''} role={(currentUser?.role || profile?.role) as any} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Back Button */}
        <button 
          onClick={() => router.push(currentUser?.role === 'admin' ? '/admin' : '/dashboard')}
          className="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors mb-6 group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to {currentUser?.role === 'admin' ? 'Admin Panel' : 'Dashboard'}
        </button>

        {/* Profile Header */}
        <div className="card p-8 mb-6 animate-fade-in">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-brand-500/25 shrink-0">
              {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{profile?.full_name}</h1>
                {isOwnProfile && (
                  <span className="text-[10px] font-bold bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-2 py-0.5 rounded-full">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  profile?.role === 'admin' 
                    ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80' 
                    : profile?.role === 'common_mentor'
                    ? 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80'
                    : 'bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-800/80'
                }`}>
                  {profile?.role === 'common_mentor' ? 'Common Mentor' : profile?.role}
                </span>
                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  profile?.approval_status === 'approved'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80'
                    : profile?.approval_status === 'pending'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80'
                    : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80'
                }`}>
                  {profile?.approval_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Read-only Details */}
        <div className="card p-6 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-brand-500" />
            Personal Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-4 border border-surface-100 dark:border-surface-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Mail className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Email</label>
              </div>
              <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{profile?.email}</p>
            </div>

            <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-4 border border-surface-100 dark:border-surface-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Hash className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Roll Number</label>
              </div>
              <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{profile?.roll_number || '—'}</p>
            </div>

            <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-4 border border-surface-100 dark:border-surface-800">
              <div className="flex items-center gap-2 mb-1.5">
                <BookOpen className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Year</label>
              </div>
              <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                {profile?.year === 'Alumni' ? '🎓 Alumni' : profile?.year ? `Year ${profile.year}` : '—'}
              </p>
            </div>

            <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-4 border border-surface-100 dark:border-surface-800">
              <div className="flex items-center gap-2 mb-1.5">
                <GitBranch className="w-3.5 h-3.5 text-surface-400" />
                <label className="text-[11px] font-bold uppercase tracking-wider text-surface-400">Branch</label>
              </div>
              <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{profile?.branch || '—'}</p>
            </div>
          </div>
        </div>

        {/* Platform Profiles & Contact */}
        <div className="card p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-1 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-brand-500" />
            Platform Profiles & Contact
          </h2>
          <p className="text-xs text-surface-500 dark:text-surface-400 mb-5">
            {isOwnProfile 
              ? 'You can update these fields anytime.' 
              : currentUser?.role === 'admin'
                ? "You are viewing this member as an Admin. You can correct their handles or contact details if needed."
                : "Platform handles and contact details for this member."}
          </p>

          <div className="space-y-4">
            {/* LeetCode Handle */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1.5">
                LeetCode Username
              </label>
              {canEdit ? (
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
              ) : (
                <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-3 border border-surface-100 dark:border-surface-800 flex items-center gap-3">
                  <div className="w-5 h-5 rounded platform-lc flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-white">LC</span>
                  </div>
                  <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                    {cleanLeetCodeHandle(profile?.lc_handle) || 'Not set'}
                  </span>
                </div>
              )}

              {getLeetCodeProfileUrl(lcHandle || profile?.lc_handle) && (
                <a 
                  href={getLeetCodeProfileUrl(lcHandle || profile?.lc_handle)!} 
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 mt-1.5 transition-colors font-medium"
                >
                  <ExternalLink className="w-3 h-3" /> View on LeetCode ({cleanLeetCodeHandle(lcHandle || profile?.lc_handle)})
                </a>
              )}
            </div>

            {/* Codeforces Handle */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1.5">
                Codeforces Handle
              </label>
              {canEdit ? (
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
              ) : (
                <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-3 border border-surface-100 dark:border-surface-800 flex items-center gap-3">
                  <div className="w-5 h-5 rounded platform-cf flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-white">CF</span>
                  </div>
                  <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                    {cleanCodeforcesHandle(profile?.cf_handle) || 'Not set'}
                  </span>
                </div>
              )}

              {getCodeforcesProfileUrl(cfHandle || profile?.cf_handle) && (
                <a 
                  href={getCodeforcesProfileUrl(cfHandle || profile?.cf_handle)!} 
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-1.5 transition-colors font-medium"
                >
                  <ExternalLink className="w-3 h-3" /> View on Codeforces ({cleanCodeforcesHandle(cfHandle || profile?.cf_handle)})
                </a>
              )}
            </div>

            {/* Sync & Privacy Advisory Box */}
            <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 mt-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-amber-950 dark:text-amber-100">Important Privacy Requirement for Rankings &amp; Task Sync:</p>
                <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                  Make sure your <strong>LeetCode profile and submission history</strong> are set to <strong>Public</strong> in your LeetCode Account Privacy settings. If set to Private, our system cannot pull contest ratings, questions solved, or verify assigned tasks.
                </p>
              </div>
            </div>

            {/* Contact Number */}
            <div className="pt-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1.5">
                Mobile Number
              </label>
              {canEdit ? (
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
              ) : (
                <div className="bg-surface-50 dark:bg-surface-850 rounded-xl p-3 border border-surface-100 dark:border-surface-800 flex items-center gap-3">
                  <Phone className="w-4 h-4 text-surface-400 shrink-0" />
                  <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                    {profile?.contact_number || 'Not provided'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Save Button & Status (shown for own profile or admin) */}
          {canEdit && (
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="btn-primary"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-4 h-4" /> {isOwnProfile ? 'Save Changes' : `Save ${profile?.full_name?.split(' ')[0] || "User"}'s Handles`}</>
                )}
              </button>

              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-semibold animate-fade-in">
                  <CheckCircle className="w-4 h-4" /> Saved successfully!
                </div>
              )}
              {saveError && (
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-sm font-semibold animate-fade-in">
                  <AlertCircle className="w-4 h-4" /> {saveError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Appearance & Display Preferences */}
        {isOwnProfile && (
          <div className="card p-6 mb-6 animate-fade-in" style={{ animationDelay: '0.25s' }}>
            <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-1 flex items-center gap-2">
              <Palette className="w-5 h-5 text-brand-500" />
              Display Preferences
            </h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-5">
              Customize your personal appearance and leaderboard viewing preferences.
            </p>

            <div className="space-y-4">
              {/* Leaderboard Rating Colors Switch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-surface-900 dark:text-surface-100 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Codeforces Rating Colors in Leaderboard
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      showRatingColors
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-surface-200 text-surface-600 dark:bg-surface-800 dark:text-surface-400'
                    }`}>
                      {showRatingColors ? 'Enabled' : 'Off (Default)'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed max-w-lg">
                    Color participant handles and personal ranking banners according to Codeforces contest rating tiers (Newbie, Pupil, Specialist, Expert, Master, Grandmaster). Off by default.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showRatingColors;
                      setShowRatingColors(next);
                      toast.info(
                        'Preference Updated',
                        next
                          ? 'Rating colors enabled for leaderboard handles and banners.'
                          : 'Rating colors disabled (clean monochrome default restored).'
                      );
                    }}
                    role="switch"
                    aria-checked={showRatingColors}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                      showRatingColors ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        showRatingColors ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Visual Preview */}
              <div className="p-3.5 rounded-xl border border-dashed border-surface-200 dark:border-surface-800 bg-white/50 dark:bg-surface-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
                <span className="font-semibold text-surface-500 dark:text-surface-400 shrink-0">
                  Preview in Leaderboard:
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  {showRatingColors ? (
                    <>
                      <span className="font-semibold text-gray-500 dark:text-gray-400">newbie_coder</span>
                      <span className="font-semibold text-cyan-600 dark:text-cyan-400">specialist</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">expert_dev</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">candidate_master</span>
                      <span className="inline-flex items-baseline font-semibold">
                        <span className="text-surface-900 dark:text-surface-100 font-extrabold">t</span>
                        <span className="text-red-600 dark:text-red-500 font-bold">ourist</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-surface-900 dark:text-surface-100 font-semibold">
                      Standard text color (Default: clean monochrome names)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex items-center gap-3 text-surface-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading Profile…</span>
        </div>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
