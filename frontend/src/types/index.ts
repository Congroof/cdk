export type CdkStatus = 'unused' | 'activated' | 'expired' | 'disabled';
export type ValidUnit = 'days' | 'hours';

export interface Cdk {
  id: number;
  code: string;
  valid_duration: number;
  valid_unit: ValidUnit;
  status: CdkStatus;
  machine_code: string | null;
  remark: string | null;
  created_at: string;
  activated_at: string | null;
  expires_at: string | null;
}

export interface CdkListResponse {
  items: Cdk[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UsageOverview {
  unique_machines: number;
  active_today: number;
  total_requests: number;
}

export interface MachineStats {
  machine_code: string;
  cdk_count: number;
  first_seen: string;
  last_seen: string;
  active_days: number;
  total_requests: number;
}

export interface DailyTrend {
  date: string;
  requests: number;
  unique_machines: number;
}

export interface UsageStatsData {
  overview: UsageOverview;
  machines: MachineStats[];
  daily_trend: DailyTrend[];
}

export interface MachineDailyUsage {
  date: string;
  requests: number;
  first_active: string;
  last_active: string;
  duration_minutes: number;
}

export interface MachineCdkUsage {
  code: string;
  requests: number;
  last_used: string;
}

export interface MachineUsageDetail {
  machine_code: string;
  daily_usage: MachineDailyUsage[];
  cdks: MachineCdkUsage[];
}

export interface BannedMachine {
  id: number;
  machine_code: string;
  reason: string | null;
  created_by: number;
  created_at: string;
}

export interface UserFeedback {
  id: number;
  feedback_type: string;
  content: string;
  contact: string | null;
  machine_code: string | null;
  cdk_code: string | null;
  app_version: string | null;
  platform: string | null;
  metadata: unknown | null;
  reply: string | null;
  replied_at: string | null;
  created_by: number | null;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface FeedbackListResponse {
  items: UserFeedback[];
  total: number;
  pending: number;
  done: number;
  page: number;
  page_size: number;
}
