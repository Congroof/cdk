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

export interface CdkBindingHistorySummary {
  current_machine_code: string | null;
  machine_count: number;
  binding_count: number;
  rebind_count: number;
}

export interface CdkBindingMachineSummary {
  machine_code: string;
  binding_count: number;
  first_bound_at: string;
  last_bound_at: string;
  is_current: boolean;
}

export interface CdkBindingHistoryEvent {
  id: number;
  event_type: 'activate' | 'rebind';
  old_machine_code: string | null;
  new_machine_code: string;
  client_ip: string | null;
  created_at: string;
}

export interface CdkBindingHistoryData {
  summary: CdkBindingHistorySummary;
  machines: CdkBindingMachineSummary[];
  events: CdkBindingHistoryEvent[];
  pagination: {
    total: number;
    page: number;
    page_size: number;
  };
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

export interface Announcement {
  title: string;
  content: string;
  is_enabled: boolean;
  updated_at: string;
}

export interface KdocsSettings {
  configured: boolean;
  cookieHint: string | null;
  groupId: string | null;
  parentId: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface ReleaseManifestArtifact {
  fileId: string;
  linkId: string;
  linkUrl?: string | null;
  fileName: string;
  fileSize: number;
  sha1: string;
  sha256: string;
  groupId: string;
  parentId: string;
}

export interface ReleaseManifest {
  schemaVersion: number;
  product: string;
  platform: string;
  version: string;
  pubDate: string;
  signature: string;
  artifact: ReleaseManifestArtifact;
}

export interface SkinforgeRelease {
  version: string;
  notes: string;
  pubDate: string;
  signature: string;
  fileId: number;
  linkId: string;
  linkUrl: string | null;
  fileName: string;
  fileSize: number;
  sha1: string;
  sha256: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface HashReleaseSummary {
  version: string;
  canonicalSize: number;
  canonicalSha256: string;
  txtFileName: string;
  txtSize: number;
  gzipFileName: string;
  gzipSize: number;
  publishedAt: string;
}

export interface HashSyncStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastCandidateVersion: string | null;
  updatedAt: string;
}

export interface HashManagementStatus {
  running: boolean;
  sync: HashSyncStatus;
  current: HashReleaseSummary | null;
  pending: {
    version: string;
    txtUploaded: boolean;
    gzipUploaded: boolean;
  } | null;
}
