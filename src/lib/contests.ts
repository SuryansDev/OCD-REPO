import type {
  ContestPlatform,
  ContestsApiResponse,
  PlatformFetchStatus,
  UpcomingContest,
} from '@/lib/types';
import { CONTEST_PLATFORMS } from '@/lib/contestMeta';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const REQUEST_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FORCE_REFRESH_COOLDOWN_MS = 30 * 1000; // 30 seconds
const MAX_CONTEST_DURATION_SECONDS = 60 * 24 * 60 * 60; // Filter out permanent practice tracks (>60 days)

interface PlatformCacheEntry {
  contests: UpcomingContest[];
  fetchedAt: number;
}

let cachedResponse: ContestsApiResponse | null = null;
let cachedAtMs = 0;
let inFlightPromise: Promise<ContestsApiResponse> | null = null;
const lastGoodByPlatform = new Map<ContestPlatform, PlatformCacheEntry>();

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (match) => {
      return named[match.toLowerCase()] ?? match;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function stripTagsAndCollapse(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Codeforces ─────────────────────────────────────────────
function extractCodeforcesTag(name: string, type?: string): string | null {
  const divMatch = name.match(/\((Div\.\s*[1-4](?:\s*\+\s*Div\.\s*[1-4])?[^)]*)\)/i);
  if (divMatch) return divMatch[1].replace(/\s+/g, ' ').trim();
  if (/educational/i.test(name)) return 'Educational';
  if (/global round/i.test(name)) return 'Global';
  if (type && type !== 'CF') return type;
  return 'Rated';
}

async function fetchCodeforcesContests(nowMs: number): Promise<UpcomingContest[]> {
  const res = await fetchWithTimeout('https://codeforces.com/api/contest.list?gym=false', {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Codeforces API returned HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  if (data?.status !== 'OK' || !Array.isArray(data?.result)) {
    throw new Error(data?.comment || 'Invalid response from Codeforces API');
  }

  const contests: UpcomingContest[] = [];
  for (const c of data.result) {
    if (c?.phase !== 'BEFORE' && c?.phase !== 'CODING') continue;
    if (typeof c.startTimeSeconds !== 'number' || typeof c.durationSeconds !== 'number') continue;

    const startMs = c.startTimeSeconds * 1000;
    const endMs = (c.startTimeSeconds + c.durationSeconds) * 1000;
    if (endMs <= nowMs) continue;
    if (c.durationSeconds > MAX_CONTEST_DURATION_SECONDS) continue;

    const phase = c.phase === 'CODING' || startMs <= nowMs ? 'live' : 'upcoming';
    contests.push({
      id: `cf-${c.id}`,
      platform: 'Codeforces',
      name: String(c.name || `Codeforces Contest #${c.id}`).trim(),
      url: `https://codeforces.com/contest/${c.id}`,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds: c.durationSeconds,
      phase,
      ratedInfo: extractCodeforcesTag(String(c.name || ''), c.type),
    });
  }

  return contests;
}

// ─── AtCoder ────────────────────────────────────────────────
function parseAtCoderTimestamp(raw: string): Date | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // Normalize "2026-11-28 21:00:00+0900" -> "2026-11-28T21:00:00+09:00"
  const normalized = cleaned
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date;

  const fallback = new Date(cleaned);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseAtCoderDuration(raw: string): number {
  const match = raw.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  const hours = Number.parseInt(match[1], 10);
  const mins = Number.parseInt(match[2], 10);
  return (hours * 60 + mins) * 60;
}

function parseAtCoderTableSection(
  html: string,
  containerId: string,
  phase: 'live' | 'upcoming',
  nowMs: number
): UpcomingContest[] {
  const marker = `id="${containerId}"`;
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return [];

  const rest = html.slice(startIdx + marker.length);
  const nextSectionIdx = rest.search(/id="contest-table-/);
  const sectionHtml = nextSectionIdx === -1 ? rest : rest.slice(0, nextSectionIdx);

  const tbodyMatch = sectionHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const rows = tbodyMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const contests: UpcomingContest[] = [];

  for (const rowHtml of rows) {
    const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 3) continue;

    const timeMatch = cells[0].match(/<time[^>]*>([\s\S]*?)<\/time>/i);
    const timeText = timeMatch ? stripTagsAndCollapse(timeMatch[1]) : stripTagsAndCollapse(cells[0]);
    const startDate = parseAtCoderTimestamp(timeText);
    if (!startDate) continue;

    const linkMatch = cells[1].match(/<a[^>]*href=["'](?:https?:\/\/atcoder\.jp)?(\/contests\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const relativeHref = linkMatch[1];
    const contestSlug = relativeHref.replace(/^\/contests\//, '').replace(/\/+$/, '');
    const name = stripTagsAndCollapse(linkMatch[2]);
    if (!name || !contestSlug) continue;

    const durationText = stripTagsAndCollapse(cells[2]);
    const durationSeconds = parseAtCoderDuration(durationText);
    if (durationSeconds <= 0 || durationSeconds > MAX_CONTEST_DURATION_SECONDS) continue;

    const startMs = startDate.getTime();
    const endMs = startMs + durationSeconds * 1000;
    if (endMs <= nowMs) continue;

    const ratedRaw = cells[3] ? stripTagsAndCollapse(cells[3]) : '';
    const ratedInfo =
      !ratedRaw || ratedRaw === '-'
        ? 'Unrated'
        : ratedRaw.toLowerCase() === 'all'
        ? 'Rated: All'
        : `Rated: ${ratedRaw}`;

    contests.push({
      id: `ac-${contestSlug}`,
      platform: 'AtCoder',
      name,
      url: `https://atcoder.jp${relativeHref}`,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds,
      phase: phase === 'live' || startMs <= nowMs ? 'live' : 'upcoming',
      ratedInfo,
    });
  }

  return contests;
}

async function fetchAtCoderFromKenkooooFallback(nowMs: number): Promise<UpcomingContest[]> {
  const res = await fetchWithTimeout('https://kenkoooo.com/atcoder/resources/contests.json', {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Kenkoooo fallback returned HTTP ${res.status}`);
  }
  const list = await res.json().catch(() => null);
  if (!Array.isArray(list)) {
    throw new Error('Invalid response from AtCoder fallback');
  }

  const contests: UpcomingContest[] = [];
  for (const c of list) {
    if (typeof c?.start_epoch_second !== 'number' || typeof c?.duration_second !== 'number') continue;
    const startMs = c.start_epoch_second * 1000;
    const endMs = (c.start_epoch_second + c.duration_second) * 1000;
    if (endMs <= nowMs) continue;
    if (c.duration_second > MAX_CONTEST_DURATION_SECONDS) continue;

    contests.push({
      id: `ac-${c.id}`,
      platform: 'AtCoder',
      name: String(c.title || c.id).trim(),
      url: `https://atcoder.jp/contests/${encodeURIComponent(String(c.id))}`,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds: c.duration_second,
      phase: startMs <= nowMs ? 'live' : 'upcoming',
      ratedInfo: c.rate_change && c.rate_change !== '-' ? `Rated: ${c.rate_change}` : 'Unrated',
    });
  }
  return contests;
}

async function fetchAtCoderContests(nowMs: number): Promise<UpcomingContest[]> {
  try {
    const res = await fetchWithTimeout('https://atcoder.jp/contests/?lang=en', {
      headers: {
        ...DEFAULT_HEADERS,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      throw new Error(`AtCoder returned HTTP ${res.status}`);
    }
    const html = await res.text();
    if (!html.includes('contest-table-upcoming') && !html.includes('contest-table-action')) {
      throw new Error('AtCoder contests table markup was not found');
    }

    const active = parseAtCoderTableSection(html, 'contest-table-action', 'live', nowMs);
    const upcoming = parseAtCoderTableSection(html, 'contest-table-upcoming', 'upcoming', nowMs);

    const seen = new Set<string>();
    const combined: UpcomingContest[] = [];
    for (const contest of [...active, ...upcoming]) {
      if (seen.has(contest.id)) continue;
      seen.add(contest.id);
      combined.push(contest);
    }
    return combined;
  } catch (primaryErr) {
    try {
      return await fetchAtCoderFromKenkooooFallback(nowMs);
    } catch {
      throw primaryErr;
    }
  }
}

// ─── CodeChef ───────────────────────────────────────────────
function parseCodeChefDate(iso?: string | null, raw?: string | null): Date | null {
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (!raw) return null;

  const trimmed = raw.trim().replace(/\s+/g, ' ');
  // Handle "2026-12-02 20:00:00" as IST (+05:30)
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const normalized = trimmed.replace(' ', 'T');
    const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
      ? `${normalized}:00`
      : normalized;
    const parsed = new Date(`${withSeconds}+05:30`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  // Handle "02 Dec 2026 20:00:00" as IST
  const parsedWithIst = new Date(`${trimmed} GMT+0530`);
  if (!Number.isNaN(parsedWithIst.getTime())) return parsedWithIst;

  const direct = new Date(trimmed);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function parseCodeChefList(
  items: any[],
  defaultPhase: 'live' | 'upcoming',
  nowMs: number
): UpcomingContest[] {
  const contests: UpcomingContest[] = [];
  for (const item of items) {
    const code = item?.contest_code ? String(item.contest_code).trim() : '';
    const name = item?.contest_name ? String(item.contest_name).trim() : '';
    if (!code || !name) continue;

    const startDate = parseCodeChefDate(item.contest_start_date_iso, item.contest_start_date);
    if (!startDate) continue;

    const endDate = parseCodeChefDate(item.contest_end_date_iso, item.contest_end_date);
    const parsedMinutes = Number(item.contest_duration);

    let durationSeconds =
      Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? Math.round(parsedMinutes * 60) : 0;
    if (durationSeconds <= 0 && endDate) {
      durationSeconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
    }
    if (durationSeconds <= 0 || durationSeconds > MAX_CONTEST_DURATION_SECONDS) continue;

    const startMs = startDate.getTime();
    const endMs = endDate ? endDate.getTime() : startMs + durationSeconds * 1000;
    if (endMs <= nowMs) continue;

    const phase = defaultPhase === 'live' || startMs <= nowMs ? 'live' : 'upcoming';
    const ratedInfo =
      item.rated === true
        ? 'Rated'
        : item.rated === false
        ? 'Unrated'
        : /starters/i.test(name)
        ? 'Starters'
        : null;

    contests.push({
      id: `cc-${code}`,
      platform: 'CodeChef',
      name,
      url: `https://www.codechef.com/${encodeURIComponent(code)}`,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds,
      phase,
      ratedInfo,
    });
  }
  return contests;
}

async function fetchCodeChefContests(nowMs: number): Promise<UpcomingContest[]> {
  const res = await fetchWithTimeout(
    'https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all',
    {
      headers: {
        ...DEFAULT_HEADERS,
        Accept: 'application/json',
        Referer: 'https://www.codechef.com/contests',
      },
    }
  );

  if (!res.ok) {
    throw new Error(`CodeChef API returned HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  if (!data || (!Array.isArray(data.future_contests) && !Array.isArray(data.present_contests))) {
    throw new Error(data?.message || 'Invalid response from CodeChef API');
  }

  const present = Array.isArray(data.present_contests)
    ? parseCodeChefList(data.present_contests, 'live', nowMs)
    : [];
  const future = Array.isArray(data.future_contests)
    ? parseCodeChefList(data.future_contests, 'upcoming', nowMs)
    : [];

  const seen = new Set<string>();
  const combined: UpcomingContest[] = [];
  for (const contest of [...present, ...future]) {
    if (seen.has(contest.id)) continue;
    seen.add(contest.id);
    combined.push(contest);
  }
  return combined;
}

// ─── LeetCode ───────────────────────────────────────────────
async function queryLeetCodeGraphQL(query: string) {
  const res = await fetchWithTimeout('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...DEFAULT_HEADERS,
      Referer: 'https://leetcode.com/contest/',
      Origin: 'https://leetcode.com',
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL returned HTTP ${res.status}`);
  }

  return res.json().catch(() => null);
}

async function fetchLeetCodeContests(nowMs: number): Promise<UpcomingContest[]> {
  let rawContests: any[] | null = null;

  try {
    const primaryData = await queryLeetCodeGraphQL(`
      query upcomingContests {
        upcomingContests {
          title
          titleSlug
          startTime
          duration
        }
      }
    `);
    if (Array.isArray(primaryData?.data?.upcomingContests)) {
      rawContests = primaryData.data.upcomingContests;
    }
  } catch {
    // Fallback to allContests query below
  }

  if (!rawContests) {
    const fallbackData = await queryLeetCodeGraphQL(`
      query {
        allContests {
          title
          titleSlug
          startTime
          duration
        }
      }
    `);
    const allContests = fallbackData?.data?.allContests;
    if (!Array.isArray(allContests)) {
      throw new Error(fallbackData?.errors?.[0]?.message || 'Invalid response from LeetCode API');
    }
    rawContests = allContests;
  }

  const seen = new Set<string>();
  const contests: UpcomingContest[] = [];
  for (const c of rawContests || []) {
    if (!c?.titleSlug || typeof c.startTime !== 'number' || typeof c.duration !== 'number') continue;
    const startMs = c.startTime * 1000;
    const endMs = (c.startTime + c.duration) * 1000;
    if (endMs <= nowMs) continue;
    if (c.duration > MAX_CONTEST_DURATION_SECONDS) continue;

    const id = `lc-${c.titleSlug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const lowerSlug = String(c.titleSlug).toLowerCase();
    const ratedInfo = lowerSlug.includes('biweekly')
      ? 'Biweekly'
      : lowerSlug.includes('weekly')
      ? 'Weekly'
      : null;

    contests.push({
      id,
      platform: 'LeetCode',
      name: String(c.title || c.titleSlug).trim(),
      url: `https://leetcode.com/contest/${encodeURIComponent(String(c.titleSlug))}/`,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds: c.duration,
      phase: startMs <= nowMs ? 'live' : 'upcoming',
      ratedInfo,
    });
  }

  return contests;
}

// ─── Aggregator & Cache ─────────────────────────────────────
async function fetchAllUpcomingContestsUncached(): Promise<ContestsApiResponse> {
  const nowMs = Date.now();
  const fetchers: Array<{
    platform: ContestPlatform;
    fn: () => Promise<UpcomingContest[]>;
  }> = [
    { platform: 'Codeforces', fn: () => fetchCodeforcesContests(nowMs) },
    { platform: 'AtCoder', fn: () => fetchAtCoderContests(nowMs) },
    { platform: 'CodeChef', fn: () => fetchCodeChefContests(nowMs) },
    { platform: 'LeetCode', fn: () => fetchLeetCodeContests(nowMs) },
  ];

  const settled = await Promise.allSettled(fetchers.map((f) => f.fn()));
  const allContests: UpcomingContest[] = [];
  const platformStatuses: PlatformFetchStatus[] = [];

  settled.forEach((result, index) => {
    const platform = fetchers[index].platform;
    if (result.status === 'fulfilled') {
      const fresh = result.value;
      lastGoodByPlatform.set(platform, { contests: fresh, fetchedAt: nowMs });
      allContests.push(...fresh);
      platformStatuses.push({
        platform,
        ok: true,
        count: fresh.length,
      });
    } else {
      const errorMsg = result.reason?.message || 'Failed to load contests';
      const fallback = lastGoodByPlatform.get(platform);
      if (fallback) {
        const stillRelevant = fallback.contests
          .filter((c) => new Date(c.endTime).getTime() > nowMs)
          .map((c) => ({
            ...c,
            phase: (new Date(c.startTime).getTime() <= nowMs ? 'live' : 'upcoming') as 'live' | 'upcoming',
          }));
        allContests.push(...stillRelevant);
        platformStatuses.push({
          platform,
          ok: false,
          stale: true,
          count: stillRelevant.length,
          error: errorMsg,
        });
      } else {
        platformStatuses.push({
          platform,
          ok: false,
          count: 0,
          error: errorMsg,
        });
      }
    }
  });

  // Sort: live contests first (ending soonest), then upcoming sorted chronologically
  allContests.sort((a, b) => {
    if (a.phase !== b.phase) {
      return a.phase === 'live' ? -1 : 1;
    }
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  const payload: ContestsApiResponse = {
    contests: allContests,
    platformStatuses,
    fetchedAt: new Date(nowMs).toISOString(),
    cached: false,
  };

  // Only populate full response cache if at least one platform succeeded
  if (platformStatuses.some((s) => s.ok)) {
    cachedResponse = payload;
    cachedAtMs = nowMs;
  }

  return payload;
}

export async function getUpcomingContests(forceRefresh = false): Promise<ContestsApiResponse> {
  const nowMs = Date.now();

  if (cachedResponse) {
    const ageMs = nowMs - cachedAtMs;
    const withinCooldown = forceRefresh && ageMs < FORCE_REFRESH_COOLDOWN_MS;
    if ((!forceRefresh && ageMs < CACHE_TTL_MS) || withinCooldown) {
      // Re-evaluate live/upcoming phase and drop already ended contests against current clock
      const freshContests = cachedResponse.contests
        .filter((c) => new Date(c.endTime).getTime() > nowMs)
        .map((c) => ({
          ...c,
          phase: (new Date(c.startTime).getTime() <= nowMs ? 'live' : 'upcoming') as 'live' | 'upcoming',
        }));
      return {
        ...cachedResponse,
        contests: freshContests,
        cached: true,
      };
    }
  }

  if (!inFlightPromise) {
    inFlightPromise = fetchAllUpcomingContestsUncached().finally(() => {
      inFlightPromise = null;
    });
  }

  return inFlightPromise;
}
