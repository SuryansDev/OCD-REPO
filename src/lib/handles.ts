/**
 * Coding platform handle sanitization and canonical link utilities
 */

const PLACEHOLDER_STRINGS = new Set(['', '--', 'null', 'none', 'n/a', '-', 'nil', 'undefined', 'not set']);

/**
 * Clean and extract a Codeforces username from raw inputs
 * (handles full URLs, trailing slashes, query params, @ handles, and placeholders)
 */
export function cleanCodeforcesHandle(raw?: string | null): string {
  if (!raw) return '';
  let s = raw.trim();
  if (PLACEHOLDER_STRINGS.has(s.toLowerCase())) return '';

  // Extract from URL if student pasted a full profile link
  if (s.toLowerCase().includes('codeforces.com/')) {
    const match = s.match(/codeforces\.com\/profile\/([a-zA-Z0-9_\-\.]+)/i);
    if (match) return match[1];
    // Fallback if URL is codeforces.com/tourist
    const altMatch = s.match(/codeforces\.com\/([a-zA-Z0-9_\-\.]+)/i);
    if (altMatch && !['profile', 'contest', 'gym', 'problemset'].includes(altMatch[1].toLowerCase())) {
      return altMatch[1];
    }
  }

  // Strip leading @, slashes, or trailing punctuation
  s = s.replace(/^[@\/\\]+/, '').replace(/[\/\\]+$/, '');
  if (PLACEHOLDER_STRINGS.has(s.toLowerCase())) return '';
  return s;
}

/**
 * Clean and extract a LeetCode username from raw inputs
 * (handles full URLs, /u/ paths, typos like leetcpde.com, @ handles, and placeholders)
 */
export function cleanLeetCodeHandle(raw?: string | null): string {
  if (!raw) return '';
  let s = raw.trim();
  if (PLACEHOLDER_STRINGS.has(s.toLowerCase())) return '';

  // Extract from URL (handles leetcode.com/u/user or leetcode.com/user, including common typos)
  if (s.toLowerCase().includes('leetcode.com/') || s.toLowerCase().includes('leetcpde.com/')) {
    const match = s.match(/(?:leetcode|leetcpde)\.com\/(?:u\/)?([a-zA-Z0-9_\-\.]+)/i);
    if (match) return match[1];
  }

  // Strip leading @, slashes, or trailing punctuation
  s = s.replace(/^[@\/\\]+/, '').replace(/[\/\\]+$/, '');
  if (PLACEHOLDER_STRINGS.has(s.toLowerCase())) return '';
  return s;
}

/**
 * Returns canonical Codeforces profile URL or null if handle is missing
 */
export function getCodeforcesProfileUrl(raw?: string | null): string | null {
  const handle = cleanCodeforcesHandle(raw);
  return handle ? `https://codeforces.com/profile/${encodeURIComponent(handle)}` : null;
}

/**
 * Returns canonical LeetCode profile URL or null if handle is missing
 */
export function getLeetCodeProfileUrl(raw?: string | null): string | null {
  const handle = cleanLeetCodeHandle(raw);
  return handle ? `https://leetcode.com/u/${encodeURIComponent(handle)}/` : null;
}
