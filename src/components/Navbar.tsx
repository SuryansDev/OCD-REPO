'use client';

import { createClient } from '@/lib/supabase/client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Code2, LogOut, LayoutDashboard, Shield, User } from 'lucide-react';
import type { UserRole } from '@/lib/types';
import DarkModeToggle from '@/components/DarkModeToggle';
import { clearDashboardCache } from '@/lib/dashboardCache';

interface NavbarProps {
  fullName: string;
  role: UserRole | string;
}

export default function Navbar({ fullName, role }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
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

  const navItems = [
    ...(role === 'admin'
      ? [{ href: '/admin', label: 'Admin', icon: Shield }]
      : []),
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="sticky top-0 z-50 glass-card border-b border-surface-200/70 dark:border-surface-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Logo + Nav Links */}
          <div className="flex items-center gap-6">
            <Link
              href={role === 'admin' ? '/admin' : '/dashboard'}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/20 group-hover:scale-105 group-hover:shadow-brand-500/35 transition-all duration-200">
                <Code2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold gradient-text">OCD</span>
                <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${roleBadgeStyle}`}>
                  {roleLabel}
                </span>
              </div>
            </Link>

            {/* Quick Navigation Pills */}
            <div className="hidden md:flex items-center gap-1 bg-surface-100/80 dark:bg-surface-850/90 p-1 rounded-xl border border-surface-200/70 dark:border-surface-800">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-white dark:bg-surface-800 text-brand-600 dark:text-brand-300 shadow-sm border border-surface-200/80 dark:border-surface-700'
                        : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-white/60 dark:hover:bg-surface-800/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 leading-tight">{fullName}</p>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 capitalize">{roleLabel}</p>
            </div>
            <DarkModeToggle />
            <button
              onClick={() => router.push('/profile')}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ring-2 ring-transparent hover:ring-brand-400/30"
              title="View Profile"
              aria-label="View Profile"
            >
              {fullName?.charAt(0)?.toUpperCase() || '?'}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-surface-500 dark:text-surface-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 active:scale-95 transition-all duration-200"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
