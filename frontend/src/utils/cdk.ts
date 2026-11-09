import type { CdkStatus } from '../types';

export const cdkStatusConfig: Record<
  CdkStatus,
  {
    label: string;
    className: string;
    dotClassName: string;
  }
> = {
  unused: {
    label: '未使用',
    className: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    dotClassName: 'bg-blue-400',
  },
  activated: {
    label: '已激活',
    className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    dotClassName: 'bg-emerald-400',
  },
  expired: {
    label: '已过期',
    className: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    dotClassName: 'bg-slate-400',
  },
  disabled: {
    label: '已禁用',
    className: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    dotClassName: 'bg-rose-400',
  },
};
