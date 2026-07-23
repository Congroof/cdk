import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
  Search,
} from 'lucide-react';
import api from '../api';
import type { MultiDeviceCdk, MultiDeviceCdkListData } from '../types';
import { cdkStatusConfig } from '../utils/cdk';
import { formatDate } from '../utils/format';
import CdkBindingHistoryModal from './CdkBindingHistoryModal';
import CopyButton from './CopyButton';
import { useToast } from './toastContext';

const PAGE_SIZE = 20;

export default function MultiDeviceCdkList() {
  const { toast } = useToast();
  const [items, setItems] = useState<MultiDeviceCdk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [viewingHistory, setViewingHistory] = useState<MultiDeviceCdk | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (search) params.search = search;
      const response = await api.get<{ success: boolean; data: MultiDeviceCdkListData }>(
        '/cdk/multi-device-bindings',
        { params },
      );
      if (response.data.success) {
        setItems(response.data.data.items);
        setTotal(response.data.data.pagination.total);
      }
    } catch (error: unknown) {
      setItems([]);
      setTotal(0);
      const message = axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
        ? error.response.data.error
        : '获取多设备 CDK 失败';
      setErrorMessage(message);
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">多设备 CDK</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            仅展示成功绑定过至少两台不同机器的 CDK，失败验证和普通校验不计入。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索 CDK 或历史机器码"
                maxLength={256}
                className="w-72 rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
            >
              搜索
            </button>
          </form>
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="rounded-xl border border-white/10 p-2.5 transition-colors hover:bg-white/5 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-4 py-3 text-left font-medium text-slate-400">CDK 码</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">状态</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">当前机器</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">历史机器</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">成功绑定</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">换绑次数</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">最近绑定</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    正在加载多设备 CDK...
                  </span>
                </td>
              </tr>
            ) : errorMessage ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-red-400">
                  {errorMessage}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-500">
                  {search ? '没有匹配的多设备 CDK' : '暂无多设备 CDK'}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const status = cdkStatusConfig[item.status];
                return (
                  <tr
                    key={item.id}
                    className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-white">{item.code}</code>
                        <CopyButton text={item.code} size="md" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.current_machine_code ? (
                        <div className="flex items-center gap-2">
                          <code
                            className="block max-w-[180px] truncate rounded bg-white/5 px-2 py-1 font-mono text-xs text-slate-400"
                            title={item.current_machine_code}
                          >
                            {item.current_machine_code}
                          </code>
                          <CopyButton text={item.current_machine_code} />
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                        {item.machine_count} 台
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-blue-400">
                      {item.binding_count}
                    </td>
                    <td className="px-4 py-3 font-medium text-violet-400">
                      {item.rebind_count}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(item.last_bound_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setViewingHistory(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-500/10 bg-sky-500/5 px-3 py-1.5 text-xs font-medium text-sky-400 transition-all hover:bg-sky-500/10 hover:text-sky-300"
                      >
                        <History className="h-3.5 w-3.5" />
                        绑定详情
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          共 {total} 条，第 {page}/{totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((current) => current - 1)}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-white/10 p-2 transition-colors hover:bg-white/5 disabled:opacity-30"
            aria-label="上一页多设备 CDK"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-white/10 p-2 transition-colors hover:bg-white/5 disabled:opacity-30"
            aria-label="下一页多设备 CDK"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewingHistory && (
        <CdkBindingHistoryModal
          key={viewingHistory.id}
          cdk={viewingHistory}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </div>
  );
}
