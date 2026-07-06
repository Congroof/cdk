import type { ValidUnit } from '../types';

const DEFAULT_CUSTOM_DURATION = 7;
const DEFAULT_CUSTOM_UNIT: ValidUnit = 'days';

export interface CdkDurationOption {
  label: string;
  validDuration: number;
  validUnit: ValidUnit;
}

export const CDK_DURATION_OPTIONS: CdkDurationOption[] = [
  { label: '1 小时', validDuration: 1, validUnit: 'hours' },
  { label: '24 小时', validDuration: 24, validUnit: 'hours' },
  { label: '30 天', validDuration: 30, validUnit: 'days' },
];

export const DEFAULT_CDK_DURATION_OPTION = CDK_DURATION_OPTIONS[2];

export function getDefaultCustomCdkDuration(): number {
  return DEFAULT_CUSTOM_DURATION;
}

export function getDefaultCustomCdkUnit(): ValidUnit {
  return DEFAULT_CUSTOM_UNIT;
}

export function getValidCustomCdkDuration(duration: number): number | null {
  if (!Number.isInteger(duration) || duration <= 0) return null;
  return duration;
}

export function formatCustomCdkDurationSummary(duration: number, unit: ValidUnit): string {
  const validDuration = getValidCustomCdkDuration(duration);
  if (!validDuration) return '请输入大于 0 的整数';
  return `按 ${validDuration} ${unit === 'hours' ? '小时' : '天'}生成`;
}
