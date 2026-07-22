import { useState } from 'react';
import axios from 'axios';
import { Ban, ChevronLeft, ChevronRight, Clock, History, Pencil } from 'lucide-react';
import type { Cdk, CdkStatus } from '../types';
import api from '../api';
import { useToast } from './toastContext';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';
import CdkBindingHistoryModal from './CdkBindingHistoryModal';
import EditValidityModal from './EditValidityModal';

const statusConfig: Record<CdkStatus, { label: string; className: string }> = {
  unused: {
    label: '未使用',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  activated: {
    label: '已激活',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  expired: {
    label: '已过期',
    className: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
  disabled: {
    label: '已禁用',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
};

interface Props {
  items: Cdk[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export default function CDKTable({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onRefresh,
}: Props) {
  const { toast } = useToast();
  const [disabling, setDisabling] = useState<number | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [editingCdk, setEditingCdk] = useState<Cdk | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Cdk | null>(null);

  const totalPages = Math.ceil(total / pageSize);

  const handleDisableConfirm = (code: string) => {
    setConfirmCode(code);
  };

  const handleDisable = async () => {
    if (!confirmCode) return;
    setDisabling(-1);
    try {
      await api.post('/cdk/disable', { code: confirmCode });
      toast('CDK 已禁用', 'success');
      onRefresh();
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
        ? err.response.data.error
        : '禁用失败';
      toast(message, 'error');
    } finally {
      setDisabling(null);
      setConfirmCode(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-white/5 rounded-xl">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left px-4 py-3 font-medium text-slate-400">CDK 码</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">有效期</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">机器码</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">过期时间</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const status = statusConfig[item.status];
                return (
                  <tr
                    key={item.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-white">{item.code}</code>
                        <CopyButton text={item.code} size="md" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 text-xs font-medium border rounded-full ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {item.valid_duration} {item.valid_unit === 'hours' ? '小时' : '天'}
                    </td>
                    <td className="px-4 py-3">
                      {item.machine_code ? (
                        <div className="group relative flex items-center gap-1">
                          <code className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded font-mono max-w-[160px] truncate block">
                            {item.machine_code}
                          </code>
                          <CopyButton text={item.machine_code} />
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                            <div className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono shadow-xl max-w-xs break-all">
                              {item.machine_code}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(item.expires_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setViewingHistory(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/10 rounded-lg transition-all"
                        >
                          <History className="w-3.5 h-3.5" />
                          绑定详情
                        </button>
                        {item.status === 'unused' && (
                          <button
                            onClick={() => setEditingCdk(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 rounded-lg transition-all"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            编辑有效期
                          </button>
                        )}
                        {item.status === 'activated' && (
                          <button
                            onClick={() => setEditingCdk(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-lg transition-all"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            延长
                          </button>
                        )}
                        {item.status !== 'disabled' && (
                          <button
                            onClick={() => handleDisableConfirm(item.code)}
                            disabled={disabling !== null}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-lg transition-all disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            禁用
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            共 {total} 条，第 {page}/{totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-2 hover:bg-white/5 border border-white/10 rounded-lg disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-2 hover:bg-white/5 border border-white/10 rounded-lg disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {confirmCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmCode(null)} />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">确认禁用</h3>
            <p className="text-sm text-slate-400 mb-1">确定要禁用以下 CDK 吗？</p>
            <code className="text-sm text-red-400 font-mono">{confirmCode}</code>
            <p className="text-xs text-slate-500 mt-2">此操作不可撤销，禁用后该 CDK 将无法使用。</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmCode(null)}
                className="flex-1 py-2.5 text-sm font-medium border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDisable}
                disabled={disabling !== null}
                className="flex-1 py-2.5 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                确认禁用
              </button>
            </div>
          </div>
        </div>
      )}

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
