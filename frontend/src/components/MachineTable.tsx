import { Search, Eye } from 'lucide-react';
import type { MachineStats } from '../types';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';

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
    <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">设备列表</h3>
        <form onSubmit={onSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
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
            {machines.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-500">
                  {loading ? '加载中...' : search ? '未找到匹配的设备' : '暂无设备数据'}
                </td>
              </tr>
            ) : (
              machines.map((m) => (
                <tr
                  key={m.machine_code}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="group relative flex items-center gap-1">
                      <code className="text-xs text-slate-300 bg-white/5 px-2 py-1 rounded font-mono max-w-[200px] truncate block">
                        {m.machine_code}
                      </code>
                      <CopyButton text={m.machine_code} />
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
                      onClick={() => onViewDetail(m.machine_code)}
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
  );
}
