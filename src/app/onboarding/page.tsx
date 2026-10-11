'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Code2, CheckCircle2, Loader2, ArrowRight, LogOut, ShieldCheck } from 'lucide-react';

export default function OnboardingPage() {
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    roll_number: '',
    year: '',
    branch: '',
    contact_number: '',
    cf_handle: '',
    lc_handle: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const email = user.email?.toLowerCase().trim() || '';
      if (!email.endsWith('@nitkkr.ac.in')) {
        await supabase.auth.signOut();
        router.push('/login?error=Only official @nitkkr.ac.in college Google accounts are allowed.');
        return;
      }

      // Check if profile is already complete
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile && profile.roll_number && profile.year) {
        if (profile.role === 'admin') {
          router.push('/admin');
        } else if (profile.approval_status === 'approved') {
          router.push('/dashboard');
        } else {
          router.push('/pending');
        }
        return;
      }

      setUser(user);

      // Pre-fill if partial data exists
      if (profile) {
        setFormData({
          roll_number: profile.roll_number || '',
          year: profile.year || '',
          branch: profile.branch || '',
          contact_number: profile.contact_number || '',
          cf_handle: profile.cf_handle || '',
          lc_handle: profile.lc_handle || '',
        });
      }

      setLoading(false);
    }

    loadUser();
  }, [supabase, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Student';

    const { error: upsertError } = await supabase.from('users').upsert(
      {
        id: user.id,
        email: user.email,
        full_name: fullName,
        role: 'user',
        approval_status: 'pending',
        roll_number: formData.roll_number.trim(),
        year: formData.year,
        branch: formData.branch,
        contact_number: formData.contact_number.trim(),
        cf_handle: formData.cf_handle.trim(),
        lc_handle: formData.lc_handle.trim(),
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    router.push('/pending');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden py-12 px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-brand-50 to-surface-100" />
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-300/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-pulse-slow" />

      <div className="relative z-10 w-full max-w-2xl mx-auto animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-xl shadow-brand-500/30 mb-4">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Complete Your Profile</h1>
          <p className="text-surface-500 text-sm mt-1">
            One quick step to set up your coding profile and request mentor assignment
          </p>
        </div>

        <div className="glass-card rounded-3xl p-8">
          {/* Verified Google Badge */}
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    College Google ID Verified
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-sm font-semibold text-surface-900 mt-0.5">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Student'}
                  <span className="text-surface-500 font-normal ml-2">({user?.email})</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out and switch account"
              className="text-surface-400 hover:text-surface-700 p-2 rounded-lg hover:bg-emerald-100/50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  Roll Number *
                </label>
                <input
                  name="roll_number"
                  type="text"
                  value={formData.roll_number}
                  onChange={handleChange}
                  required
                  pattern="^[A-Za-z0-9]+$"
                  title="Alphanumeric only, no spaces or special characters"
                  className="input-field"
                  placeholder="e.g. 21BCE100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  Academic Year *
                </label>
                <select
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  required
                  className="input-field"
                >
                  <option value="" disabled>Select Year</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  Branch / Department *
                </label>
                <select
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  required
                  className="input-field"
                >
                  <option value="" disabled>Select Branch</option>
                  <option value="CSE">Computer Science (CSE)</option>
                  <option value="IT">Information Technology (IT)</option>
                  <option value="ECE">Electronics (ECE)</option>
                  <option value="EE">Electrical (EE)</option>
                  <option value="ME">Mechanical (ME)</option>
                  <option value="CE">Civil (CE)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  Contact Number (WhatsApp) *
                </label>
                <input
                  name="contact_number"
                  type="tel"
                  value={formData.contact_number}
                  onChange={handleChange}
                  required
                  pattern="^\d{10}$"
                  title="Must be exactly 10 digits"
                  className="input-field"
                  placeholder="e.g. 9876543210"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  Codeforces Handle *
                </label>
                <input
                  name="cf_handle"
                  type="text"
                  value={formData.cf_handle}
                  onChange={handleChange}
                  required
                  pattern="^[A-Za-z0-9_.-]+$"
                  title="Username only"
                  className="input-field"
                  placeholder="e.g. tourist"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  LeetCode Handle *
                </label>
                <input
                  name="lc_handle"
                  type="text"
                  value={formData.lc_handle}
                  onChange={handleChange}
                  required
                  pattern="^[A-Za-z0-9_.-]+$"
                  title="Username only"
                  className="input-field"
                  placeholder="e.g. neetcode"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full mt-6"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {saving ? 'Saving Profile…' : 'Submit for Admin Approval'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
