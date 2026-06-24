import { X } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MachineUsageDetail } from '../types';
import { formatDate, formatTime, formatShortDate, formatDuration } from '../utils/format';
import CopyButton from './CopyButton';

interface Props {
  machineCode: string;
  detail: MachineUsageDetail | null;
  loading: boolean;
  onClose: () => void;
}

export default function MachineDetailModal({ machineCode, detail, loading, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold">设备使用详情</h3>
            <code className="text-xs text-slate-400 font-mono mt-1 block break-all">
              {machineCode}
            </code>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              加载中...
            </div>
          ) : detail ? (
            <>
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
                        formatter={(value) => [formatDuration(value as number), '使用时长']}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Bar dataKey="duration_minutes" name="使用时长(分钟)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

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
                                <CopyButton text={c.code} />
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
  );
}
