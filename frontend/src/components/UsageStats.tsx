import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, Monitor, Activity, BarChart3, Search, X, Eye } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import api from '../api';
import { useToast } from './Toast';
import type { UsageStatsData, MachineUsageDetail } from '../types';

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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<MachineUsageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { days };
      if (search) params.search = search;
      const res = await api.get('/cdk/usage-stats', { params });
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [days, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchDetail = useCallback(async (machineCode: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get('/cdk/machine-usage', {
        params: { machine_code: machineCode, days },
      });
      if (res.data.success) {
        setDetail(res.data.data);
      }
    } catch {
      toast('获取详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [days, toast]);

  const handleViewDetail = (machineCode: string) => {
    setDetailCode(machineCode);
    setDetail(null);
    fetchDetail(machineCode);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

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

  const formatTime = (d: string | null) => {
    if (!d) return '-';
    const utcDate = new Date(d + 'Z');
    return utcDate.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return '< 1 分钟';
    if (minutes < 60) return `${minutes} 分钟`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
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

      {/* Machine Code Table */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">设备列表</h3>
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索机器码"
              className="pl-9 pr-4 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all w-52"
            />
          </form>
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
                <th className="text-right px-4 py-3 font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {!data?.machines || data.machines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-500">
                    {loading ? '加载中...' : search ? '未找到匹配的设备' : '暂无设备数据'}
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleViewDetail(m.machine_code)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 rounded-lg transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Machine Detail Modal */}
      {detailCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDetailCode(null)}
          />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-semibold">设备使用详情</h3>
                <code className="text-xs text-slate-400 font-mono mt-1 block break-all">
                  {detailCode}
                </code>
              </div>
              <button
                onClick={() => setDetailCode(null)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  加载中...
                </div>
              ) : detail ? (
                <>
                  {/* Daily Usage Chart */}
                  {detail.daily_usage.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-3">每日使用时长</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={[...detail.daily_usage].reverse()}
                          margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatShortDate}
                            stroke="rgba(255,255,255,0.2)"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="rgba(255,255,255,0.2)"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
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
                            formatter={(value: number) => [formatDuration(value), '使用时长']}
                            labelFormatter={(label) => `日期: ${label}`}
                          />
                          <Bar dataKey="duration_minutes" name="使用时长(分钟)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Daily Usage Table */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-3">每日明细</h4>
                    <div className="overflow-x-auto border border-white/5 rounded-xl">
                      <table className="w-full text-sm whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.02]">
                            <th className="text-left px-4 py-2.5 font-medium text-slate-400">日期</th>
                            <th className="text-left px-4 py-2.5 font-medium text-slate-400">请求数</th>
                            <th className="text-left px-4 py-2.5 font-medium text-slate-400">首次活跃</th>
                            <th className="text-left px-4 py-2.5 font-medium text-slate-400">末次活跃</th>
                            <th className="text-left px-4 py-2.5 font-medium text-slate-400">使用时长</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.daily_usage.map((d) => (
                            <tr
                              key={d.date}
                              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="px-4 py-2.5 text-slate-300 font-medium">{d.date}</td>
                              <td className="px-4 py-2.5 text-slate-400">{d.requests}</td>
                              <td className="px-4 py-2.5 text-slate-400">{formatTime(d.first_active)}</td>
                              <td className="px-4 py-2.5 text-slate-400">{formatTime(d.last_active)}</td>
                              <td className="px-4 py-2.5">
                                <span className="text-violet-400 font-medium">
                                  {formatDuration(d.duration_minutes)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Associated CDKs */}
                  {detail.cdks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-3">关联激活码</h4>
                      <div className="overflow-x-auto border border-white/5 rounded-xl">
                        <table className="w-full text-sm whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="text-left px-4 py-2.5 font-medium text-slate-400">CDK 码</th>
                              <th className="text-left px-4 py-2.5 font-medium text-slate-400">请求数</th>
                              <th className="text-left px-4 py-2.5 font-medium text-slate-400">最后使用</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.cdks.map((c) => (
                              <tr
                                key={c.code}
                                className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                              >
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <code className="font-mono text-slate-300 text-xs">{c.code}</code>
                                    <button
                                      onClick={() => handleCopy(c.code)}
                                      className="p-1 hover:bg-white/5 rounded transition-colors shrink-0"
                                    >
                                      {copiedCode === c.code ? (
                                        <Check className="w-3 h-3 text-green-400" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-slate-500" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-slate-400">{c.requests}</td>
                                <td className="px-4 py-2.5 text-slate-400">{formatDate(c.last_used)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  暂无数据
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
