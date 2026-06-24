import { Monitor, Activity, BarChart3 } from 'lucide-react';
import type { UsageOverview } from '../types';

interface Props {
  overview: UsageOverview;
}

const cards = [
  {
    key: 'unique_machines' as const,
    label: '独立设备',
    color: 'from-violet-500 to-purple-600',
    icon: Monitor,
  },
  {
    key: 'active_today' as const,
    label: '今日活跃',
    color: 'from-emerald-500 to-teal-600',
    icon: Activity,
  },
  {
    key: 'total_requests' as const,
    label: '总请求数',
    color: 'from-blue-500 to-cyan-600',
    icon: BarChart3,
  },
];

export default function OverviewCards({ overview }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((s) => (
        <div
          key={s.label}
          className="bg-white/[0.03] border border-white/5 rounded-xl p-5 flex items-center gap-4"
        >
          <div
            className={`w-11 h-11 bg-gradient-to-br ${s.color} rounded-xl flex items-center justify-center shadow-lg shrink-0`}
          >
            <s.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-0.5">{s.label}</div>
            <div
              className={`text-2xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}
            >
              {overview[s.key].toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
