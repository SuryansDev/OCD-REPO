import { cn } from '@/lib/utils';
import type { ContestPlatform, Platform } from '@/lib/types';
import PlatformLogo from '@/components/PlatformLogo';

interface PlatformBadgeProps {
  platform: Platform | ContestPlatform;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function PlatformBadge({ platform, size = 'md', className }: PlatformBadgeProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-11 h-11 rounded-xl',
    lg: 'w-14 h-14 rounded-2xl',
  };

  const logoSizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-7 h-7',
    lg: 'w-9 h-9',
  };

  if (platform === 'YouTube' || platform === 'CSES') {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-bold text-white shadow-sm shrink-0',
          platform === 'YouTube'
            ? 'bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/60'
            : 'bg-teal-600 text-xs',
          sizeClasses[size],
          className
        )}
      >
        {platform === 'YouTube' ? (
          <PlatformLogo platform="YouTube" className={logoSizeClasses[size]} />
        ) : (
          'CSES'
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center bg-white border border-surface-200/90 dark:border-surface-700/70 shadow-sm overflow-hidden shrink-0',
        sizeClasses[size],
        className
      )}
      title={platform}
    >
      <PlatformLogo platform={platform} className={logoSizeClasses[size]} />
    </div>
  );
}
