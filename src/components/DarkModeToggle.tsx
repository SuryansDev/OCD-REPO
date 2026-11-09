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

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer
        text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-50
        bg-surface-100 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700
        border border-surface-200 dark:border-surface-700 shadow-xs active:scale-95 ${className}`}
      title={label}
      aria-label={label}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-brand-600 transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  );
}
