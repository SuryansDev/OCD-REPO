'use client';

import { LogOut, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import DarkModeToggle from '@/components/DarkModeToggle';

export default function PendingPage() {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4 relative overflow-hidden transition-colors duration-150">
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-brand-50/60 to-surface-100 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950" />
      <div className="absolute top-0 left-0 w-[450px] h-[450px] bg-brand-200/25 dark:bg-brand-900/15 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-amber-200/20 dark:bg-amber-900/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-pulse-slow" />

      <div className="absolute top-4 right-4 z-20">
        <DarkModeToggle />
      </div>

      <div className="relative z-10 max-w-md w-full glass-card rounded-3xl p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-950/60 mb-6 border border-amber-200/60 dark:border-amber-800/60">
          <Clock className="w-10 h-10 text-amber-500 dark:text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">Approval Pending</h1>
        <p className="text-surface-500 dark:text-surface-400 mb-8 text-sm leading-relaxed">
          Your account has been created successfully but is currently waiting for administrator approval. Please check back later.
        </p>
        <button onClick={handleLogout} className="btn-secondary w-full">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
