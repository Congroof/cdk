import { useState } from 'react';
import axios from 'axios';
import { Ban, Clock, History, KeyRound, Pencil } from 'lucide-react';
import type { Cdk } from '../types';
import api from '../api';
import { useToast } from './toastContext';
import { cdkStatusConfig } from '../utils/cdk';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';
import CdkBindingHistoryModal from './CdkBindingHistoryModal';
import EditValidityModal from './EditValidityModal';
import ResponsiveModal from './ui/ResponsiveModal';
import Pagination from './ui/Pagination';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';

interface Props {
  items: Cdk[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export default function CDKTable({
  items,
  total,
  page,
  pageSize,
  loading = false,
  onPageChange,
  onRefresh,
}: Props) {
  const { toast } = useToast();
  const [disabling, setDisabling] = useState<number | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [editingCdk, setEditingCdk] = useState<Cdk | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Cdk | null>(null);

  const handleDisable = async () => {
    if (!confirmCode) return;
    setDisabling(-1);
    try {
      await api.post('/cdk/disable', { code: confirmCode });
      toast('CDK 已禁用', 'success');
      onRefresh();
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : '禁用失败';
      toast(message, 'error');
    } finally {
      setDisabling(null);
      setConfirmCode(null);
    }
  };

  if (loading && items.length === 0) {
    return <Skeleton rows={6} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="暂无符合条件的 CDK 记录"
        description="你可以调整筛选状态、搜索关键词，或点击右上角「生成 CDK」创建新激活码。"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/[0.06] bg-[#0a0f1d] text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3.5 py-3.5 xl:px-4 text-left">CDK 码</th>
                <th className="px-3 py-3.5 xl:px-4 text-left">状态 / 有效期</th>
                <th className="px-3 py-3.5 xl:px-4 text-left">备注</th>
                <th className="px-3 py-3.5 xl:px-4 text-left">绑定机器码</th>
                <th className="px-3 py-3.5 xl:px-4 text-left">时间信息</th>
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
                        <code className="font-mono text-xs xl:text-[13px] font-medium text-slate-100 select-all">
                          {item.code}
                        </code>
                        <CopyButton text={item.code} size="md" />
                      </div>
                    </td>

                    <td className="px-3 py-3 xl:px-4 xl:py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
                          {status.label}
                        </span>
                        <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-xs text-slate-300 tabular-nums">
                          {item.valid_duration} {item.valid_unit === 'hours' ? '小时' : '天'}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 xl:px-4 xl:py-3.5">
                      {item.remark ? (
                        <span
                          className="block max-w-[100px] xl:max-w-[160px] truncate text-xs xl:text-sm text-slate-300"
                          title={item.remark}
                        >
                          {item.remark}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    <td className="px-3 py-3 xl:px-4 xl:py-3.5">
                      {item.machine_code ? (
                        <div className="flex items-center gap-1">
                          <code
                            className="block max-w-[125px] xl:max-w-[165px] truncate rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-slate-300"
                            title={item.machine_code}
                          >
                            {item.machine_code}
                          </code>
                          <CopyButton text={item.machine_code} />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">未绑定</span>
                      )}
                    </td>

                    <td className="px-3 py-3 xl:px-4 xl:py-3.5 text-xs tabular-nums">
                      <div className="text-slate-300">
                        <span className="text-slate-500 mr-1">过期:</span>
                        {formatDate(item.expires_at)}
                      </div>
                      <div className="mt-0.5 text-slate-500">
                        <span className="mr-1">创建:</span>
                        {formatDate(item.created_at)}
                      </div>
                    </td>

                    <td className="sticky right-0 z-10 bg-[#080d19]/95 group-hover:bg-[#0d1424]/95 px-3.5 py-3 xl:px-4 xl:py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)] transition-colors">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingHistory(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/15 bg-sky-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-sky-300 transition-all hover:bg-sky-500/15"
                        >
                          <History className="h-3.5 w-3.5" />
                          绑定详情
                        </button>
                        {item.status === 'unused' && (
                          <button
                            type="button"
                            onClick={() => setEditingCdk(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/15"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            改时长
                          </button>
                        )}
                        {item.status === 'activated' && (
                          <button
                            type="button"
                            onClick={() => setEditingCdk(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-all hover:bg-emerald-500/15"
                          >
                            <Clock className="h-3.5 w-3.5" />
                            延长
                          </button>
                        )}
                        {item.status !== 'disabled' && (
                          <button
                            type="button"
                            onClick={() => setConfirmCode(item.code)}
                            disabled={disabling !== null}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/15 bg-rose-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/15 disabled:opacity-50"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            禁用
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile & Tablet Card Stream View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
        {items.map((item) => {
          const status = cdkStatusConfig[item.status];
          return (
            <article
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
            >
              <div>
                {/* Card Header: Code & Status */}
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

                {/* Metadata Grid */}
                <dl className="mt-3.5 grid grid-cols-2 gap-2.5 rounded-xl border border-white/[0.05] bg-black/20 p-3 text-xs">
                  <div>
                    <dt className="text-slate-500">有效时长</dt>
                    <dd className="mt-0.5 font-medium text-slate-200 tabular-nums">
                      {item.valid_duration} {item.valid_unit === 'hours' ? '小时' : '天'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">备注</dt>
                    <dd className="mt-0.5 truncate text-slate-200" title={item.remark ?? undefined}>
                      {item.remark || '-'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">绑定机器码</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5">
                      {item.machine_code ? (
                        <>
                          <code className="min-w-0 flex-1 truncate font-mono text-slate-300">
                            {item.machine_code}
                          </code>
                          <CopyButton text={item.machine_code} />
                        </>
                      ) : (
                        <span className="text-slate-500">尚未绑定设备</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">创建时间</dt>
                    <dd className="mt-0.5 text-slate-300 tabular-nums">
                      {formatDate(item.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">过期时间</dt>
                    <dd className="mt-0.5 text-slate-300 tabular-nums">
                      {formatDate(item.expires_at)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Card Action Footer */}
              <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.05] pt-3">
                <button
                  type="button"
                  onClick={() => setViewingHistory(item)}
                  className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
                >
                  <History className="h-3.5 w-3.5" />
                  绑定详情
                </button>
                {item.status === 'unused' && (
                  <button
                    type="button"
                    onClick={() => setEditingCdk(item)}
                    className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    修改时长
                  </button>
                )}
                {item.status === 'activated' && (
                  <button
                    type="button"
                    onClick={() => setEditingCdk(item)}
                    className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    延长有效期
                  </button>
                )}
                {item.status !== 'disabled' && (
                  <button
                    type="button"
                    onClick={() => setConfirmCode(item.code)}
                    disabled={disabling !== null}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    禁用
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination */}
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={onPageChange}
      />

      {/* Disable Confirmation Modal */}
      <ResponsiveModal
        open={Boolean(confirmCode)}
        onClose={() => setConfirmCode(null)}
        title="确认禁用 CDK"
        description="禁用操作不可撤销，禁用后该激活码将立即失去激活与验证权限。"
        size="sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmCode(null)}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={disabling !== null}
              className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/15 py-2.5 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
            >
              {disabling !== null ? '禁用中...' : '确认禁用'}
            </button>
          </div>
        }
      >
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
          <div className="text-xs text-rose-300/70 mb-1">目标 CDK 码</div>
          <code className="break-all font-mono text-sm font-semibold text-rose-300">
            {confirmCode}
          </code>
        </div>
      </ResponsiveModal>

      <EditValidityModal
        cdk={editingCdk}
        onClose={() => setEditingCdk(null)}
        onSaved={onRefresh}
      />

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
