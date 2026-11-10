import type { UserProfile, Task, ScheduledTask } from '@/lib/types';

export interface DashboardCacheData {
  profile: UserProfile | null;
  myTasks: Task[];
  myMentees: UserProfile[];
  myMentors: UserProfile[];
  assignedTasks: any[];
  menteeAllTasks: any[];
  allUsers: UserProfile[];
  pendingRequests: any[];
  incomingRequests: any[];
  scheduledTasks: ScheduledTask[];
  leaderboardData: any[];
  latestContests: {
    lc?: { title?: string; titleSlug?: string; startTime?: string; duration?: number };
    cf?: { id?: number; name?: string; relatedNames?: string[]; startTime?: string; totalContestParticipants?: number | null };
  };
  timestamp: number;
}

let memoryCache: DashboardCacheData | null = null;
const CACHE_KEY = 'ocd_dashboard_cache';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache validity

export function getDashboardCache(): DashboardCacheData | null {
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL_MS) {
    return memoryCache;
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: DashboardCacheData = JSON.parse(raw);
    if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
      memoryCache = parsed;
      return parsed;
    }
  } catch {
    // ignore parse or storage errors
  }
  return null;
}

export function setDashboardCache(data: Partial<DashboardCacheData>) {
  const current = getDashboardCache() || {
    profile: null,
    myTasks: [],
    myMentees: [],
    myMentors: [],
    assignedTasks: [],
    menteeAllTasks: [],
    allUsers: [],
    pendingRequests: [],
    incomingRequests: [],
    scheduledTasks: [],
    leaderboardData: [],
    latestContests: {},
    timestamp: Date.now(),
  };

  const updated: DashboardCacheData = {
    ...current,
    ...data,
    timestamp: Date.now(),
  };

  memoryCache = updated;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated));
    } catch {
      // ignore quota exceeded or security errors
    }
  }
}

export function updateCachedProfile(updatedProfile: Partial<UserProfile>) {
  const current = getDashboardCache();
  if (current && current.profile) {
    setDashboardCache({
      profile: {
        ...current.profile,
        ...updatedProfile,
      },
    });
  }
}

export function clearDashboardCache() {
  memoryCache = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
  }
}
