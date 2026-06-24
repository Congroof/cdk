import { RefreshCw } from 'lucide-react';
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
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
];

export default function DailyTrendChart({ data, days, loading, onDaysChange, onRefresh }: Props) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-300">每日趋势</h3>
        <div className="flex items-center gap-2">
          {rangeTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onDaysChange(tab.value)}
              className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                days === tab.value
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'text-slate-400 border-white/5 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 hover:bg-white/5 border border-white/10 rounded-lg transition-colors ml-1"
            title="刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMachines" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
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
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '13px',
                color: '#e2e8f0',
              }}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}
            />
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
          {loading ? '加载中...' : '暂无趋势数据'}
        </div>
      )}
    </div>
  );
}
