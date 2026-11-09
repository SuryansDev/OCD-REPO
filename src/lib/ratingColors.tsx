import React, { useState, useEffect } from 'react';

/**
 * Codeforces-style rating color system.
 *
 * Official Codeforces tiers & colors:
 *   - Newbie               (< 1200):     Gray        (#808080)
 *   - Pupil                (1200–1399):  Green       (#008000)
 *   - Specialist           (1400–1599):  Cyan        (#03a89e)
 *   - Expert               (1600–1899):  Blue        (#0000ff)
 *   - Candidate Master     (1900–2099):  Purple      (#aa00aa)
 *   - Master               (2100–2299):  Orange      (#ff8c00)
 *   - International Master (2300–2399):  Orange      (#ff8c00)
 *   - Grandmaster          (2400–2599):  Red         (#ff0000)
 *   - Intl. Grandmaster    (2600–2999):  Red         (#ff0000)
 *   - Legendary GM         (≥ 3000):     Red (first character black/white)
 *
 * For LeetCode, contest ratings are mapped to equivalent tiers.
 */

export interface RatingTier {
  label: string;
  /** Tailwind text color class for light and dark modes */
  colorClass: string;
  /** Hex color for inline style fallback */
  hex: string;
  /** Whether user is Legendary Grandmaster (first character black/white, rest red) */
  isLegendaryGM?: boolean;
}

// ── Codeforces tiers ──────────────────────────────────────────

export function getCFRatingTier(rating: number | null | undefined): RatingTier {
  if (!rating || rating <= 0) {
    return { label: 'Unrated', colorClass: 'text-surface-500 dark:text-surface-400', hex: '#9ca3af' };
  }
  if (rating < 1200) {
    return { label: 'Newbie', colorClass: 'text-gray-500 dark:text-gray-400', hex: '#808080' };
  }
  if (rating < 1400) {
    return { label: 'Pupil', colorClass: 'text-green-600 dark:text-green-400', hex: '#008000' };
  }
  if (rating < 1600) {
    return { label: 'Specialist', colorClass: 'text-cyan-600 dark:text-cyan-400', hex: '#03a89e' };
  }
  if (rating < 1900) {
    return { label: 'Expert', colorClass: 'text-blue-600 dark:text-blue-400', hex: '#0000ff' };
  }
  if (rating < 2100) {
    return { label: 'Candidate Master', colorClass: 'text-purple-600 dark:text-purple-400', hex: '#aa00aa' };
  }
  if (rating < 2300) {
    return { label: 'Master', colorClass: 'text-orange-500 dark:text-orange-400', hex: '#ff8c00' };
  }
  if (rating < 2400) {
    return { label: 'Intl. Master', colorClass: 'text-orange-500 dark:text-orange-400', hex: '#ff8c00' };
  }
  if (rating < 3000) {
    return { label: 'Grandmaster', colorClass: 'text-red-600 dark:text-red-500', hex: '#ff0000' };
  }
  return {
    label: 'Legendary GM',
    colorClass: 'text-red-600 dark:text-red-500',
    hex: '#ff0000',
    isLegendaryGM: true,
  };
}

// ── LeetCode tiers (approximate CF equivalent) ─────────────────

export function getLCRatingTier(rating: number | null | undefined): RatingTier {
  if (!rating || rating <= 0) {
    return { label: 'Unrated', colorClass: 'text-surface-500 dark:text-surface-400', hex: '#9ca3af' };
  }
  if (rating < 1400) {
    return { label: 'Beginner', colorClass: 'text-gray-500 dark:text-gray-400', hex: '#808080' };
  }
  if (rating < 1600) {
    return { label: 'Apprentice', colorClass: 'text-green-600 dark:text-green-400', hex: '#008000' };
  }
  if (rating < 1800) {
    return { label: 'Competent', colorClass: 'text-cyan-600 dark:text-cyan-400', hex: '#03a89e' };
  }
  if (rating < 2000) {
    return { label: 'Proficient', colorClass: 'text-blue-600 dark:text-blue-400', hex: '#0000ff' };
  }
  if (rating < 2200) {
    return { label: 'Knight', colorClass: 'text-purple-600 dark:text-purple-400', hex: '#aa00aa' };
  }
  if (rating < 2400) {
    return { label: 'Expert', colorClass: 'text-orange-500 dark:text-orange-400', hex: '#ff8c00' };
  }
  return { label: 'Guardian', colorClass: 'text-red-600 dark:text-red-500', hex: '#ff0000' };
}

export interface LeaderboardTierResult extends RatingTier {
  rating?: number | null;
  platform: 'cf' | 'lc' | 'none';
}

