import type { ValidUnit } from '../types';

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
