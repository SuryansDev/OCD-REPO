import { cn } from '@/lib/utils';
import type { Platform } from '@/lib/types';

interface PlatformBadgeProps {
  platform: Platform;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function PlatformBadge({ platform, size = 'md', className }: PlatformBadgeProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl font-bold text-white shadow-lg',
        platform === 'Codeforces' ? 'platform-cf shadow-blue-500/25' : 'platform-lc shadow-amber-400/25',
        sizeClasses[size],
        className
      )}
    >
      {platform === 'Codeforces' ? 'CF' : 'LC'}
    </div>
  );
}
