'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LogIn, Mail, Lock, Code2, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Fetch user profile to redirect
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, approval_status')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      setError(`Profile Error: ${profileError?.message || 'Missing row'}. Details: ${profileError?.details || 'none'}`);
      setLoading(false);
      return;
    }

    if (profile.role !== 'admin' && profile.approval_status !== 'approved') {
      window.location.href = '/pending';
    } else if (profile.role === 'admin') {
      window.location.href = '/admin';
    } else if (profile.role === 'mentor') {
      window.location.href = '/mentor';
    } else {
      window.location.href = '/mentee';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-brand-50 to-surface-100" />
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-300/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-pulse-slow" />
      <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-brand-100/40 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      {/* Floating grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, #4263eb 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-fade-in">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-xl shadow-brand-500/30 mb-4">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">OCD</h1>
          <p className="text-surface-300 text-sm mt-1 font-medium tracking-wide">
            Online Coding Dashboard
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-3xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-surface-900">Welcome back</h2>
            <p className="text-surface-300 text-sm mt-1">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-300" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-300" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-300 hover:text-surface-800 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm animate-scale-in">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white/70 text-surface-300 font-medium">
                Mentor-Mentee Platform
              </span>
            </div>
          </div>

          <div className="mt-4 text-center text-sm text-surface-500">
            Don&apos;t have an account?{' '}
            <a href="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
              Sign up
            </a>
          </div>
        </div>


        {/* Footer */}
        <p className="text-center text-xs text-surface-300 mt-6">
          Automated verification for Codeforces &amp; LeetCode
        </p>
      </div>
    </div>
  );
}
