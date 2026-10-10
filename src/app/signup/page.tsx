'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LogIn, UserPlus, Code2, Loader2 } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailTrimmed = formData.email.trim().toLowerCase();
    if (!emailTrimmed.endsWith('@nitkkr.ac.in')) {
      setError('Only college email IDs ending with @nitkkr.ac.in are allowed to register.');
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: emailTrimmed,
      password: formData.password,
      options: {
        data: {
          role: 'user', // Default role
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden py-12">
      {/* Background (same as login) */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-brand-50 to-surface-100" />
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-300/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-pulse-slow" />

      <div className="relative z-10 w-full max-w-2xl mx-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-xl shadow-brand-500/30 mb-4">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Create Account</h1>
        </div>

        <div className="glass-card rounded-3xl p-8">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Full Name *</label>
                <input name="full_name" type="text" onChange={handleChange} required minLength={2} className="input-field" placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">College Email (@nitkkr.ac.in) *</label>
                <input 
                  name="email" 
                  type="email" 
                  onChange={handleChange} 
                  required 
                  pattern=".+@nitkkr\.ac\.in$"
                  title="Must be an official @nitkkr.ac.in email address"
                  className="input-field" 
                  placeholder="yourname@nitkkr.ac.in" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Password *</label>
                <input name="password" type="password" onChange={handleChange} required minLength={6} className="input-field" placeholder="Min 6 characters" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Roll Number *</label>
                <input name="roll_number" type="text" onChange={handleChange} required pattern="^[A-Za-z0-9]+$" title="Alphanumeric only, no spaces or special characters" className="input-field" placeholder="e.g. 21BCE100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Year *</label>
                <select name="year" onChange={handleChange as any} required defaultValue="" className="input-field">
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
                <select name="branch" onChange={handleChange as any} required defaultValue="" className="input-field">
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
                <input name="contact_number" type="tel" onChange={handleChange} required pattern="^\d{10}$" title="Must be exactly 10 digits" className="input-field" placeholder="e.g. 9876543210" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">Codeforces Handle *</label>
                <input name="cf_handle" type="text" onChange={handleChange} required pattern="^[A-Za-z0-9_.-]+$" title="Username only (no spaces, URLs, or weird symbols)" className="input-field" placeholder="e.g. tourist" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-surface-800 uppercase tracking-wider">LeetCode Handle *</label>
                <input name="lc_handle" type="text" onChange={handleChange} required pattern="^[A-Za-z0-9_.-]+$" title="Username only (no spaces, URLs, or weird symbols)" className="input-field" placeholder="e.g. neetcode" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
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
