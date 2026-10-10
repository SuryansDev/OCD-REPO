'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Code2, LogOut } from 'lucide-react';

interface NavbarProps {
  fullName: string;
  role: 'admin' | 'user';
}

export default function Navbar({ fullName, role }: NavbarProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <nav className="sticky top-0 z-50 glass-card border-b border-surface-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/20">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold gradient-text">OCD</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider">
                {role}
              </span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-surface-900">{fullName}</p>
              <p className="text-[11px] text-surface-300 capitalize">{role} Dashboard</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-surface-300 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
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
