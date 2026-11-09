import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Link2,
  MapPin,
  Monitor,
  Network,
  RefreshCw,
  Repeat2,
} from 'lucide-react';
import api from '../api';
import type { Cdk, CdkBindingHistoryData } from '../types';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';
import { useToast } from './toastContext';
import ResponsiveModal from './ui/ResponsiveModal';
import Pagination from './ui/Pagination';
import Badge from './ui/Badge';

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

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title="CDK 绑定详情"
      description={
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-300">
          <span className="truncate max-w-[260px] sm:max-w-md">{cdk.code}</span>
          <CopyButton text={cdk.code} />
        </span>
      }
      size="2xl"
    >
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          正在加载绑定历史...
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Monitor className="h-4 w-4 text-emerald-400" />
                当前绑定机器
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <code
                  className="block min-w-0 flex-1 truncate font-mono text-xs sm:text-sm text-slate-200"
                  title={data.summary.current_machine_code ?? undefined}
                >
                  {data.summary.current_machine_code ?? '尚未绑定'}
                </code>
                {data.summary.current_machine_code && (
                  <CopyButton text={data.summary.current_machine_code} />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Network className="h-4 w-4 text-sky-400" />
                历史机器数
              </div>
              <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
                {data.summary.machine_count}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Link2 className="h-4 w-4 text-blue-400" />
                成功绑定
              </div>
              <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
                {data.summary.binding_count}
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Repeat2 className="h-4 w-4 text-violet-400" />
                换绑次数
              </div>
              <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
                {data.summary.rebind_count}
              </p>
            </div>
          </div>

          {/* Associated Machines */}
          <section>
            <div className="mb-3">
              <h4 className="text-sm font-medium text-slate-200">关联机器汇总</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                次数仅统计已记录的成功激活和换绑；老数据缺少首次绑定记录时会明确标记。
              </p>
            </div>

            {data.summary.machine_count > data.machines.length && (
              <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
                历史机器较多，当前仅展示最近绑定的 {data.machines.length} 台；历史机器总数为{' '}
                {data.summary.machine_count} 台。
              </div>
            )}

            {data.machines.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                <table className="w-full whitespace-nowrap text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-xs text-slate-400">
                      <th className="px-4 py-3 font-medium">机器码</th>
                      <th className="px-4 py-3 font-medium">成功绑定次数</th>
                      <th className="px-4 py-3 font-medium">首次记录</th>
                      <th className="px-4 py-3 font-medium">最近记录</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {data.machines.map((machine) => (
                      <tr
                        key={machine.machine_code}
                        className="transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="max-w-[180px] sm:max-w-[260px] truncate font-mono text-xs text-slate-200">
                              {machine.machine_code}
                            </code>
                            <CopyButton text={machine.machine_code} />
                            {machine.is_current && (
                              <Badge variant="success" dot>
                                当前
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {machine.binding_count_complete ? (
                            <span className="font-medium text-blue-400">
                              {machine.binding_count} 次
                            </span>
                          ) : (
                            <Badge variant="warning">历史记录，次数未知</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 tabular-nums">
                          {formatDate(machine.first_bound_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-400 tabular-nums">
                          {formatDate(machine.last_bound_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
                该 CDK 暂无成功绑定记录
              </div>
            )}
          </section>

          {/* Timeline Events */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-slate-200">绑定时间线</h4>
                <p className="mt-0.5 text-xs text-slate-500">按最近发生时间倒序展示</p>
              </div>
              {loading && <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}
            </div>

            {data.events.length > 0 ? (
              <div className="space-y-2.5">
                {data.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:p-4"
                  >
                    <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={event.event_type === 'activate' ? 'success' : 'purple'}
                            dot
                          >
                            {event.event_type === 'activate' ? '首次激活' : '设备换绑'}
                          </Badge>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {formatDate(event.created_at)}
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {event.old_machine_code ? (
                            <>
                              <code className="max-w-[220px] truncate rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-slate-400">
                                {event.old_machine_code}
                              </code>
                              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">未绑定 →</span>
                          )}
                          <code className="max-w-[220px] truncate rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 font-mono text-xs text-blue-300">
                            {event.new_machine_code}
                          </code>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <code className="font-mono">{event.client_ip ?? '未记录 IP'}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
                暂无绑定时间线
              </div>
            )}

            <Pagination
              total={data.pagination.total}
              page={page}
              pageSize={data.pagination.page_size}
              loading={loading}
              onPageChange={setPage}
            />
          </section>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <p className="text-sm">绑定历史加载失败</p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4" />
            重新加载
          </button>
        </div>
      )}
    </ResponsiveModal>
  );
}
