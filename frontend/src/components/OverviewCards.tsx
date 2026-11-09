import { Activity, BarChart3, Monitor } from 'lucide-react';
import type { UsageOverview } from '../types';
import StatCard from './ui/StatCard';

interface Props {
  overview: UsageOverview;
}

export default function OverviewCards({ overview }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <StatCard
        label="独立设备数"
        value={overview.unique_machines}
        subtitle="周期内产生请求的唯一机器码"
        icon={Monitor}
        tone="violet"
      />
      <StatCard
        label="今日活跃设备"
        value={overview.active_today}
        subtitle="今日有心跳或验证记录"
        icon={Activity}
        tone="emerald"
      />
      <StatCard
        label="周期总请求数"
        value={overview.total_requests}
        subtitle="所选统计周期内的总调用量"
        icon={BarChart3}
        tone="blue"
      />
    </div>
  );
}
