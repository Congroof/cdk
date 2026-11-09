import { Eye, Monitor, Search } from 'lucide-react';
import type { MachineStats } from '../types';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';
import Badge from './ui/Badge';
import EmptyState from './ui/EmptyState';

interface Props {
  machines: MachineStats[];
  loading: boolean;
  search: string;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onViewDetail: (machineCode: string) => void;
}

export default function MachineTable({
  machines,
  loading,
  search,
  searchInput,
  onSearchInputChange,
  onSearch,
  onViewDetail,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">活跃设备排行与明细</h3>
          <Badge variant="default">{machines.length} 台设备</Badge>
        </div>

        <form onSubmit={onSearch} className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            placeholder="搜索设备机器码..."
            className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs sm:text-sm text-white placeholder-slate-500 transition-all focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </form>
      </div>

      {machines.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title={loading ? '正在加载设备列表...' : search ? '未找到匹配的设备' : '暂无设备活跃数据'}
          description={search ? '请尝试更换机器码关键词后重新搜索' : '周期内尚未记录到设备心跳数据'}
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0a0f1d] text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3.5 text-left">机器码</th>
                    <th className="px-4 py-3.5 text-left">关联 CDK</th>
                    <th className="px-4 py-3.5 text-left">首次使用</th>
                    <th className="px-4 py-3.5 text-left">最近活跃</th>
                    <th className="px-4 py-3.5 text-left">活跃天数</th>
                    <th className="px-4 py-3.5 text-left">总请求</th>
                    <th className="sticky right-0 z-10 bg-[#0a0f1d]/95 px-4 py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {machines.map((m) => (
                    <tr
                      key={m.machine_code}
                      className="group transition-colors hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <code
                            className="block max-w-[220px] truncate rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-slate-200"
                            title={m.machine_code}
                          >
                            {m.machine_code}
                          </code>
                          <CopyButton text={m.machine_code} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <Badge variant="brand">{m.cdk_count} 个</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 tabular-nums">
                        {formatDate(m.first_seen)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-300 tabular-nums">
                        {formatDate(m.last_seen)}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="font-semibold text-emerald-400">{m.active_days}</span>
                        <span className="ml-1 text-slate-500">天</span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-200 tabular-nums">
                        {m.total_requests.toLocaleString()}
                      </td>
                      <td className="sticky right-0 z-10 bg-[#080d19]/95 group-hover:bg-[#0d1424]/95 px-4 py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)] transition-colors">
                        <button
                          type="button"
                          onClick={() => onViewDetail(m.machine_code)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/20"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Stream */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {machines.map((m) => (
              <article
                key={m.machine_code}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <code className="truncate font-mono text-xs font-semibold text-slate-200">
                      {m.machine_code}
                    </code>
                    <CopyButton text={m.machine_code} />
                  </div>
                  <Badge variant="brand">{m.cdk_count} 个 CDK</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.05] bg-black/20 p-3 text-xs tabular-nums">
                  <div>
                    <span className="text-slate-500 block">活跃天数</span>
                    <span className="mt-0.5 block font-semibold text-emerald-400">
                      {m.active_days} 天
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">累计请求</span>
                    <span className="mt-0.5 block font-semibold text-white">
                      {m.total_requests.toLocaleString()} 次
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">首次活跃</span>
                    <span className="mt-0.5 block text-slate-300">
                      {formatDate(m.first_seen)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">最近活跃</span>
                    <span className="mt-0.5 block text-slate-300">
                      {formatDate(m.last_seen)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onViewDetail(m.machine_code)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/10 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
                >
                  <Eye className="h-3.5 w-3.5" />
                  查看每日使用时长与关联 CDK
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
