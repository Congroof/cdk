import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, Monitor, Activity, BarChart3 } from 'lucide-react';
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
import api from '../api';
import { useToast } from './Toast';
import type { UsageStatsData } from '../types';

const rangeTabs = [
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
];

export default function UsageStats() {
  const { toast } = useToast();
  const [data, setData] = useState<UsageStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cdk/usage-stats', { params: { days } });
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = async (code: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch {
          throw new Error('复制失败');
        } finally {
          textArea.remove();
        }
      }
      setCopiedCode(code);
      toast('已复制到剪贴板', 'success');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    const utcDate = new Date(d + 'Z');
    return utcDate.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  const overview = data?.overview ?? { unique_machines: 0, active_today: 0, total_requests: 0 };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: '独立设备',
            value: overview.unique_machines,
            color: 'from-violet-500 to-purple-600',
            icon: Monitor,
          },
          {
            label: '今日活跃',
            value: overview.active_today,
            color: 'from-emerald-500 to-teal-600',
            icon: Activity,
          },
          {
            label: '总请求数',
            value: overview.total_requests,
            color: 'from-blue-500 to-cyan-600',
            icon: BarChart3,
          },
        ].map((s) => (
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
                {s.value.toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-300">每日趋势</h3>
          <div className="flex items-center gap-2">
            {rangeTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setDays(tab.value)}
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
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 hover:bg-white/5 border border-white/10 rounded-lg transition-colors ml-1"
              title="刷新"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {data?.daily_trend && data.daily_trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.daily_trend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
                labelFormatter={(label: string) => `日期: ${label}`}
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

      {/* Machine Code Table */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-slate-300">设备列表</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="text-left px-4 py-3 font-medium text-slate-400">机器码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">关联 CDK</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">首次使用</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">最近活跃</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">活跃天数</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">总请求</th>
              </tr>
            </thead>
            <tbody>
              {!data?.machines || data.machines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-500">
                    {loading ? '加载中...' : '暂无设备数据'}
                  </td>
                </tr>
              ) : (
                data.machines.map((m) => (
                  <tr
                    key={m.machine_code}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="group relative flex items-center gap-1">
                        <code className="text-xs text-slate-300 bg-white/5 px-2 py-1 rounded font-mono max-w-[200px] truncate block">
                          {m.machine_code}
                        </code>
                        <button
                          onClick={() => handleCopy(m.machine_code)}
                          className="p-1 hover:bg-white/5 rounded transition-colors shrink-0"
                        >
                          {copiedCode === m.machine_code ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-500" />
                          )}
                        </button>
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                          <div className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono shadow-xl max-w-xs break-all">
                            {m.machine_code}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                        {m.cdk_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(m.first_seen)}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(m.last_seen)}</td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-400 font-medium">{m.active_days}</span>
                      <span className="text-slate-500 ml-1">天</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium">
                      {m.total_requests.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
