'use client';

import { Suspense, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Mail, Lock, Code2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailTrimmed = email.trim().toLowerCase();

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: emailTrimmed,
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
      .select('role, approval_status, roll_number, year')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      setError(`Profile Error: ${profileError?.message || 'Missing profile'}.`);
      setLoading(false);
      return;
    }

    if (!profile.roll_number || !profile.year) {
      window.location.href = '/onboarding';
    } else if (profile.role !== 'admin' && profile.approval_status !== 'approved') {
      window.location.href = '/pending';
    } else if (profile.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="glass-card rounded-3xl p-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-surface-900">Welcome back</h2>
        <p className="text-surface-400 text-sm mt-1">
          Sign in to your account to continue
        </p>
      </div>

      {/* Google Sign In Button */}
      <div className="mb-6">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loadingGoogle || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-white border border-surface-200 hover:bg-surface-50 text-surface-800 font-semibold text-sm shadow-sm hover:shadow transition-all group"
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
          <span>Continue with College Google ID</span>
        </button>
        <div className="text-center text-[11px] text-surface-400 mt-2 font-medium">
          Only official <span className="font-semibold text-brand-600">@nitkkr.ac.in</span> accounts permitted
        </div>
      </div>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-white/80 text-surface-400 font-medium">
            Or sign in with email &amp; password
          </span>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-300" />
            <input
              id="email"
              type="email"
              placeholder="yourname@nitkkr.ac.in or admin email"
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
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm animate-scale-in">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || loadingGoogle}
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

      <div className="mt-6 text-center text-sm text-surface-500">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign up
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden py-12 px-4">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-brand-50 to-surface-100" />
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-300/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-pulse-slow" />
      <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-brand-100/40 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 w-full max-w-md mx-auto animate-fade-in">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-xl shadow-brand-500/30 mb-4">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">OCD</h1>
          <p className="text-surface-400 text-sm mt-1 font-medium tracking-wide">
            Online Coding Dashboard — NIT Kurukshetra
          </p>
        </div>

        <Suspense fallback={<div className="glass-card rounded-3xl p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-surface-400 mt-6">
          Automated verification for Codeforces &amp; LeetCode
        </p>
      </div>
    </div>
  );
}
