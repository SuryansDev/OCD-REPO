export type UserRole = 'admin' | 'user';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type Platform = 'Codeforces' | 'LeetCode' | 'YouTube';
export type TaskStatus = 'Pending' | 'Completed';

export interface UserProfile {
  id: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  full_name: string;
  email: string;
  year: string | null;
  branch: string | null;
  contact_number: string | null;
  roll_number: string | null;
  cf_handle: string | null;
  lc_handle: string | null;
  created_at: string;
  just_promoted?: boolean;
}

export interface Mentorship {
  id: number;
  mentor_id: string;
  mentee_id: string;
  created_at: string;
}

export interface MentorshipRequest {
  id: number;
  mentor_id: string;
  mentee_id: string;
  status: ApprovalStatus;
  created_at: string;
}

export interface Task {
  id: number;
  assigned_by: string;
  assigned_to: string;
  platform: Platform;
  problem_slug_or_id: string;
  status: TaskStatus;
  assigned_date: string;
  completed_at: string | null;
  created_at: string;
}

// Extended types for joined queries
export interface TaskWithMentee extends Task {
  mentee: Pick<UserProfile, 'id' | 'full_name' | 'email' | 'cf_handle' | 'lc_handle'>;
}

export interface MentorshipWithMentee extends Mentorship {
  mentee: Pick<UserProfile, 'id' | 'full_name' | 'email' | 'cf_handle' | 'lc_handle'>;
}

export type PlatformSyncStatus = 'ok' | 'private_or_not_found' | 'not_found_or_private' | 'missing' | 'error' | 'unknown';

export interface UserStats {
  id?: number;
  user_id: string;
  lc_rating?: number | null;
  lc_total_solved?: number | null;
  lc_latest_contest_name?: string | null;
  lc_latest_contest_rank?: number | null;
  lc_latest_contest_rating?: number | null;
  lc_latest_contest_solved?: number | null;
  lc_latest_contest_date?: string | null;
  
  cf_rating?: number | null;
  cf_max_rating?: number | null;
  cf_total_solved?: number | null;
  cf_latest_contest_name?: string | null;
  cf_latest_contest_rank?: number | null;
  cf_latest_contest_rating?: number | null;
  cf_latest_contest_date?: string | null;
  
  current_streak?: number;
  max_streak?: number;
  last_solve_date?: string | null;
  synced_at?: string;

  // Sync Diagnostics
  lc_status?: PlatformSyncStatus;
  lc_error_msg?: string | null;
  cf_status?: PlatformSyncStatus;
  cf_error_msg?: string | null;

  user?: UserProfile;
}

