import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldOff,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import Layout from '../components/Layout';
import CDKTable from '../components/CDKTable';
import CreateModal from '../components/CreateModal';
import ExportModal from '../components/ExportModal';
import UsageStats from '../components/UsageStats';
import BannedMachines from '../components/BannedMachines';
import FeedbackList from '../components/FeedbackList';
import AnnouncementEditor from '../components/AnnouncementEditor';
import SkinforgeManager from '../components/SkinforgeManager';
import SkinforgeModManager from '../components/SkinforgeModManager';
import MultiDeviceCdkList from '../components/MultiDeviceCdkList';
import StatCard from '../components/ui/StatCard';
import api from '../api';
import type { Cdk, DashboardTab } from '../types';

const VALID_TABS: DashboardTab[] = [
  'cdk',
  'multiDevice',
  'stats',
  'banned',
  'feedback',
  'announcement',
  'skinforge',
  'mods',
];

function parseTabParam(raw: string | null): DashboardTab {
  if (raw && VALID_TABS.includes(raw as DashboardTab)) {
    return raw as DashboardTab;
  }
  return 'cdk';
}

const statusFilters: { value: string; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'unused', label: '未使用' },
  { value: 'activated', label: '已激活' },
  { value: 'expired', label: '已过期' },
  { value: 'disabled', label: '已禁用' },
];

interface Stats {
  total: number;
  unused: number;
  activated: number;
  expired: number;
  disabled: number;
  online_devices: number;
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTabParam(searchParams.get('tab'));

  const [items, setItems] = useState<Cdk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    unused: 0,
    activated: 0,
    expired: 0,
    disabled: 0,
    online_devices: 0,
  });

  const handleTabChange = (nextTab: DashboardTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'cdk') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/cdk/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch {
      // handled by interceptor
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (status) params.status = status;
      if (search) params.search = search;
      const res = await api.get('/cdk/list', { params });
      if (res.data.success) {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, search]);

  const refreshAll = useCallback(() => {
    void fetchData();
    void fetchStats();
  }, [fetchData, fetchStats]);

  useEffect(() => {
    void Promise.resolve().then(refreshAll);
  }, [refreshAll]);

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

  const handleStatusChange = (s: string) => {
    setPage(1);
    setStatus(s);
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onQuickCreateCdk={() => setShowCreate(true)}
    >
      {activeTab === 'cdk' ? (
        <div className="space-y-6">
          {/* Stats Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              label="CDK 总数"
              value={stats.total}
              subtitle={`已过期 ${stats.expired.toLocaleString()}`}
              icon={KeyRound}
              tone="blue"
            />
            <StatCard
              label="未使用"
              value={stats.unused}
              subtitle="可随时分发激活"
              icon={Sparkles}
              tone="cyan"
            />
            <StatCard
              label="已激活"
              value={stats.activated}
              subtitle="有效授权周期内"
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatCard
              label="已禁用"
              value={stats.disabled}
              subtitle="管理员手动封停"
              icon={ShieldOff}
              tone="rose"
            />
            <div className="col-span-2 sm:col-span-1">
              <StatCard
                label="在线设备"
                value={stats.online_devices}
                subtitle="实时活跃终端"
                icon={Wifi}
                tone="violet"
              />
            </div>
          </div>

          {/* Filter & Action Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 sm:p-4">
            {/* Status Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {statusFilters.map((f) => {
                const active = status === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => handleStatusChange(f.value)}
                    className={`shrink-0 rounded-xl border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                      active
                        ? 'border-blue-500/30 bg-blue-500/15 text-blue-300 shadow-sm'
                        : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Search & Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <form onSubmit={handleSearch} className="relative flex-1 sm:w-72">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索 CDK / 机器码 / 备注..."
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-8 text-sm text-white placeholder-slate-500 transition-all focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                  onClick={() => setShowExport(true)}
                  className="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-xs sm:text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.07]"
                  title="导出 Excel"
                >
                  <Download className="h-4 w-4 text-slate-400" />
                  <span>导出</span>
                </button>

                <button
                  type="button"
                  onClick={refreshAll}
                  disabled={loading}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
                  title="刷新数据"
                  aria-label="刷新数据"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 text-xs sm:text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-600 hover:to-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>生成 CDK</span>
                </button>
              </div>
            </div>
          </div>

          {/* Data View (PC Table + Mobile Cards) */}
          <CDKTable
            items={items}
            total={total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            onPageChange={setPage}
            onRefresh={refreshAll}
          />
        </div>
      ) : activeTab === 'multiDevice' ? (
        <MultiDeviceCdkList />
      ) : activeTab === 'stats' ? (
        <UsageStats />
      ) : activeTab === 'banned' ? (
        <BannedMachines />
      ) : activeTab === 'feedback' ? (
        <FeedbackList />
      ) : activeTab === 'announcement' ? (
        <AnnouncementEditor />
      ) : activeTab === 'mods' ? (
        <SkinforgeModManager />
      ) : (
        <SkinforgeManager />
      )}

      {/* Global Create CDK Modal (accessible from any tab via Sidebar/Header CTA) */}
      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refreshAll}
      />

      {/* Export Modal */}
      <ExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
      />
    </Layout>
  );
}
