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
