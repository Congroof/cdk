import type { CdkStatus } from '../types';

export const cdkStatusConfig: Record<CdkStatus, { label: string; className: string }> = {
  unused: {
    label: '未使用',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  activated: {
    label: '已激活',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  expired: {
    label: '已过期',
    className: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
  disabled: {
    label: '已禁用',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
};
