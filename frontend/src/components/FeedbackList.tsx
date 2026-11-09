import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  MessageSquare,
  MessageSquareReply,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import api from '../api';
import type { FeedbackListResponse, UserFeedback } from '../types';
import { formatDate } from '../utils/format';
import { useToast } from './toastContext';
import StatCard from './ui/StatCard';
import Badge from './ui/Badge';
import ResponsiveModal from './ui/ResponsiveModal';
import Pagination from './ui/Pagination';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import CopyButton from './CopyButton';

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

const typeConfig: Record<
  string,
  { label: string; variant: 'default' | 'danger' | 'purple' | 'warning' | 'brand' }
> = {
  general: { label: '通用', variant: 'default' },
  bug: { label: '问题', variant: 'danger' },
  feature: { label: '建议', variant: 'purple' },
  payment: { label: '支付', variant: 'warning' },
  activation: { label: '激活', variant: 'brand' },
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
  const [viewingItem, setViewingItem] = useState<UserFeedback | null>(null);
  const [replyingItem, setReplyingItem] = useState<UserFeedback | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [savingReply, setSavingReply] = useState(false);

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
    setSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setPage(1);
    setSearch('');
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
        const message =
          (res.data.data as { message?: string } | undefined)?.message ??
          (isDone ? '反馈已标记完成' : '反馈已标记待处理');
        toast(message, 'success');
        void fetchData();
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '更新失败'), 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const openReplyEditor = (item: UserFeedback) => {
    setReplyingItem(item);
    setReplyInput(item.reply ?? '');
  };

  const closeReplyEditor = () => {
    if (savingReply) return;
    setReplyingItem(null);
    setReplyInput('');
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyingItem) return;

    const reply = replyInput.trim();
    if (!reply) {
      toast('反馈回复不能为空', 'error');
      return;
    }

    setSavingReply(true);
    try {
      const res = await api.post('/feedback/reply', {
        id: replyingItem.id,
        reply,
      });
      if (res.data.success) {
        const message =
          (res.data.data as { message?: string } | undefined)?.message ?? '反馈回复已保存';
        toast(message, 'success');
        setReplyingItem(null);
        setReplyInput('');
        void fetchData();
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '回复保存失败'), 'error');
    } finally {
      setSavingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="反馈工单总数"
          value={pending + done}
          subtitle="累计收到的客户端用户反馈"
          icon={MessageSquare}
          tone="blue"
        />
        <StatCard
          label="待处理反馈"
          value={pending}
          subtitle="等待管理员排查或回复"
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="已完成反馈"
          value={done}
          subtitle="已解决或归档的工单"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {doneFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => handleDoneFilterChange(filter.value)}
              className={`rounded-xl border px-3 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                doneFilter === filter.value
                  ? 'border-blue-500/30 bg-blue-500/15 text-blue-300'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <div className="mx-1 hidden sm:block h-5 w-px bg-white/10" />
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => handleTypeChange(filter.value)}
              className={`rounded-xl border px-3 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                feedbackType === filter.value
                  ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索内容 / 联系方式 / 机器码..."
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
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07]"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Data View */}
      {loading && items.length === 0 ? (
        <Skeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="暂无匹配的反馈记录"
          description="尝试调整筛选状态、反馈分类或清空搜索关键词。"
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="w-40 px-4 py-3.5 text-left">类型 / 状态</th>
                  <th className="px-4 py-3.5 text-left">反馈内容与回复摘要</th>
                  <th className="w-48 px-4 py-3.5 text-left">来源信息</th>
                  <th className="w-40 px-4 py-3.5 text-left">提交时间</th>
                  <th className="w-64 px-4 py-3.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {items.map((item) => {
                  const typeMeta = typeConfig[item.feedback_type] ?? {
                    label: item.feedback_type,
                    variant: 'default' as const,
                  };
                  return (
                    <tr
                      key={item.id}
                      className="align-top transition-colors hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
                            <Badge variant={item.is_done ? 'success' : 'warning'} dot>
                              {item.is_done ? '已完成' : '待处理'}
                            </Badge>
                          </div>
                          {item.reply && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300">
                              <MessageSquareReply className="h-3 w-3" />
                              已回复
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <p
                          className="line-clamp-2 text-slate-200 leading-relaxed break-words cursor-pointer hover:text-white"
                          onClick={() => setViewingItem(item)}
                          title={item.content}
                        >
                          {item.content}
                        </p>
                        {item.reply && (
                          <p className="mt-1.5 truncate rounded-lg border border-indigo-500/15 bg-indigo-500/[0.06] px-2.5 py-1 text-xs text-indigo-200/90">
                            回复：{item.reply}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs">
                        <div className="truncate text-slate-300" title={item.contact ?? undefined}>
                          <span className="text-slate-500 mr-1">联系:</span>
                          {item.contact || '未提供'}
                        </div>
                        <div className="mt-1 truncate text-slate-400 font-mono">
                          <span className="font-sans text-slate-500 mr-1">版本:</span>
                          {item.app_version || '-'}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-400 tabular-nums">
                        {formatDate(item.created_at)}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/15"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            详情
                          </button>
                          <button
                            type="button"
                            onClick={() => openReplyEditor(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/15 bg-indigo-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition-all hover:bg-indigo-500/15"
                          >
                            <MessageSquareReply className="h-3.5 w-3.5" />
                            {item.reply ? '改回复' : '回复'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetDone(item, !item.is_done)}
                            disabled={updatingId === item.id}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                              item.is_done
                                ? 'border-amber-500/15 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/15'
                                : 'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300 hover:bg-emerald-500/15'
                            }`}
                          >
                            {item.is_done ? (
                              <Circle className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            {item.is_done ? '重开' : '完成'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile & Tablet Card Stream */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {items.map((item) => {
              const typeMeta = typeConfig[item.feedback_type] ?? {
                label: item.feedback_type,
                variant: 'default' as const,
              };
              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 space-y-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
                        <Badge variant={item.is_done ? 'success' : 'warning'} dot>
                          {item.is_done ? '已完成' : '待处理'}
                        </Badge>
                        {item.reply && <Badge variant="purple">已回复</Badge>}
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatDate(item.created_at)}
                      </span>
                    </div>

                    <p
                      onClick={() => setViewingItem(item)}
                      className="mt-3 line-clamp-3 text-sm text-slate-200 leading-relaxed break-words"
                    >
                      {item.content}
                    </p>

                    {item.reply && (
                      <div className="mt-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.07] px-3 py-2 text-xs text-indigo-200">
                        <span className="font-medium text-indigo-300">管理员回复：</span>
                        <span className="line-clamp-2 mt-0.5 block">{item.reply}</span>
                      </div>
                    )}

                    {(item.contact || item.app_version) && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        {item.contact && <span>联系: {item.contact}</span>}
                        {item.app_version && <span>版本: {item.app_version}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t border-white/[0.05] pt-3">
                    <button
                      type="button"
                      onClick={() => setViewingItem(item)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-blue-500/20 bg-blue-500/10 py-2 text-xs font-medium text-blue-300"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      详情
                    </button>
                    <button
                      type="button"
                      onClick={() => openReplyEditor(item)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-indigo-500/20 bg-indigo-500/10 py-2 text-xs font-medium text-indigo-300"
                    >
                      <MessageSquareReply className="h-3.5 w-3.5" />
                      {item.reply ? '改回复' : '回复'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDone(item, !item.is_done)}
                      disabled={updatingId === item.id}
                      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl border py-2 text-xs font-medium disabled:opacity-50 ${
                        item.is_done
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      }`}
                    >
                      {item.is_done ? (
                        <Circle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {item.is_done ? '重新打开' : '标记完成'}
                    </button>
                  </div>
                </article>
              );
            })}
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

      {/* Detail Modal */}
      <ResponsiveModal
        open={Boolean(viewingItem)}
        onClose={() => setViewingItem(null)}
        title="用户反馈详情"
        description={viewingItem ? `提交于 ${formatDate(viewingItem.created_at)}` : undefined}
        size="xl"
        footer={
          viewingItem ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const target = viewingItem;
                  setViewingItem(null);
                  openReplyEditor(target);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-xs sm:text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/25"
              >
                <MessageSquareReply className="h-4 w-4" />
                {viewingItem.reply ? '编辑回复' : '撰写回复'}
              </button>
              <button
                type="button"
                onClick={() => setViewingItem(null)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
              >
                关闭
              </button>
            </div>
          ) : undefined
        }
      >
        {viewingItem && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={(typeConfig[viewingItem.feedback_type] ?? { variant: 'default' }).variant}
              >
                {(typeConfig[viewingItem.feedback_type] ?? { label: viewingItem.feedback_type }).label}
              </Badge>
              <Badge variant={viewingItem.is_done ? 'success' : 'warning'} dot>
                {viewingItem.is_done ? '已完成' : '待处理'}
              </Badge>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
                反馈正文
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
                <p className="text-sm text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                  {viewingItem.content}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailItem label="联系方式" value={viewingItem.contact || '未提供'} />
              <DetailItem label="应用版本" value={viewingItem.app_version || '未提供'} />
              <DetailItem label="运行平台" value={viewingItem.platform || '未提供'} />
              <DetailItem
                label="完成时间"
                value={viewingItem.done_at ? formatDate(viewingItem.done_at) : '尚未完成'}
              />
              <DetailItem label="机器码" value={viewingItem.machine_code || '未提供'} mono copyable={Boolean(viewingItem.machine_code)} />
              <DetailItem label="关联 CDK" value={viewingItem.cdk_code || '未提供'} mono copyable={Boolean(viewingItem.cdk_code)} />
            </div>

            {viewingItem.metadata !== null && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
                  客户端附加诊断信息
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3 text-xs text-slate-400 font-mono">
                  {typeof viewingItem.metadata === 'string'
                    ? viewingItem.metadata
                    : JSON.stringify(viewingItem.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
                管理员回复
              </div>
              {viewingItem.reply ? (
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-indigo-300 mb-2">
                    <MessageSquareReply className="h-3.5 w-3.5" />
                    已回复
                    {viewingItem.replied_at && (
                      <span className="text-slate-500 tabular-nums">
                        · {formatDate(viewingItem.replied_at)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                    {viewingItem.reply}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-4 py-6 text-center text-xs sm:text-sm text-slate-500">
                  暂无管理员回复
                </div>
              )}
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Reply Editor Modal */}
      <ResponsiveModal
        open={Boolean(replyingItem)}
        onClose={closeReplyEditor}
        title={replyingItem?.reply ? '编辑反馈回复' : '回复用户反馈'}
        description={
          replyingItem ? (
            <span className="line-clamp-2 block text-slate-400">{replyingItem.content}</span>
          ) : undefined
        }
        size="lg"
      >
        <form onSubmit={handleSaveReply} className="space-y-4">
          <div>
            <textarea
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              maxLength={5000}
              rows={6}
              autoFocus
              placeholder="输入处理结果、修复进度或其他需要告知客户端用户的内容..."
              className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 tabular-nums">
              <span>回复保存后客户端即可拉取查看</span>
              <span>{replyInput.length} / 5000</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeReplyEditor}
              disabled={savingReply}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={savingReply || !replyInput.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-600 hover:to-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {savingReply ? '保存中...' : '保存回复'}
            </button>
          </div>
        </form>
      </ResponsiveModal>
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-xs sm:text-sm text-slate-200 break-all ${mono ? 'font-mono' : ''}`}>
          {value}
        </div>
        {copyable && <CopyButton text={value} />}
      </div>
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
