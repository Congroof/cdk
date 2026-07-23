import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  History,
  Link2,
  MapPin,
  Monitor,
  Network,
  RefreshCw,
  Repeat2,
  X,
} from 'lucide-react';
import api from '../api';
import type { Cdk, CdkBindingHistoryData } from '../types';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';
import { useToast } from './toastContext';

const PAGE_SIZE = 20;

interface Props {
  cdk: Pick<Cdk, 'id' | 'code'>;
  onClose: () => void;
}

export default function CdkBindingHistoryModal({ cdk, onClose }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<CdkBindingHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ success: boolean; data: CdkBindingHistoryData }>(
        `/cdk/${cdk.id}/binding-history`,
        { params: { page, page_size: PAGE_SIZE } },
      );
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch {
      setData(null);
      toast('获取绑定历史失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [cdk.id, page, toast]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.pagination.total / data.pagination.page_size))
    : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-white/5 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold">CDK 绑定详情</h3>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <code className="block max-w-[70vw] truncate font-mono text-xs text-slate-400">
                {cdk.code}
              </code>
              <CopyButton text={cdk.code} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-white/5"
            aria-label="关闭绑定详情"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              正在加载绑定历史...
            </div>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Monitor className="h-4 w-4 text-emerald-400" />
                    当前机器
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <code
                      className="block min-w-0 flex-1 truncate font-mono text-sm text-slate-200"
                      title={data.summary.current_machine_code ?? undefined}
                    >
                      {data.summary.current_machine_code ?? '尚未绑定'}
                    </code>
                    {data.summary.current_machine_code && (
                      <CopyButton text={data.summary.current_machine_code} />
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Network className="h-4 w-4 text-sky-400" />
                    历史机器
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {data.summary.machine_count}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Link2 className="h-4 w-4 text-blue-400" />
                    成功绑定
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {data.summary.binding_count}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Repeat2 className="h-4 w-4 text-violet-400" />
                    换绑次数
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {data.summary.rebind_count}
                  </p>
                </div>
              </div>

              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">关联机器</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      次数仅统计已记录的成功激活和换绑；老数据缺少首次绑定记录时会明确标记。
                    </p>
                  </div>
                </div>
                {data.summary.machine_count > data.machines.length && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    历史机器较多，当前仅展示最近绑定的 {data.machines.length} 台；历史机器总数为{' '}
                    {data.summary.machine_count} 台。
                  </div>
                )}
                {data.machines.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full whitespace-nowrap text-sm">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          <th className="px-4 py-2.5 text-left font-medium text-slate-400">机器码</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-400">成功绑定次数</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-400">首次记录</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-400">最近记录</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.machines.map((machine) => (
                          <tr
                            key={machine.machine_code}
                            className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.02]"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <code className="max-w-[240px] truncate font-mono text-xs text-slate-300">
                                  {machine.machine_code}
                                </code>
                                <CopyButton text={machine.machine_code} />
                                {machine.is_current && (
                                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                                    当前
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {machine.binding_count_complete ? (
                                <span className="font-medium text-blue-400">
                                  {machine.binding_count}
                                </span>
                              ) : (
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                                  历史记录，次数未知
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {formatDate(machine.first_bound_at)}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {formatDate(machine.last_bound_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
                    该 CDK 暂无成功绑定记录
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">绑定时间线</h4>
                    <p className="mt-1 text-xs text-slate-500">按最近发生时间倒序展示</p>
                  </div>
                  {loading && <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />}
                </div>

                {data.events.length > 0 ? (
                  <div className="space-y-3">
                    {data.events.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs ${
                                  event.event_type === 'activate'
                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                    : 'border-violet-500/20 bg-violet-500/10 text-violet-400'
                                }`}
                              >
                                {event.event_type === 'activate' ? '首次激活' : '设备换绑'}
                              </span>
                              <span className="text-xs text-slate-500">{formatDate(event.created_at)}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {event.old_machine_code ? (
                                <>
                                  <code className="max-w-[280px] truncate rounded bg-white/5 px-2 py-1 font-mono text-xs text-slate-400">
                                    {event.old_machine_code}
                                  </code>
                                  <ArrowRight className="h-4 w-4 text-slate-600" />
                                </>
                              ) : (
                                <span className="text-xs text-slate-600">未绑定</span>
                              )}
                              <code className="max-w-[280px] truncate rounded bg-blue-500/10 px-2 py-1 font-mono text-xs text-blue-300">
                                {event.new_machine_code}
                              </code>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3.5 w-3.5" />
                            <code className="font-mono">{event.client_ip ?? '未记录 IP'}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
                    暂无绑定时间线
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-slate-500">
                      共 {data.pagination.total} 条，第 {page}/{totalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((current) => current - 1)}
                        disabled={page <= 1 || loading}
                        className="rounded-lg border border-white/10 p-2 transition-colors hover:bg-white/5 disabled:opacity-30"
                        aria-label="上一页绑定历史"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage((current) => current + 1)}
                        disabled={page >= totalPages || loading}
                        className="rounded-lg border border-white/10 p-2 transition-colors hover:bg-white/5 disabled:opacity-30"
                        aria-label="下一页绑定历史"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <p>绑定历史加载失败</p>
              <button
                onClick={() => void fetchData()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5"
              >
                <RefreshCw className="h-4 w-4" />
                重新加载
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
