import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Filter,
  KeyRound,
  Megaphone,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldBan,
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
import MultiDeviceCdkList from '../components/MultiDeviceCdkList';
import api from '../api';
import type { Cdk } from '../types';

type TabKey = 'cdk' | 'multiDevice' | 'stats' | 'banned' | 'feedback' | 'announcement' | 'skinforge';

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
  const [activeTab, setActiveTab] = useState<TabKey>('cdk');
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
    setSearch(searchInput);
  };

  const handleStatusChange = (s: string) => {
    setPage(1);
    setStatus(s);
  };


  return (
    <Layout>
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-1 mb-8 bg-white/[0.03] border border-white/5 rounded-xl p-1 w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('cdk')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'cdk'
              ? 'bg-gradient-to-r from-blue-500/15 to-indigo-500/15 text-blue-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          CDK 管理
        </button>
        <button
          onClick={() => setActiveTab('multiDevice')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'multiDevice'
              ? 'bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <Network className="w-4 h-4" />
          多设备 CDK
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'stats'
              ? 'bg-gradient-to-r from-blue-500/15 to-indigo-500/15 text-blue-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          使用统计
        </button>
        <button
          onClick={() => setActiveTab('banned')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'banned'
              ? 'bg-gradient-to-r from-red-500/15 to-orange-500/15 text-red-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <ShieldBan className="w-4 h-4" />
          封禁管理
        </button>
        <button
          onClick={() => setActiveTab('feedback')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'feedback'
              ? 'bg-gradient-to-r from-sky-500/15 to-teal-500/15 text-sky-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          用户反馈
        </button>
        <button
          onClick={() => setActiveTab('announcement')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'announcement'
              ? 'bg-gradient-to-r from-violet-500/15 to-indigo-500/15 text-violet-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          公告管理
        </button>
        <button
          onClick={() => setActiveTab('skinforge')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'skinforge'
              ? 'bg-gradient-to-r from-cyan-500/15 to-blue-500/15 text-cyan-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />
          SkinForge
        </button>
      </div>

      {activeTab === 'cdk' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
            {[
              { label: '总数', value: stats.total, color: 'from-blue-500 to-blue-600' },
              { label: '未使用', value: stats.unused, color: 'from-cyan-500 to-cyan-600' },
              { label: '已激活', value: stats.activated, color: 'from-emerald-500 to-emerald-600' },
              { label: '已禁用', value: stats.disabled, color: 'from-red-500 to-red-600' },
              { label: '在线设备', value: stats.online_devices, color: 'from-violet-500 to-fuchsia-600' },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/[0.03] border border-white/5 rounded-xl p-5"
              >
                <div className="text-sm text-slate-400 mb-1">{s.label}</div>
                <div className={`text-2xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 text-sm text-slate-400">
                <Filter className="w-4 h-4" />
              </div>
              {statusFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => handleStatusChange(f.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                    status === f.value
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'text-slate-400 border-white/5 hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索 CDK / 机器码 / 备注"
                  className="pl-10 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all w-64"
                />
              </form>
              <button
                onClick={() => setShowExport(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 border border-white/10 rounded-xl transition-colors"
                title="导出 Excel"
              >
                <Download className="w-4 h-4" />
                导出
              </button>
              <button
                onClick={refreshAll}
                disabled={loading}
                className="p-2.5 hover:bg-white/5 border border-white/10 rounded-xl transition-colors"
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                生成 CDK
              </button>
            </div>
          </div>

          {/* Table */}
          <CDKTable
            items={items}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onRefresh={refreshAll}
          />

          {/* Create Modal */}
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
        </>
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
      ) : (
        <SkinforgeManager />
      )}
    </Layout>
  );
}
