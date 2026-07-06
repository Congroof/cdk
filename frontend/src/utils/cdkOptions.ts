import type { ValidUnit } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CUSTOM_DURATION_DAYS = 30;

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

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateToUtcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function getDateInputValueAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function getDefaultCustomCdkDate(): string {
  return getDateInputValueAfterDays(DEFAULT_CUSTOM_DURATION_DAYS);
}

export function getMinCustomCdkDate(): string {
  return getDateInputValueAfterDays(1);
}

export function getCustomCdkDurationDays(dateValue: string): number | null {
  const date = parseDateInputValue(dateValue);
  if (!date) return null;

  const today = new Date();
  const durationDays = localDateToUtcDay(date) - localDateToUtcDay(today);
  return durationDays > 0 ? durationDays : null;
}

export function formatCustomCdkDurationSummary(dateValue: string): string {
  const durationDays = getCustomCdkDurationDays(dateValue);
  if (!durationDays) return '请选择今天之后的日期';
  return `按从今天起 ${durationDays} 天生成`;
}
