'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function DarkModeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`w-9 h-9 rounded-xl border border-transparent ${className}`}
        aria-hidden="true"
      />
    );
  }

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // If activated via keyboard (clientX/Y === 0), anchor radial wave to button center
    const x = e.clientX > 0 ? e.clientX : rect.left + rect.width / 2;
    const y = e.clientY > 0 ? e.clientY : rect.top + rect.height / 2;
    toggleTheme({ x, y });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={isDark}
      className={`group relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 cursor-pointer
        text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-50
        bg-surface-100/90 hover:bg-surface-200/90 dark:bg-surface-800/90 dark:hover:bg-surface-700/90
        border border-surface-200 hover:border-brand-300 dark:border-surface-700 dark:hover:border-amber-500/40
        shadow-sm hover:shadow active:scale-90 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${className}`}
      title={label}
      aria-label={label}
    >
      {/* Subtle ambient glow on hover */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
          isDark
            ? 'bg-gradient-to-br from-amber-400/15 via-transparent to-orange-500/15'
            : 'bg-gradient-to-br from-brand-500/15 via-transparent to-indigo-500/15'
        }`}
      />

      {/* Sun icon (visible in dark mode -> switch to light) */}
      <Sun
        className={`w-4 h-4 text-amber-400 absolute transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDark
            ? 'opacity-100 rotate-0 scale-100 group-hover:rotate-45'
            : 'opacity-0 rotate-90 scale-50 pointer-events-none'
        }`}
      />

      {/* Moon icon (visible in light mode -> switch to dark) */}
      <Moon
        className={`w-4 h-4 text-brand-600 absolute transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDark
            ? 'opacity-0 -rotate-90 scale-50 pointer-events-none'
            : 'opacity-100 rotate-0 scale-100 group-hover:-rotate-12'
        }`}
      />
    </button>
  );
}
