'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Code2, LogOut } from 'lucide-react';
import type { UserRole } from '@/lib/types';
import DarkModeToggle from '@/components/DarkModeToggle';
import { clearDashboardCache } from '@/lib/dashboardCache';

interface NavbarProps {
  fullName: string;
  role: UserRole | string;
}

export default function Navbar({ fullName, role }: NavbarProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    clearDashboardCache();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const roleLabel = role === 'common_mentor' ? 'Common Mentor' : role;
  const roleBadgeStyle =
    role === 'admin'
      ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80'
      : role === 'common_mentor'
      ? 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80'
      : 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-800/80';

  return (
    <nav className="sticky top-0 z-50 glass-card border-b border-surface-200/50 dark:border-surface-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-3 cursor-pointer">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/20">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold gradient-text">OCD</span>
              <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${roleBadgeStyle}`}>
                {roleLabel}
              </span>
            </div>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{fullName}</p>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 capitalize">{roleLabel} Dashboard</p>
            </div>
            <DarkModeToggle />
            <button
              onClick={() => router.push('/profile')}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer"
              title="View Profile"
            >
              {fullName?.charAt(0)?.toUpperCase() || '?'}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
