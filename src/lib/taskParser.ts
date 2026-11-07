import type { Platform } from '@/lib/types';
import { extractCsesTaskId } from '@/lib/cses';

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

