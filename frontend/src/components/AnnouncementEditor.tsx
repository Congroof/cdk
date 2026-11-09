import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, Megaphone, RefreshCw, Save } from 'lucide-react';
import api from '../api';
import type { Announcement } from '../types';
import { formatDate } from '../utils/format';
import { useToast } from './toastContext';
import Switch from './ui/Switch';
import Badge from './ui/Badge';
import Skeleton from './ui/Skeleton';

const MAX_TITLE_LEN = 128;
const MAX_CONTENT_LEN = 10_000;

export default function AnnouncementEditor() {
  const { toast } = useToast();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleLength = Array.from(title).length;
  const contentLength = Array.from(content).length;

  const applyAnnouncement = useCallback((value: Announcement | null) => {
    setAnnouncement(value);
    setTitle(value?.title ?? '');
    setContent(value?.content ?? '');
    setIsEnabled(value?.is_enabled ?? true);
  }, []);

  const fetchAnnouncement = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/announcement');
      if (res.data.success) {
        applyAnnouncement((res.data.data as Announcement | null) ?? null);
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '公告加载失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [applyAnnouncement, toast]);

  useEffect(() => {
    void Promise.resolve().then(fetchAnnouncement);
  }, [fetchAnnouncement]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle) {
      toast('公告标题不能为空', 'error');
      return;
    }
    if (Array.from(normalizedTitle).length > MAX_TITLE_LEN) {
      toast('公告标题不能超过 128 个字符', 'error');
      return;
    }
    if (!normalizedContent) {
      toast('公告内容不能为空', 'error');
      return;
    }
    if (Array.from(normalizedContent).length > MAX_CONTENT_LEN) {
      toast('公告内容不能超过 10000 个字符', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/announcement', {
        title: normalizedTitle,
        content: normalizedContent,
        is_enabled: isEnabled,
      });
      if (res.data.success) {
        applyAnnouncement(res.data.data as Announcement);
        toast(announcement ? '公告已更新' : '公告已创建', 'success');
      }
    } catch (err: unknown) {
      toast(getErrorMessage(err, '公告保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton rows={4} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
      {/* Editor Column */}
      <form
        onSubmit={handleSubmit}
        className="xl:col-span-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6 space-y-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-400">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">
                  {announcement ? '编辑客户端公告' : '创建客户端公告'}
                </h2>
                <Badge variant={isEnabled ? 'success' : 'default'} dot>
                  {isEnabled ? '已启用' : '草稿停用'}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                公告通过公开接口下发给客户端，停用后客户端将收到空数据。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void fetchAnnouncement()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-2">
            <label htmlFor="announcement-title" className="text-xs sm:text-sm font-medium text-slate-300">
              公告标题
            </label>
            <span
              className={`text-xs tabular-nums ${
                titleLength > MAX_TITLE_LEN ? 'text-rose-400' : 'text-slate-500'
              }`}
            >
              {titleLength} / {MAX_TITLE_LEN}
            </span>
          </div>
          <input
            id="announcement-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：SkinForge v2.4 版本更新与维护通知"
            disabled={saving}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-100 placeholder-slate-500 transition-all focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-2">
            <label htmlFor="announcement-content" className="text-xs sm:text-sm font-medium text-slate-300">
              公告正文
            </label>
            <span
              className={`text-xs tabular-nums ${
                contentLength > MAX_CONTENT_LEN ? 'text-rose-400' : 'text-slate-500'
              }`}
            >
              {contentLength} / {MAX_CONTENT_LEN}
            </span>
          </div>
          <textarea
            id="announcement-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="请输入公告正文，支持多行纯文本段落..."
            disabled={saving}
            rows={11}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 leading-relaxed resize-y transition-all focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <Switch
            checked={isEnabled}
            onChange={setIsEnabled}
            disabled={saving}
            label="对客户端公开启用"
            description="关闭后仍可保存为草稿，但客户端不会展示弹窗或横幅公告"
          />

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? '保存中...' : announcement ? '保存修改' : '发布公告'}
          </button>
        </div>

        {announcement && (
          <div className="text-xs text-slate-500 tabular-nums">
            最后更新时间：{formatDate(announcement.updated_at)}
          </div>
        )}
      </form>

      {/* Live Preview Column */}
      <aside className="xl:col-span-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Eye className="h-4 w-4 text-blue-400" />
            客户端展示实时预览
          </div>
          <Badge variant={isEnabled ? 'brand' : 'default'}>
            {isEnabled ? '客户端可见' : '客户端隐藏'}
          </Badge>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b1120] p-5 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] pb-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <Megaphone className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">
                {title.trim() || '（未填写公告标题）'}
              </div>
              <div className="text-[11px] text-slate-500">系统公告</div>
            </div>
          </div>

          <div className="mt-4 max-h-72 overflow-y-auto text-xs sm:text-sm text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
            {content.trim() || '在左侧输入公告正文后，此处将实时呈现段落排版效果...'}
          </div>
        </div>
      </aside>
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
    ? err.response.data.error
    : fallback;
}
