'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { UserPlus, Code2, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    year: '',
    branch: '',
    contact_number: '',
    roll_number: '',
    cf_handle: '',
    lc_handle: '',
  });

  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleSignup = async () => {
    setLoadingGoogle(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: 'nitkkr.ac.in',
          prompt: 'select_account',
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoadingGoogle(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailTrimmed = formData.email.trim().toLowerCase();
    if (!emailTrimmed.endsWith('@nitkkr.ac.in')) {
      setError('Only college email IDs ending with @nitkkr.ac.in are allowed to sign up.');
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email: emailTrimmed,
      password: formData.password,
      options: {
        data: {
          role: 'user',
          full_name: formData.full_name.trim(),
          year: formData.year,
          branch: formData.branch,
          contact_number: formData.contact_number.trim(),
          roll_number: formData.roll_number.trim(),
          cf_handle: formData.cf_handle.trim(),
          lc_handle: formData.lc_handle.trim(),
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Redirect to pending approval page
    router.push('/pending');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

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
          <h1 className="text-3xl font-bold gradient-text">Create Account</h1>
          <p className="text-surface-400 text-sm mt-1">
            Join the Online Coding Dashboard at NIT Kurukshetra
          </p>
        </div>

        <div className="glass-card rounded-3xl p-8">
          {/* Fast Google Sign Up Button */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loadingGoogle || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-surface-200 hover:bg-surface-50 text-surface-800 font-semibold text-sm shadow-sm hover:shadow transition-all group"
            >
              {loadingGoogle ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Sign up with College Google ID</span>
            </button>
            <div className="text-center text-[11px] text-surface-400 mt-2 font-medium">
              ⚡ Instant setup with <span className="font-semibold text-brand-600">@nitkkr.ac.in</span> — no passwords or email links required
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white/80 text-surface-400 font-medium">
                Or fill details manually with password
              </span>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Full Name *</label>
                <input name="full_name" type="text" value={formData.full_name} onChange={handleChange} required minLength={2} className="input-field" placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">College Email ID *</label>
                <input 
                  name="email" 
                  type="email" 
                  value={formData.email}
                  onChange={handleChange} 
                  required 
                  pattern=".+@nitkkr\.ac\.in$"
                  title="Must be an official @nitkkr.ac.in college email ID"
                  className="input-field" 
                  placeholder="yourname@nitkkr.ac.in" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Password *</label>
                <input name="password" type="password" value={formData.password} onChange={handleChange} required minLength={6} className="input-field" placeholder="Min 6 characters" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Roll Number *</label>
                <input name="roll_number" type="text" value={formData.roll_number} onChange={handleChange} required pattern="^[A-Za-z0-9]+$" title="Alphanumeric only, no spaces or special characters" className="input-field" placeholder="e.g. 21BCE100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Year *</label>
                <select name="year" value={formData.year} onChange={handleChange} required className="input-field">
                  <option value="" disabled>Select Year</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Branch *</label>
                <select name="branch" value={formData.branch} onChange={handleChange} required className="input-field">
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
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Contact Number *</label>
                <input name="contact_number" type="tel" value={formData.contact_number} onChange={handleChange} required pattern="^\d{10}$" title="Must be exactly 10 digits" className="input-field" placeholder="e.g. 9876543210" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Codeforces Handle *</label>
                <input name="cf_handle" type="text" value={formData.cf_handle} onChange={handleChange} required pattern="^[A-Za-z0-9_.-]+$" title="Username only" className="input-field" placeholder="e.g. tourist" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">LeetCode Handle *</label>
                <input name="lc_handle" type="text" value={formData.lc_handle} onChange={handleChange} required pattern="^[A-Za-z0-9_.-]+$" title="Username only" className="input-field" placeholder="e.g. neetcode" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || loadingGoogle} className="btn-primary w-full mt-6">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {loading ? 'Signing up…' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-surface-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
