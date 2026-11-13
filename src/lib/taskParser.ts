import type { Platform } from '@/lib/types';
import { extractCsesTaskId, getCsesTaskUrl, formatCsesTaskTitle } from '@/lib/cses';

export interface ParsedTaskLink {
  platform: Platform;
  problemSlugOrId: string;
}

export function parseTaskLink(link: string): ParsedTaskLink | null {
  if (!link || typeof link !== 'string') return null;

  const trimmed = link.trim();

  // Check CSES shorthand or task ID first (e.g. cses: 1068, cses 1068)
  const csesId = extractCsesTaskId(trimmed);
  if (csesId) {
    return {
      platform: 'CSES',
      problemSlugOrId: csesId,
    };
  }

  try {
    const normalizedLink = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(normalizedLink);
    if (url.hostname.includes('codeforces.com')) {
      // Match contest / gym: /contest/1800/problem/A or /gym/104000/problem/B
      const contestMatch = link.match(/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
      // Match problemset: /problemset/problem/1800/A
      const problemsetMatch = link.match(/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
      // Fallback: /problem/1800/A
      const fallbackMatch = link.match(/problem\/(\d+)\/([A-Za-z0-9]+)/i);

      const match = contestMatch || problemsetMatch || fallbackMatch;
      if (match) {
        return {
          platform: 'Codeforces',
          problemSlugOrId: `${match[1]}${match[2].toUpperCase()}`,
        };
      }
    } else if (url.hostname.includes('leetcode.com')) {
      // Match clean problem slug (e.g. /problems/two-sum/ or /problems/two-sum?envType=...)
      const match = link.match(/problems\/([a-zA-Z0-9\-]+)/);
      if (match) {
        return {
          platform: 'LeetCode',
          problemSlugOrId: match[1].toLowerCase(),
        };
      }
    } else if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      let problemSlugOrId = '';
      if (url.hostname.includes('youtu.be')) {
        const id = url.pathname.replace(/^\/+/, '').split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else if (url.pathname.includes('/shorts/')) {
        const id = url.pathname.split('/shorts/')[1]?.split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else if (url.pathname.includes('/embed/')) {
        const id = url.pathname.split('/embed/')[1]?.split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else if (url.pathname.includes('/live/')) {
        const id = url.pathname.split('/live/')[1]?.split(/[\/\?#]/)[0];
        if (id) problemSlugOrId = id;
      } else {
        const id = url.searchParams.get('v');
        if (id) {
          problemSlugOrId = id;
        } else {
          const parts = url.pathname.replace(/^\/+/, '').split(/[\/\?#]/);
          if (parts.length > 0 && parts[0]) problemSlugOrId = parts[0];
        }
      }
      if (problemSlugOrId) {
        return {
          platform: 'YouTube',
          problemSlugOrId,
        };
      }
    } else if (url.hostname.includes('cses.fi')) {
      const parsedCsesId = extractCsesTaskId(trimmed);
      if (parsedCsesId) {
        return {
          platform: 'CSES',
          problemSlugOrId: parsedCsesId,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Returns the external web link to a problem or video for any platform.
 */
export function getTaskLink(task: { platform: string; problem_slug_or_id: string }): string {
  const cleanId = (task.problem_slug_or_id || '').replace(/::year:.*$/, '');
  if (task.platform === 'LeetCode') {
    return `https://leetcode.com/problems/${cleanId}`;
  } else if (task.platform === 'Codeforces') {
    const match = cleanId.match(/^(\d+)([A-Za-z]\d*)$/);
    if (match) {
      return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
    } else if (cleanId.includes('/')) {
      const parts = cleanId.split('/');
      return `https://codeforces.com/problemset/problem/${parts[0]}/${parts[1]}`;
    }
    return `https://codeforces.com/problemset/problem/${cleanId}`;
  } else if (task.platform === 'YouTube') {
    return `https://www.youtube.com/watch?v=${cleanId}`;
  } else if (task.platform === 'CSES') {
    return getCsesTaskUrl(cleanId);
  }
  return '#';
}

/**
 * Formats a problem slug or identifier into a human-readable title.
 */
export function formatProblemTitle(slugOrId: string, platform: string): string {
  const cleanSlug = (slugOrId || '').replace(/::year:.*$/, '');
  if (platform === 'LeetCode') {
    return cleanSlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } else if (platform === 'YouTube') {
    return `Video: ${cleanSlug}`;
  } else if (platform === 'CSES') {
    return formatCsesTaskTitle(cleanSlug);
  }
  return cleanSlug;
}

/**
 * Extracts target year from either the target_year column or legacy ::year: slug suffix.
 */
export function extractTargetYear(task: { target_year?: string | null; problem_slug_or_id: string }): string | null {
  if (task.target_year) return task.target_year;
  if (task.problem_slug_or_id && task.problem_slug_or_id.includes('::year:')) {
    const parts = task.problem_slug_or_id.split('::year:');
    return parts[1] || null;
  }
  return null;
}


