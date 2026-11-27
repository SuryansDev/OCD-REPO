'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme, origin?: ThemeTransitionOrigin) => void;
  toggleTheme: (origin?: ThemeTransitionOrigin) => void;
}

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveIsDark(themeValue: Theme): boolean {
  if (themeValue === 'dark') return true;
  if (themeValue === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeClass(isDark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);
  const transitionIdRef = useRef(0);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const initialTheme: Theme =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';

    setThemeState(initialTheme);

    const isDark = resolveIsDark(initialTheme);
    setResolvedTheme(isDark ? 'dark' : 'light');
    applyThemeClass(isDark);
    setMounted(true);

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  // Listen for system preference changes when theme === 'system'
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const isDark = mediaQuery.matches;
        setResolvedTheme(isDark ? 'dark' : 'light');
        applyThemeClass(isDark);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  const runAnimatedThemeSwitch = (
    targetIsDark: boolean,
    commitState: () => void,
    origin?: ThemeTransitionOrigin
  ) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      commitState();
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const currentIsDark = document.documentElement.classList.contains('dark');

    // If reduced motion is enabled or visual theme isn't changing, apply immediately
    if (prefersReducedMotion || targetIsDark === currentIsDark) {
      commitState();
      applyThemeClass(targetIsDark);
      return;
    }

    const doc = document as DocumentWithViewTransition;
    const root = document.documentElement;

    // Progressive enhancement: smooth radial clip-path reveal via View Transitions API
    if (typeof doc.startViewTransition === 'function') {
      const currentId = ++transitionIdRef.current;
      const x = origin?.x ?? window.innerWidth - 36;
      const y = origin?.y ?? 32;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      try {
        root.classList.add('theme-transitioning');
        const transition = doc.startViewTransition(() => {
          flushSync(() => {
            commitState();
          });
          applyThemeClass(targetIsDark);
        });

        transition.ready
          .then(() => {
            if (transitionIdRef.current !== currentId) return;
            root.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
              },
              {
                duration: 480,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                pseudoElement: '::view-transition-new(root)',
              }
            );
          })
          .catch(() => {});

        transition.finished
          .finally(() => {
            if (transitionIdRef.current === currentId) {
              root.classList.remove('theme-transitioning');
            }
          });
        return;
      } catch {
        root.classList.remove('theme-transitioning');
      }
    }

    // Fallback: smooth CSS property transition across surfaces & text
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    root.classList.add('theme-smooth-transition');
    commitState();
    applyThemeClass(targetIsDark);
    fallbackTimerRef.current = setTimeout(() => {
      root.classList.remove('theme-smooth-transition');
    }, 420);
  };

  const setTheme = (newTheme: Theme, origin?: ThemeTransitionOrigin) => {
    try {
      localStorage.setItem('theme', newTheme);
    } catch {}

    const isDark = resolveIsDark(newTheme);

    runAnimatedThemeSwitch(
      isDark,
      () => {
        setThemeState(newTheme);
        setResolvedTheme(isDark ? 'dark' : 'light');
      },
      origin
    );
  };

  const toggleTheme = (origin?: ThemeTransitionOrigin) => {
    const nextTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme, origin);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
