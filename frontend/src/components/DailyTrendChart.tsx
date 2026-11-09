import { RefreshCw, TrendingUp } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DailyTrend } from '../types';
import { formatShortDate } from '../utils/format';

interface Props {
  data: DailyTrend[];
  days: number;
  loading: boolean;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
}

const rangeTabs = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
];

export default function DailyTrendChart({
  data,
  days,
  loading,
  onDaysChange,
  onRefresh,
}: Props) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">每日请求与活跃设备趋势</h3>
            <p className="text-xs text-slate-500">左轴：请求次数 · 右轴：独立设备数</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            {rangeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onDaysChange(tab.value)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  days === tab.value
                    ? 'bg-blue-500/20 text-blue-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white"
            title="刷新趋势"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMachines" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '13px',
                color: '#e2e8f0',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              }}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="requests"
              name="请求数"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRequests)"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="unique_machines"
              name="独立设备"
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorMachines)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-slate-500 text-sm">
          {loading ? '正在加载趋势数据...' : '所选周期内暂无趋势数据'}
        </div>
      )}
    </div>
  );
}
