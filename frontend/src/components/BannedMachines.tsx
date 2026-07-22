import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Plus,
  RefreshCw,
  Search,
  Copy,
  Check,
  ShieldOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '../api';
import { useToast } from './toastContext';
import type { BannedMachine } from '../types';

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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    setSearch(searchInput);
  };

  const handleBan = async () => {
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
        fetchData();
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
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
        fetchData();
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
        ? err.response.data.error
        : '解禁失败';
      toast(message, 'error');
    } finally {
      setUnbanning(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch {
          throw new Error('复制失败');
        } finally {
          textArea.remove();
        }
      }
      setCopiedCode(code);
      toast('已复制到剪贴板', 'success');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    const utcDate = new Date(d + 'Z');
    return utcDate.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <div className="text-sm text-slate-400 mb-1">已封禁设备</div>
          <div className="text-2xl font-bold bg-gradient-to-r from-red-500 to-orange-600 bg-clip-text text-transparent">
            {total}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索机器码 / 封禁原因"
            className="pl-10 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all w-72"
          />
        </form>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 hover:bg-white/5 border border-white/10 rounded-xl transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowBanModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-red-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            封禁机器码
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-white/5 rounded-xl">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left px-4 py-3 font-medium text-slate-400">机器码</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">封禁原因</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">封禁时间</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-16 text-slate-500">
                  {loading ? '加载中...' : '暂无封禁记录'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="group relative flex items-center gap-1">
                      <code className="text-xs text-slate-300 bg-white/5 px-2 py-1 rounded font-mono max-w-[240px] truncate block">
                        {item.machine_code}
                      </code>
                      <button
                        onClick={() => handleCopy(item.machine_code)}
                        className="p-1 hover:bg-white/5 rounded transition-colors shrink-0"
                      >
                        {copiedCode === item.machine_code ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-500" />
                        )}
                      </button>
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                        <div className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono shadow-xl max-w-xs break-all">
                          {item.machine_code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.reason ? (
                      <span className="text-slate-400 max-w-[200px] truncate block">
                        {item.reason}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmUnban(item.machine_code)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-lg transition-all"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      解禁
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            共 {total} 条，第 {page}/{totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="p-2 hover:bg-white/5 border border-white/10 rounded-lg disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="p-2 hover:bg-white/5 border border-white/10 rounded-lg disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowBanModal(false)}
          />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">封禁机器码</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">机器码</label>
                <input
                  type="text"
                  value={banCode}
                  onChange={(e) => setBanCode(e.target.value)}
                  placeholder="输入要封禁的机器码"
                  className="w-full px-4 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">
                  封禁原因 <span className="text-slate-600">（可选）</span>
                </label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="例如：异常使用、多设备共享"
                  className="w-full px-4 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBanModal(false)}
                className="flex-1 py-2.5 text-sm font-medium border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBan}
                disabled={banning || !banCode.trim()}
                className="flex-1 py-2.5 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {banning ? '封禁中...' : '确认封禁'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unban Confirm Modal */}
      {confirmUnban && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmUnban(null)}
          />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">确认解禁</h3>
            <p className="text-sm text-slate-400 mb-1">确定要解禁以下机器码吗？</p>
            <code className="text-sm text-emerald-400 font-mono break-all">{confirmUnban}</code>
            <p className="text-xs text-slate-500 mt-2">
              解禁后该机器码将可以正常使用 CDK 进行激活和验证。
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmUnban(null)}
                className="flex-1 py-2.5 text-sm font-medium border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUnban}
                disabled={unbanning}
                className="flex-1 py-2.5 text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {unbanning ? '解禁中...' : '确认解禁'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
