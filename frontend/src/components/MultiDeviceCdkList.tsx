import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  History,
  Network,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import api from '../api';
import type { MultiDeviceCdk, MultiDeviceCdkListData } from '../types';
import { cdkStatusConfig } from '../utils/cdk';
import { formatDate } from '../utils/format';
import CdkBindingHistoryModal from './CdkBindingHistoryModal';
import CopyButton from './CopyButton';
import { useToast } from './toastContext';
import Pagination from './ui/Pagination';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import Badge from './ui/Badge';

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
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
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

  const handleClearSearch = () => {
    setSearchInput('');
    setPage(1);
    setSearch('');
  };

  return (
    <div className="space-y-6">
      {/* Info Banner & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/15 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-semibold text-white">
                多设备异常换绑监控
              </h2>
              <Badge variant="warning">共 {total} 条预警</Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              仅筛选成功换绑超过 5 次且换绑次数大于历史机器数的激活码，失败验证和普通心跳校验不计入。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索 CDK 或历史机器码..."
              maxLength={256}
              className="h-10 w-full rounded-xl border border-white/10 bg-[#060913]/60 pl-10 pr-8 text-sm text-white placeholder-slate-500 transition-all focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-300"
                aria-label="清空搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
          <button
            type="submit"
            onClick={handleSearch}
            className="h-10 shrink-0 rounded-xl border border-amber-500/25 bg-amber-500/15 px-3.5 text-xs sm:text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/25"
          >
            搜索
          </button>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <Skeleton rows={5} />
      ) : errorMessage ? (
        <EmptyState
          icon={AlertTriangle}
          title="加载多设备 CDK 失败"
          description={errorMessage}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Network}
          title={search ? '没有匹配的多设备 CDK' : '暂无异常多设备 CDK'}
          description="当前所有激活码均在合理换绑范围内运行。"
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0a0f1d] text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="px-3.5 py-3.5 xl:px-4 text-left">CDK 码</th>
                    <th className="px-3 py-3.5 xl:px-4 text-left">状态</th>
                    <th className="px-3 py-3.5 xl:px-4 text-left">当前机器</th>
                    <th className="px-3 py-3.5 xl:px-4 text-left">历史机器</th>
                    <th className="px-3 py-3.5 xl:px-4 text-left">成功绑定</th>
                    <th className="px-3 py-3.5 xl:px-4 text-left">换绑次数</th>
                    <th className="px-3 py-3.5 xl:px-4 text-left">最近绑定</th>
                    <th className="sticky right-0 z-10 bg-[#0a0f1d]/95 px-3.5 py-3.5 xl:px-4 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map((item) => {
                    const status = cdkStatusConfig[item.status];
                    return (
                      <tr
                        key={item.id}
                        className="group transition-colors hover:bg-white/[0.025]"
                      >
                        <td className="px-3.5 py-3 xl:px-4 xl:py-3.5">
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-xs xl:text-[13px] text-white">{item.code}</code>
                            <CopyButton text={item.code} size="md" />
                          </div>
                        </td>
                        <td className="px-3 py-3 xl:px-4 xl:py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
                            {status.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 xl:px-4 xl:py-3.5">
                          {item.current_machine_code ? (
                            <div className="flex items-center gap-1">
                              <code
                                className="block max-w-[130px] xl:max-w-[175px] truncate rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-slate-300"
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
                        <td className="px-3 py-3 xl:px-4 xl:py-3.5 tabular-nums">
                          <Badge variant="warning">{item.machine_count} 台</Badge>
                        </td>
                        <td className="px-3 py-3 xl:px-4 xl:py-3.5 font-medium text-blue-400 tabular-nums">
                          {item.binding_count} 次
                        </td>
                        <td className="px-3 py-3 xl:px-4 xl:py-3.5 font-semibold text-violet-400 tabular-nums">
                          {item.rebind_count} 次
                        </td>
                        <td className="px-3 py-3 xl:px-4 xl:py-3.5 text-xs text-slate-400 tabular-nums">
                          {formatDate(item.last_bound_at)}
                        </td>
                        <td className="sticky right-0 z-10 bg-[#080d19]/95 group-hover:bg-[#0d1424]/95 px-3.5 py-3 xl:px-4 xl:py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)] transition-colors">
                          <button
                            type="button"
                            onClick={() => setViewingHistory(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-300 transition-all hover:bg-sky-500/20"
                          >
                            <History className="h-3.5 w-3.5" />
                            绑定详情
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Stream View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {items.map((item) => {
              const status = cdkStatusConfig[item.status];
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <code className="min-w-0 break-all font-mono text-sm font-semibold text-white">
                        {item.code}
                      </code>
                      <CopyButton text={item.code} size="md" />
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
                      {status.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.05] bg-black/20 p-3 text-center text-xs tabular-nums">
                    <div>
                      <div className="text-slate-500">历史机器</div>
                      <div className="mt-1 font-semibold text-amber-300">
                        {item.machine_count} 台
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">成功绑定</div>
                      <div className="mt-1 font-semibold text-blue-300">
                        {item.binding_count} 次
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">换绑次数</div>
                      <div className="mt-1 font-semibold text-violet-300">
                        {item.rebind_count} 次
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 shrink-0">当前机器:</span>
                      {item.current_machine_code ? (
                        <div className="flex min-w-0 items-center gap-1">
                          <code className="truncate font-mono text-slate-300">
                            {item.current_machine_code}
                          </code>
                          <CopyButton text={item.current_machine_code} />
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">最近绑定:</span>
                      <span className="text-slate-300 tabular-nums">
                        {formatDate(item.last_bound_at)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-white/[0.05] pt-3">
                    <button
                      type="button"
                      onClick={() => setViewingHistory(item)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
                    >
                      <History className="h-3.5 w-3.5" />
                      查看完整绑定时间线
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}

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
