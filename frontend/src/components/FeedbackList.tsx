import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  MessageSquareText,
  RefreshCw,
  Search,
} from 'lucide-react';
import api from '../api';
import type { FeedbackListResponse, UserFeedback } from '../types';
import { formatDate } from '../utils/format';
import { useToast } from './Toast';

const typeFilters = [
  { value: '', label: '全部类型' },
  { value: 'general', label: '通用' },
  { value: 'bug', label: '问题' },
  { value: 'feature', label: '建议' },
  { value: 'payment', label: '支付' },
  { value: 'activation', label: '激活' },
];

const doneFilters = [
  { value: '', label: '全部状态' },
  { value: 'false', label: '待处理' },
  { value: 'true', label: '已完成' },
];

const typeLabel: Record<string, string> = {
  general: '通用',
  bug: '问题',
  feature: '建议',
  payment: '支付',
  activation: '激活',
};

export default function FeedbackList() {
  const { toast } = useToast();
  const [items, setItems] = useState<UserFeedback[]>([]);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [done, setDone] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [feedbackType, setFeedbackType] = useState('');
  const [doneFilter, setDoneFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = {
        page,
        page_size: pageSize,
      };
      if (feedbackType) params.feedback_type = feedbackType;
      if (doneFilter) params.is_done = doneFilter === 'true';
      if (search) params.search = search;

      const res = await api.get('/feedback/list', { params });
      if (res.data.success) {
        const data = res.data.data as FeedbackListResponse;
        setItems(data.items);
        setTotal(data.total);
        setPending(data.pending);
        setDone(data.done);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, feedbackType, doneFilter, search]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleTypeChange = (value: string) => {
    setPage(1);
    setFeedbackType(value);
  };

  const handleDoneFilterChange = (value: string) => {
    setPage(1);
    setDoneFilter(value);
  };

  const handleSetDone = async (item: UserFeedback, isDone: boolean) => {
    setUpdatingId(item.id);
    try {
      const res = await api.post('/feedback/set-done', {
        id: item.id,
        is_done: isDone,
      });
      if (res.data.success) {
        toast(isDone ? '反馈已标记完成' : '反馈已重新打开', 'success');
        fetchData();
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '更新失败'), 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <div className="text-sm text-slate-400 mb-1">反馈总数</div>
          <div className="text-2xl font-bold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
            {pending + done}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <div className="text-sm text-slate-400 mb-1">待处理</div>
          <div className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            {pending}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <div className="text-sm text-slate-400 mb-1">已完成</div>
          <div className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
            {done}
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {doneFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleDoneFilterChange(filter.value)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                doneFilter === filter.value
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'text-slate-400 border-white/5 hover:bg-white/5'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleTypeChange(filter.value)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                feedbackType === filter.value
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                  : 'text-slate-400 border-white/5 hover:bg-white/5'
              }`}
            >
              {filter.label}
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
              placeholder="搜索内容 / 联系方式 / 机器码"
              className="pl-10 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all w-72"
            />
          </form>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 hover:bg-white/5 border border-white/10 rounded-xl transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-white/5 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left px-4 py-3 font-medium text-slate-400 min-w-[320px]">反馈内容</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">类型</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">关联信息</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">提交时间</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-500">
                  {loading ? '加载中...' : '暂无反馈记录'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors align-top"
                >
                  <td className="px-4 py-3">
                    <div className="max-w-xl">
                      <p className="text-slate-200 whitespace-pre-wrap break-words leading-6">
                        {item.content}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.contact && (
                          <span className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded">
                            联系：{item.contact}
                          </span>
                        )}
                        {item.app_version && (
                          <span className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded">
                            版本：{item.app_version}
                          </span>
                        )}
                        {item.platform && (
                          <span className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded">
                            平台：{item.platform}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium border rounded-full bg-sky-500/10 text-sky-400 border-sky-500/20">
                      <MessageSquareText className="w-3 h-3" />
                      {typeLabel[item.feedback_type] || item.feedback_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <div className="space-y-1">
                      {item.machine_code && (
                        <code className="block text-xs text-slate-400 bg-white/5 px-2 py-1 rounded font-mono max-w-[240px] truncate">
                          机器：{item.machine_code}
                        </code>
                      )}
                      {item.cdk_code && (
                        <code className="block text-xs text-slate-400 bg-white/5 px-2 py-1 rounded font-mono max-w-[240px] truncate">
                          CDK：{item.cdk_code}
                        </code>
                      )}
                      {!item.machine_code && !item.cdk_code && (
                        <span className="text-slate-600">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium border rounded-full ${
                        item.is_done
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {item.is_done ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Circle className="w-3 h-3" />
                      )}
                      {item.is_done ? '已完成' : '待处理'}
                    </span>
                    {item.done_at && (
                      <div className="text-xs text-slate-500 mt-1">{formatDate(item.done_at)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleSetDone(item, !item.is_done)}
                      disabled={updatingId === item.id}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all disabled:opacity-50 ${
                        item.is_done
                          ? 'text-amber-400 hover:text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/10'
                          : 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/10'
                      }`}
                    >
                      {item.is_done ? (
                        <Circle className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {item.is_done ? '重新打开' : '标记完成'}
                    </button>
                  </td>
                </tr>
              ))
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
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof err.response === 'object' &&
    err.response !== null &&
    'data' in err.response &&
    typeof err.response.data === 'object' &&
    err.response.data !== null &&
    'error' in err.response.data &&
    typeof err.response.data.error === 'string'
  ) {
    return err.response.data.error;
  }

  return fallback;
}
