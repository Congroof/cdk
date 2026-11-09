import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Plus,
  RefreshCw,
  Search,
  ShieldBan,
  ShieldOff,
  X,
} from 'lucide-react';
import api from '../api';
import { useToast } from './toastContext';
import type { BannedMachine } from '../types';
import { formatDate } from '../utils/format';
import CopyButton from './CopyButton';
import StatCard from './ui/StatCard';
import ResponsiveModal from './ui/ResponsiveModal';
import Pagination from './ui/Pagination';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';

export default function BannedMachines() {
  const { toast } = useToast();
  const [items, setItems] = useState<BannedMachine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banCode, setBanCode] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [confirmUnban, setConfirmUnban] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search) params.search = search;
      const res = await api.get('/banned/list', { params });
      if (res.data.success) {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setPage(1);
    setSearch('');
  };

  const handleBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banCode.trim()) {
      toast('请输入机器码', 'error');
      return;
    }
    setBanning(true);
    try {
      const res = await api.post('/banned/ban', {
        machine_code: banCode.trim(),
        reason: banReason.trim() || null,
      });
      if (res.data.success) {
        toast('机器码已封禁', 'success');
        setShowBanModal(false);
        setBanCode('');
        setBanReason('');
        void fetchData();
      }
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : '封禁失败';
      toast(message, 'error');
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async () => {
    if (!confirmUnban) return;
    setUnbanning(true);
    try {
      const res = await api.post('/banned/unban', { machine_code: confirmUnban });
      if (res.data.success) {
        toast('机器码已解禁', 'success');
        setConfirmUnban(null);
        void fetchData();
      }
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : '解禁失败';
      toast(message, 'error');
    } finally {
      setUnbanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats & Toolbar Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <StatCard
          label="黑名单封禁设备数"
          value={total}
          subtitle="被封禁设备无法激活或验证任何 CDK"
          icon={ShieldBan}
          tone="rose"
        />

        <div className="lg:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索机器码 / 封禁原因..."
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-8 text-sm text-white placeholder-slate-500 transition-all focus:border-rose-500/40 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07]"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-rose-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowBanModal(true)}
              className="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-600 px-4 text-xs sm:text-sm font-medium text-white shadow-lg shadow-rose-500/20 transition-all hover:from-rose-600 hover:to-orange-700"
            >
              <Plus className="h-4 w-4" />
              封禁机器码
            </button>
          </div>
        </div>
      </div>

      {/* Data View */}
      {loading && items.length === 0 ? (
        <Skeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldBan}
          title={search ? '没有找到匹配的封禁记录' : '当前暂无封禁设备记录'}
          description="点击右上角「封禁机器码」可将异常或恶意设备加入黑名单。"
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0a0f1d] text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3.5 text-left">机器码</th>
                    <th className="px-4 py-3.5 text-left">封禁原因</th>
                    <th className="px-4 py-3.5 text-left">封禁时间</th>
                    <th className="sticky right-0 z-10 bg-[#0a0f1d]/95 px-4 py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="group transition-colors hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <code
                            className="block max-w-[300px] truncate rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-slate-200"
                            title={item.machine_code}
                          >
                            {item.machine_code}
                          </code>
                          <CopyButton text={item.machine_code} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {item.reason ? (
                          <span
                            className="block max-w-[260px] truncate text-slate-300"
                            title={item.reason}
                          >
                            {item.reason}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 tabular-nums">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="sticky right-0 z-10 bg-[#080d19]/95 group-hover:bg-[#0d1424]/95 px-4 py-3.5 text-right backdrop-blur-md shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.65)] transition-colors">
                        <button
                          type="button"
                          onClick={() => setConfirmUnban(item.machine_code)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-all hover:bg-emerald-500/20"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                          解禁
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500 mb-1">被封禁机器码</div>
                    <div className="flex items-center gap-1.5">
                      <code className="min-w-0 break-all font-mono text-xs font-medium text-rose-300">
                        {item.machine_code}
                      </code>
                      <CopyButton text={item.machine_code} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.05] bg-black/20 p-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">封禁原因</span>
                    <span className="mt-0.5 block text-slate-200 break-words">
                      {item.reason || '未填写'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">封禁时间</span>
                    <span className="mt-0.5 block text-slate-300 tabular-nums">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmUnban(item.machine_code)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  解除封禁
                </button>
              </article>
            ))}
          </div>

          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Ban Machine Modal */}
      <ResponsiveModal
        open={showBanModal}
        onClose={() => setShowBanModal(false)}
        title="封禁机器码"
        description="被封禁的设备将无法使用任何 CDK 进行激活或心跳校验"
        size="md"
      >
        <form onSubmit={handleBan} className="space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
              设备机器码
            </label>
            <input
              type="text"
              value={banCode}
              onChange={(e) => setBanCode(e.target.value)}
              placeholder="粘贴要封禁的机器码"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 font-mono text-sm text-white placeholder-slate-500 transition-all focus:border-rose-500/40 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              required
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
              封禁原因 <span className="text-slate-500 font-normal">（可选）</span>
            </label>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="例如：恶意破解、多设备非法共享"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder-slate-500 transition-all focus:border-rose-500/40 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowBanModal(false)}
              className="flex-1 h-11 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={banning || !banCode.trim()}
              className="flex-1 h-11 rounded-xl border border-rose-500/30 bg-rose-500/15 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
            >
              {banning ? '封禁中...' : '确认封禁'}
            </button>
          </div>
        </form>
      </ResponsiveModal>

      {/* Unban Confirm Modal */}
      <ResponsiveModal
        open={Boolean(confirmUnban)}
        onClose={() => setConfirmUnban(null)}
        title="确认解除封禁"
        description="解禁后该机器码将立即恢复正常的 CDK 激活和验证权限。"
        size="sm"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmUnban(null)}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleUnban}
              disabled={unbanning}
              className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {unbanning ? '解禁中...' : '确认解禁'}
            </button>
          </div>
        }
      >
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
          <div className="text-xs text-emerald-300/70 mb-1">目标机器码</div>
          <code className="break-all font-mono text-xs sm:text-sm font-semibold text-emerald-300">
            {confirmUnban}
          </code>
        </div>
      </ResponsiveModal>
    </div>
  );
}
