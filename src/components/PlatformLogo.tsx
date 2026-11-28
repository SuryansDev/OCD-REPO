'use client';

import type { ContestPlatform, Platform } from '@/lib/types';
import { cn } from '@/lib/utils';

type AnyPlatform = Platform | ContestPlatform;

interface PlatformLogoProps {
  platform: AnyPlatform;
  className?: string;
  framed?: boolean;
}

/**
 * Renders the official logo for each coding platform.
 * When `framed` is true, renders inside a crisp white surface so dark-ink
 * logos and JPEG assets remain legible in dark mode.
 */
export default function PlatformLogo({
  platform,
  className,
  framed = false,
}: PlatformLogoProps) {
  const renderMark = () => {
    if (platform === 'Codeforces') {
      return (
        <svg
          viewBox="0 0 24 24"
          aria-label="Codeforces"
          className={cn(framed ? 'w-full h-full' : 'w-5 h-5 shrink-0', !framed && className)}
        >
          <rect x="0" y="7.5" width="6" height="13.5" rx="1.5" fill="#F4B400" />
          <rect x="9" y="3" width="6" height="18" rx="1.5" fill="#1F8ACB" />
          <rect x="18" y="10.5" width="6" height="10.5" rx="1.5" fill="#D32F2F" />
        </svg>
      );
    }

    if (platform === 'AtCoder') {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logos/atcoder.png"
          alt="AtCoder"
          className={cn(
            'object-contain shrink-0',
            framed ? 'w-full h-full' : 'w-5 h-5',
            !framed && className
          )}
        />
      );
    }

    if (platform === 'CodeChef') {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logos/codechef.jpg"
          alt="CodeChef"
          className={cn(
            'object-cover scale-110 shrink-0',
            framed ? 'w-full h-full rounded-[3px]' : 'w-5 h-5 rounded-[4px]',
            !framed && className
          )}
        />
      );
    }

    if (platform === 'LeetCode') {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logos/leetcode.png"
          alt="LeetCode"
          className={cn(
            'object-contain shrink-0',
            framed ? 'w-full h-full' : 'w-5 h-5',
            !framed && className
          )}
        />
      );
    }

    if (platform === 'YouTube') {
      return (
        <svg
          viewBox="0 0 24 24"
          aria-label="YouTube"
          className={cn(framed ? 'w-full h-full' : 'w-5 h-5 shrink-0', !framed && className)}
        >
          <path
            fill="#FF0000"
            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
          />
          <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    }

    return (
      <span
        aria-label="CSES"
        className={cn(
          'inline-flex items-center justify-center rounded text-[9px] font-black bg-teal-600 text-white shrink-0',
          framed ? 'w-full h-full' : 'w-5 h-5',
          !framed && className
        )}
      >
        CSES
      </span>
    );
  };

  if (framed) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center bg-white rounded-md p-[2px] overflow-hidden ring-1 ring-black/5 dark:ring-white/15 shrink-0',
          className
        )}
      >
        {renderMark()}
      </span>
    );
  }

  return renderMark();
}
