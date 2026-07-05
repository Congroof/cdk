import { useCallback, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Copy, KeyRound, Loader2, LogOut, Monitor, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import CopyButton from '../components/CopyButton';
import { useToast } from '../components/Toast';
import type { Cdk, CdkStatus, ValidUnit } from '../types';
import { CDK_DURATION_OPTIONS, DEFAULT_CDK_DURATION_OPTION } from '../utils/cdkOptions';
import { copyToClipboard } from '../utils/clipboard';
import { formatDate } from '../utils/format';

type MobileTab = 'generate' | 'query';

const statusFilters: { value: string; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'unused', label: '未使用' },
  { value: 'activated', label: '已激活' },
  { value: 'expired', label: '已过期' },
  { value: 'disabled', label: '已禁用' },
];

const statusConfig: Record<CdkStatus, { label: string; className: string }> = {
  unused: {
    label: '未使用',
    className: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  },
  activated: {
    label: '已激活',
    className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  expired: {
    label: '已过期',
    className: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  },
  disabled: {
    label: '已禁用',
    className: 'bg-red-500/10 text-red-300 border-red-500/20',
  },
};

interface CdkListData {
  items: Cdk[];
  total: number;
}

export default function MobileCdk() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<MobileTab>('generate');
  const [count, setCount] = useState(1);
  const [validDuration, setValidDuration] = useState(DEFAULT_CDK_DURATION_OPTION.validDuration);
  const [validUnit, setValidUnit] = useState<ValidUnit>(DEFAULT_CDK_DURATION_OPTION.validUnit);
  const [remark, setRemark] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copyingAll, setCopyingAll] = useState(false);
  const [items, setItems] = useState<Cdk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchCdks = useCallback(async (nextPage = page, nextStatus = status, nextSearch = search) => {
    setLoadingList(true);
    try {
      const params: Record<string, string | number> = {
        page: nextPage,
        page_size: pageSize,
      };
      if (nextStatus) params.status = nextStatus;
      if (nextSearch) params.search = nextSearch;
      const res = await api.get<{ success: boolean; data: CdkListData }>('/cdk/list', { params });
      if (res.data.success) {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      }
    } catch {
      // 401 由 axios interceptor 处理
    } finally {
      setLoadingList(false);
    }
  }, [page, status, search]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await api.post<{ success: boolean; data: { codes: string[] } }>('/cdk/generate', {
        count,
        valid_duration: validDuration,
        valid_unit: validUnit,
        remark: remark || null,
      });
      if (res.data.success) {
        setGeneratedCodes(res.data.data.codes);
        toast('CDK 已生成', 'success');
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
        ? err.response.data.error
        : '生成失败';
      toast(message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyAll = async () => {
    if (generatedCodes.length === 0) return;
    setCopyingAll(true);
    const ok = await copyToClipboard(generatedCodes.join('\n'));
    setCopyingAll(false);
    toast(ok ? '已复制全部 CDK' : '复制失败，请手动选择复制', ok ? 'success' : 'error');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextSearch = searchInput.trim();
    setPage(1);
    setSearch(nextSearch);
    fetchCdks(1, status, nextSearch);
  };

  const handleStatusChange = (nextStatus: string) => {
    setPage(1);
    setStatus(nextStatus);
    fetchCdks(1, nextStatus, search);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    fetchCdks(nextPage, status, search);
  };

  const handleDurationSelect = (validDuration: number, validUnit: ValidUnit) => {
    setValidDuration(validDuration);
    setValidUnit(validUnit);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">CDK 移动端</h1>
              <p className="truncate text-xs text-slate-500">生成与查询</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/')}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              title="进入 PC 端"
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-5">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-1">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'generate'
                ? 'bg-blue-500/15 text-blue-300'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            生成
          </button>
          <button
            onClick={() => {
              setActiveTab('query');
              fetchCdks();
            }}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'query'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Search className="h-4 w-4" />
            查询
          </button>
        </div>

        {activeTab === 'generate' ? (
          <section className="space-y-4">
            <form onSubmit={handleGenerate} className="space-y-4 rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-300">数量</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    required
                  />
                </label>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-300">有效时长</span>
                <div className="grid grid-cols-3 gap-2">
                  {CDK_DURATION_OPTIONS.map((option) => {
                    const selected = validDuration === option.validDuration && validUnit === option.validUnit;
                    return (
                      <button
                        key={`${option.validDuration}-${option.validUnit}`}
                        type="button"
                        onClick={() => handleDurationSelect(option.validDuration, option.validUnit)}
                        className={`min-h-11 rounded-xl border text-sm font-medium transition-all ${
                          selected
                            ? 'border-blue-500/30 bg-blue-500/20 text-blue-300'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-300">备注</span>
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="可选，例如客户名"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white placeholder-slate-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </label>

              <button
                type="submit"
                disabled={generating}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    生成 CDK
                  </>
                )}
              </button>
            </form>

            {generatedCodes.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-400">共生成 {generatedCodes.length} 个</span>
                  <button
                    onClick={handleCopyAll}
                    disabled={copyingAll}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {copyingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    复制全部
                  </button>
                </div>
                <div className="space-y-2">
                  {generatedCodes.map((code) => (
                    <div key={code} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                      <code className="min-w-0 break-all font-mono text-sm text-blue-300">{code}</code>
                      <CopyButton text={code} size="md" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索 CDK / 机器码 / 备注"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white placeholder-slate-500 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <button
                type="submit"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 transition-colors hover:bg-emerald-500/20"
                title="查询"
              >
                <Search className="h-4 w-4" />
              </button>
            </form>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => handleStatusChange(filter.value)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-sm transition-all ${
                    status === filter.value
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/5 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>共 {total} 条</span>
              <button
                onClick={() => fetchCdks()}
                disabled={loadingList}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>

            <div className="space-y-3">
              {loadingList ? (
                <div className="flex min-h-32 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  加载中...
                </div>
              ) : items.length === 0 ? (
                <div className="flex min-h-32 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-sm text-slate-500">
                  暂无数据
                </div>
              ) : (
                items.map((item) => {
                  const currentStatus = statusConfig[item.status];
                  return (
                    <article key={item.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <code className="min-w-0 break-all font-mono text-sm text-white">{item.code}</code>
                            <CopyButton text={item.code} size="md" />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatus.className}`}>
                              {currentStatus.label}
                            </span>
                            <span className="text-xs text-slate-500">
                              {item.valid_duration} {item.valid_unit === 'hours' ? '小时' : '天'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <dl className="space-y-2 text-sm">
                        <div className="flex gap-3">
                          <dt className="w-16 shrink-0 text-slate-500">机器码</dt>
                          <dd className="min-w-0 flex-1 break-all font-mono text-xs text-slate-300">
                            {item.machine_code || '-'}
                          </dd>
                        </div>
                        <div className="flex gap-3">
                          <dt className="w-16 shrink-0 text-slate-500">备注</dt>
                          <dd className="min-w-0 flex-1 break-all text-slate-300">{item.remark || '-'}</dd>
                        </div>
                        <div className="flex gap-3">
                          <dt className="w-16 shrink-0 text-slate-500">创建</dt>
                          <dd className="min-w-0 flex-1 text-slate-300">{formatDate(item.created_at)}</dd>
                        </div>
                        <div className="flex gap-3">
                          <dt className="w-16 shrink-0 text-slate-500">过期</dt>
                          <dd className="min-w-0 flex-1 text-slate-300">{formatDate(item.expires_at)}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pb-6 text-sm">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page <= 1 || loadingList}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
                上一页
              </button>
              <span className="text-slate-500">
                {page}/{totalPages}
              </span>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || loadingList}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-30"
              >
                下一页
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
