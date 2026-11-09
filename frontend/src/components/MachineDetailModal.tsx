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
import ResponsiveModal from './ui/ResponsiveModal';

interface Props {
  machineCode: string;
  detail: MachineUsageDetail | null;
  loading: boolean;
  onClose: () => void;
}

export default function MachineDetailModal({
  machineCode,
  detail,
  loading,
  onClose,
}: Props) {
  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title="设备使用详情"
      description={
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
          <span className="break-all">{machineCode}</span>
          <CopyButton text={machineCode} />
        </span>
      }
      size="xl"
    >
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            正在加载单机使用数据...
          </div>
        ) : detail ? (
          <>
            {detail.daily_usage.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-200 mb-3">每日使用时长分布</h4>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4">
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
                          backgroundColor: '#0f172a',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          fontSize: '13px',
                          color: '#e2e8f0',
                        }}
                        formatter={(value) => [formatDuration(value as number), '使用时长']}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Bar
                        dataKey="duration_minutes"
                        name="使用时长(分钟)"
                        fill="#8b5cf6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium text-slate-200 mb-3">每日活跃明细</h4>
              <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <table className="w-full text-xs sm:text-sm whitespace-nowrap tabular-nums">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-slate-400">
                      <th className="px-4 py-2.5 font-medium">日期</th>
                      <th className="px-4 py-2.5 font-medium">请求数</th>
                      <th className="px-4 py-2.5 font-medium">首次活跃</th>
                      <th className="px-4 py-2.5 font-medium">末次活跃</th>
                      <th className="px-4 py-2.5 font-medium">估算时长</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {detail.daily_usage.map((d) => (
                      <tr
                        key={d.date}
                        className="transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-2.5 text-slate-200 font-medium">{d.date}</td>
                        <td className="px-4 py-2.5 text-slate-300">{d.requests}</td>
                        <td className="px-4 py-2.5 text-slate-400">{formatTime(d.first_active)}</td>
                        <td className="px-4 py-2.5 text-slate-400">{formatTime(d.last_active)}</td>
                        <td className="px-4 py-2.5 font-medium text-violet-300">
                          {formatDuration(d.duration_minutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {detail.cdks.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-200 mb-3">该设备关联激活码</h4>
                <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <table className="w-full text-xs sm:text-sm whitespace-nowrap tabular-nums">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-slate-400">
                        <th className="px-4 py-2.5 font-medium">CDK 码</th>
                        <th className="px-4 py-2.5 font-medium">请求数</th>
                        <th className="px-4 py-2.5 font-medium">最后使用时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {detail.cdks.map((c) => (
                        <tr
                          key={c.code}
                          className="transition-colors hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <code className="font-mono text-slate-200 text-xs">{c.code}</code>
                              <CopyButton text={c.code} />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-300">{c.requests}</td>
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
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            暂无该设备明细数据
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