/**
 * Determines the active rating tier for a leaderboard row based on
 * the active tab and the user's available ratings.
 */
export function getLeaderboardTier(
  tab: string,
  entry: {
    cf_rating?: number | null;
    lc_rating?: number | null;
    cf_max_rating?: number | null;
    cf_latest_contest_rating?: number | null;
  },
): LeaderboardTierResult {
  if (tab === 'cf_rating' || tab === 'cf_contest') {
    const rating = entry.cf_rating ?? entry.cf_latest_contest_rating ?? null;
    const tier = getCFRatingTier(rating);
    return { ...tier, rating, platform: rating ? 'cf' : 'none' };
  }
  if (tab === 'lc_rating' || tab === 'lc_contest') {
    const rating = entry.lc_rating ? Math.round(entry.lc_rating) : null;
    const tier = getLCRatingTier(rating);
    return { ...tier, rating, platform: rating ? 'lc' : 'none' };
  }

  // For streak / total_solved tabs, prefer CF rating if present, else LC rating
  if (entry.cf_rating && entry.cf_rating > 0) {
    const tier = getCFRatingTier(entry.cf_rating);
    return { ...tier, rating: entry.cf_rating, platform: 'cf' };
  }
  if (entry.lc_rating && entry.lc_rating > 0) {
    const rating = Math.round(entry.lc_rating);
    const tier = getLCRatingTier(rating);
    return { ...tier, rating, platform: 'lc' };
  }

  return {
    label: 'Unrated',
    colorClass: 'text-surface-700 dark:text-surface-300',
    hex: '#9ca3af',
    isLegendaryGM: false,
    rating: null,
    platform: 'none',
  };
}

/**
 * Returns the Tailwind text color class for a leaderboard name.
 */
export function getLeaderboardNameColor(
  tab: string,
  entry: { cf_rating?: number | null; lc_rating?: number | null; cf_max_rating?: number | null },
): string {
  const result = getLeaderboardTier(tab, entry);
  return result.colorClass;
}

// ── Rating Color Display Preferences ────────────────────────────

export const RATING_COLOR_STORAGE_KEY = 'ocd_show_rating_colors';
export const RATING_COLOR_EVENT = 'ocd_rating_color_preference_changed';

/**
 * Returns whether rating colors are enabled for participant handles and banners.
 * Default is FALSE (off).
 */
export function getRatingColorPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = localStorage.getItem(RATING_COLOR_STORAGE_KEY);
    // Explicitly off by default unless user has enabled it
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Updates the user's preference for leaderboard rating colors in localStorage
 * and dispatches a window event so all open pages/components react immediately.
 */
export function setRatingColorPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RATING_COLOR_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(RATING_COLOR_EVENT, { detail: enabled }));
  } catch {}
}

/**
 * React hook to read and update the leaderboard rating color preference.
 * Defaults to false (off).
 */
export function useRatingColorPreference(): [boolean, (val: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(getRatingColorPreference());

    const handleEvent = (e: any) => {
      if (e?.detail !== undefined) {
        setEnabled(Boolean(e.detail));
      } else {
        setEnabled(getRatingColorPreference());
      }
    };

    window.addEventListener(RATING_COLOR_EVENT, handleEvent);
    window.addEventListener('storage', handleEvent);
    return () => {
      window.removeEventListener(RATING_COLOR_EVENT, handleEvent);
      window.removeEventListener('storage', handleEvent);
    };
  }, []);

  const update = (val: boolean) => {
    setRatingColorPreference(val);
    setEnabled(val);
  };

  return [enabled, update];
}

/**
 * Renders a user's name with Codeforces-style rank coloring.
 * If enabled is false (the default), renders standard text styling.
 * If the user is Legendary GM (≥ 3000), the first character is styled in black/white.
 */
export function RatingColoredName({
  name,
  tier,
  enabled = true,
  className = '',
}: {
  name: string;
  tier: RatingTier;
  enabled?: boolean;
  className?: string;
}) {
  if (!enabled) {
    return (
      <span className={`text-surface-900 dark:text-surface-100 font-semibold transition-colors ${className}`}>
        {name}
      </span>
    );
  }

  if (tier.isLegendaryGM && name && name.length > 0) {
    return (
      <span className={`inline-flex items-baseline ${className}`}>
        <span className="text-surface-900 dark:text-surface-100 font-extrabold">{name.charAt(0)}</span>
        <span className="text-red-600 dark:text-red-500 font-bold">{name.slice(1)}</span>
      </span>
    );
  }

  return (
    <span className={`${tier.colorClass} font-semibold transition-colors ${className}`}>
      {name}
    </span>
  );
}
